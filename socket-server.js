/**
 * Witchat — Standalone Socket.io server.
 * Run separately from Next.js so dev gets clean HMR. Client connects via NEXT_PUBLIC_SOCKET_URL.
 */

const { createServer } = require("http");
const { Server } = require("socket.io");
const Sentiment = require("sentiment");

const PORT = parseInt(process.env.SOCKET_PORT || "4001", 10);
// When CORS_ORIGIN unset: allow all (dev). When set: comma-separated list (prod).
const CORS_ORIGIN = process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.trim();
const corsOpt = CORS_ORIGIN
  ? {
      origin: CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),
      methods: ["GET", "POST"],
    }
  : { origin: true, methods: ["GET", "POST"] };

const sentiment = new Sentiment();
const MAX_MESSAGES = 3;
const recentMessages = [];
const sentimentHistory = [];
const MOOD_NEUTRAL = "neutral";
const MOOD_CALM = "calm";
const MOOD_INTENSE = "intense";
const SIGILS = ["spiral", "eye", "triangle", "cross", "diamond"];
const ROOM_TITLE = process.env.ROOM_TITLE || "the well";
const MOOD_DECAY_MS = 3 * 60 * 1000;
let lastMessageTs = 0;
let moodDecayTimer = null;
const socketIdToClientId = new Map();

function getMoodFromScore(avgScore) {
  if (avgScore < -0.4) return MOOD_INTENSE;
  if (avgScore > 0.4) return MOOD_CALM;
  return MOOD_NEUTRAL;
}

function energyPenalty(text) {
  if (!text || text.length === 0) return 0;
  const letters = text.replace(/\s/g, "").replace(/[^a-zA-Z]/g, "");
  const caps = (text.match(/[A-Z]/g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;
  const mostlyCaps = letters.length > 0 && caps / letters.length > 0.6;
  return (mostlyCaps ? 0.6 : 0) + Math.min(exclamations * 0.25, 0.8);
}

function computeCurrentMood() {
  if (sentimentHistory.length === 0) return MOOD_NEUTRAL;
  const avg = sentimentHistory.reduce((a, b) => a + b, 0) / sentimentHistory.length;
  return getMoodFromScore(avg);
}

function broadcastPresence(io) {
  const count = new Set(socketIdToClientId.values()).size;
  io.emit("presence", count);
}

function startMoodDecayTimer(io) {
  if (moodDecayTimer) clearInterval(moodDecayTimer);
  moodDecayTimer = setInterval(() => {
    if (Date.now() - lastMessageTs > MOOD_DECAY_MS && sentimentHistory.length > 0) {
      sentimentHistory.push(0);
      if (sentimentHistory.length > 5) sentimentHistory.shift();
      io.emit("mood", computeCurrentMood());
    }
  }, 60 * 1000);
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Witchat Socket server");
});

const io = new Server(httpServer, {
  path: "/api/socketio",
  addTrailingSlash: false,
  cors: corsOpt,
});

startMoodDecayTimer(io);

io.on("connection", (socket) => {
  console.log("[Witchat] Client connected");
  socket.on("join", (payload) => {
    const { color, handle, tag, sigil, clientId } = payload || {};
    const cid = clientId && typeof clientId === "string" ? clientId.slice(0, 64) : socket.id;
    socketIdToClientId.set(socket.id, cid);
    broadcastPresence(io);
    socket.userColor = color || `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
    socket.userHandle = handle || null;
    socket.userTag = tag ? String(tag).slice(0, 16).trim() : null;
    socket.userSigil =
      sigil && SIGILS.includes(sigil) ? sigil : SIGILS[Math.floor(Math.random() * SIGILS.length)];
    socket.emit("identity", {
      color: socket.userColor,
      handle: socket.userHandle,
      tag: socket.userTag,
      sigil: socket.userSigil,
    });
    socket.emit("stream", []);
    socket.emit("mood", computeCurrentMood());
    socket.emit("room-title", ROOM_TITLE);
  });

  socket.on("message", (payload) => {
    const text = typeof payload === "string" ? payload : payload?.text;
    const whisper = typeof payload === "object" && payload?.whisper === true;
    if (!text || typeof text !== "string") return;
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;

    lastMessageTs = Date.now();
    const result = sentiment.analyze(trimmed);
    const energy = energyPenalty(trimmed);
    const effectiveScore = result.score - energy;
    sentimentHistory.push(effectiveScore);
    if (sentimentHistory.length > 5) sentimentHistory.shift();

    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      text: trimmed,
      color: socket.userColor || "#7b5278",
      handle: socket.userHandle || null,
      tag: socket.userTag || null,
      sigil: socket.userSigil || null,
      whisper: whisper,
      ts: Date.now(),
    };

    recentMessages.push(msg);
    if (recentMessages.length > MAX_MESSAGES) recentMessages.shift();

    io.emit("message", msg);
    io.emit("mood", computeCurrentMood());
  });

  socket.on("reveal", (payload) => {
    const handle = typeof payload === "string" ? payload : payload?.handle;
    const tag = typeof payload === "object" && payload?.tag !== undefined ? payload.tag : undefined;
    const sigil = typeof payload === "object" && payload?.sigil != null ? payload.sigil : undefined;
    socket.userHandle = handle ? String(handle).slice(0, 32) : null;
    socket.userTag = tag !== undefined && tag !== null ? String(tag).slice(0, 16).trim() : null;
    if (sigil && SIGILS.includes(sigil)) socket.userSigil = sigil;
    const color = socket.userColor || "#7b5278";
    for (const msg of recentMessages) {
      if (msg.color === color) {
        msg.handle = socket.userHandle;
        msg.tag = socket.userTag;
        msg.sigil = socket.userSigil || null;
      }
    }
    socket.emit("identity", {
      color,
      handle: socket.userHandle,
      tag: socket.userTag,
      sigil: socket.userSigil,
    });
    io.emit("identity-revealed", {
      color,
      handle: socket.userHandle,
      tag: socket.userTag,
      sigil: socket.userSigil || null,
    });
  });

  socket.on("typing", () => {
    socket.broadcast.emit("typing", { color: socket.userColor, handle: socket.userHandle });
  });
  socket.on("typing-stop", () => {
    socket.broadcast.emit("typing-stop", { color: socket.userColor });
  });

  socket.on("ping", () => socket.emit("pong"));
  socket.on("copy", () => {
    io.emit("copy", {
      color: socket.userColor || "#7b5278",
      handle: socket.userHandle || null,
    });
  });
  socket.on("disconnect", () => {
    socketIdToClientId.delete(socket.id);
    broadcastPresence(io);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[Witchat] Socket server listening on http://localhost:${PORT}`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`> Port ${PORT} is already in use. Free it with:\n   fuser -k ${PORT}/tcp\n   Then run again.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
