/**
 * Witchat — Standalone Socket.io server.
 * Run separately from Next.js so dev gets clean HMR. Client connects via NEXT_PUBLIC_SOCKET_URL.
 */

const { createServer } = require("http");
const { Server } = require("socket.io");
const Sentiment = require("sentiment");
const redis = require("./lib/redis");

// Structured logger
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;
const logger = {
  _log(level, message, data = {}) {
    if (LOG_LEVELS[level] > LOG_LEVEL) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    };
    const output = JSON.stringify(entry);
    if (level === "error") console.error(output);
    else if (level === "warn") console.warn(output);
    else console.log(output);
  },
  info: (msg, data) => logger._log("info", msg, data),
  warn: (msg, data) => logger._log("warn", msg, data),
  error: (msg, data) => logger._log("error", msg, data),
  debug: (msg, data) => logger._log("debug", msg, data),
};

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
const MAX_SENTIMENT_HISTORY = 5;
// In-memory caches (synced with Redis when available)
let recentMessagesCache = [];
let sentimentHistoryCache = [];
const MOOD_NEUTRAL = "neutral";
const MOOD_CALM = "calm";
const MOOD_INTENSE = "intense";
const SIGILS = ["spiral", "eye", "triangle", "cross", "diamond"];
const ROOM_TITLE = process.env.ROOM_TITLE || "the well";
const MOOD_DECAY_MS = 3 * 60 * 1000;
let lastMessageTs = 0;
let moodDecayTimer = null;
const socketIdToIP = new Map(); // Track unique users by IP
const typingTimers = new Map();

// Get client IP from socket (handles Cloudflare and other proxies)
function getClientIP(socket) {
  const headers = socket.handshake.headers;
  // Cloudflare's real IP header
  if (headers["cf-connecting-ip"]) {
    return headers["cf-connecting-ip"];
  }
  // Standard proxy header
  if (headers["x-forwarded-for"]) {
    return headers["x-forwarded-for"].split(",")[0].trim();
  }
  // True-Client-IP (some CDNs)
  if (headers["true-client-ip"]) {
    return headers["true-client-ip"];
  }
  return socket.handshake.address;
}

// Rate limiting
const rateLimits = new Map(); // socketId -> { messages: [], typing: [], join: [], total: [] }
const RATE_LIMITS = {
  message: { max: 15, windowMs: 10000 },    // 15 messages per 10 seconds
  typing: { max: 10, windowMs: 1000 },      // 10 typing events per second
  join: { max: 5, windowMs: 10000 },        // 5 joins per 10 seconds (allows reconnects)
  total: { max: 200, windowMs: 60000 },     // 200 events per minute (abuse threshold)
};

function getRateLimitBucket(socketId) {
  if (!rateLimits.has(socketId)) {
    rateLimits.set(socketId, { message: [], typing: [], join: [], total: [] });
  }
  return rateLimits.get(socketId);
}

function checkRateLimit(socketId, eventType) {
  const bucket = getRateLimitBucket(socketId);
  const now = Date.now();
  const config = RATE_LIMITS[eventType];
  if (!config) return { allowed: true };

  // Clean old entries
  bucket[eventType] = bucket[eventType].filter((ts) => now - ts < config.windowMs);
  bucket.total = bucket.total.filter((ts) => now - ts < RATE_LIMITS.total.windowMs);

  // Check total abuse threshold
  if (bucket.total.length >= RATE_LIMITS.total.max) {
    return { allowed: false, reason: "abuse", remaining: 0 };
  }

  // Check specific limit
  if (bucket[eventType].length >= config.max) {
    return { allowed: false, reason: "rate-limited", remaining: 0 };
  }

  // Record this event
  bucket[eventType].push(now);
  bucket.total.push(now);
  return { allowed: true, remaining: config.max - bucket[eventType].length };
}

function cleanupRateLimits(socketId) {
  rateLimits.delete(socketId);
}

// Input validation
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const HANDLE_REGEX = /^[a-zA-Z0-9 ]{1,32}$/;
const TAG_REGEX = /^[a-zA-Z0-9]{1,16}$/;

function validateColor(color) {
  if (!color || typeof color !== "string") return null;
  return HEX_COLOR_REGEX.test(color) ? color : null;
}

function validateHandle(handle) {
  if (!handle || typeof handle !== "string") return null;
  const trimmed = handle.trim().slice(0, 32);
  return HANDLE_REGEX.test(trimmed) ? trimmed : null;
}

function validateTag(tag) {
  if (!tag || typeof tag !== "string") return null;
  const trimmed = tag.trim().slice(0, 16);
  return TAG_REGEX.test(trimmed) ? trimmed : null;
}

function validateSigil(sigil) {
  if (!sigil || typeof sigil !== "string") return null;
  return SIGILS.includes(sigil) ? sigil : null;
}

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

function computeCurrentMood(history) {
  const hist = history || sentimentHistoryCache;
  if (hist.length === 0) return MOOD_NEUTRAL;
  const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
  return getMoodFromScore(avg);
}

async function computeCurrentMoodAsync() {
  const history = await redis.getSentimentHistory(MAX_SENTIMENT_HISTORY);
  sentimentHistoryCache = history;
  return computeCurrentMood(history);
}

function broadcastPresence(io) {
  const uniqueIPs = new Set(socketIdToIP.values()).size;
  io.emit("presence", uniqueIPs);
}

function startMoodDecayTimer(io) {
  if (moodDecayTimer) clearInterval(moodDecayTimer);
  moodDecayTimer = setInterval(async () => {
    if (Date.now() - lastMessageTs > MOOD_DECAY_MS && sentimentHistoryCache.length > 0) {
      await redis.addSentiment(0, MAX_SENTIMENT_HISTORY);
      sentimentHistoryCache = await redis.getSentimentHistory(MAX_SENTIMENT_HISTORY);
      io.emit("mood", computeCurrentMood());
    }
  }, 60 * 1000);
}

const serverStartTime = Date.now();

// Initialize Redis
redis.initRedis();

const httpServer = createServer((req, res) => {
  // Health check endpoint
  if (req.url === "/health" && req.method === "GET") {
    const health = {
      status: "ok",
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      connections: new Set(socketIdToIP.values()).size,
      redis: redis.isAvailable() ? "connected" : "unavailable",
      timestamp: new Date().toISOString(),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(health));
    return;
  }
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
  logger.info("Client connected", { socketId: socket.id });

  socket.on("join", async (payload) => {
    // Rate limit join events
    const rateCheck = checkRateLimit(socket.id, "join");
    if (!rateCheck.allowed) {
      socket.emit("rate-limited", { event: "join", reason: rateCheck.reason });
      if (rateCheck.reason === "abuse") {
        logger.warn("Abuse detected, disconnecting", { socketId: socket.id });
        socket.disconnect(true);
      }
      return;
    }

    const { color, handle, tag, sigil } = payload || {};
    const clientIP = getClientIP(socket);
    socketIdToIP.set(socket.id, clientIP);
    broadcastPresence(io);
    logger.debug("User joined", { socketId: socket.id, ip: clientIP });

    // Validate inputs
    const validatedColor = validateColor(color);
    const validatedHandle = validateHandle(handle);
    const validatedTag = validateTag(tag);
    const validatedSigil = validateSigil(sigil);

    socket.userColor = validatedColor || `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
    socket.userHandle = validatedHandle;
    socket.userTag = validatedTag;
    socket.userSigil = validatedSigil || SIGILS[Math.floor(Math.random() * SIGILS.length)];

    socket.emit("identity", {
      color: socket.userColor,
      handle: socket.userHandle,
      tag: socket.userTag,
      sigil: socket.userSigil,
    });

    // Orality: new users don't get previous messages (like joining a conversation in progress)
    // Existing users who refresh will restore from sessionStorage on the client side
    socket.emit("stream", []);
    const mood = await computeCurrentMoodAsync();
    socket.emit("mood", mood);
    socket.emit("room-title", ROOM_TITLE);
  });

  socket.on("message", async (payload) => {
    // Rate limit messages
    const rateCheck = checkRateLimit(socket.id, "message");
    if (!rateCheck.allowed) {
      socket.emit("rate-limited", { event: "message", reason: rateCheck.reason });
      if (rateCheck.reason === "abuse") {
        logger.warn("Abuse detected, disconnecting", { socketId: socket.id });
        socket.disconnect(true);
      }
      return;
    }

    const text = typeof payload === "string" ? payload : payload?.text;
    const whisper = typeof payload === "object" && payload?.whisper === true;
    if (!text || typeof text !== "string") return;
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;

    lastMessageTs = Date.now();
    const result = sentiment.analyze(trimmed);
    const energy = energyPenalty(trimmed);
    const effectiveScore = result.score - energy;

    // Store sentiment in Redis
    await redis.addSentiment(effectiveScore, MAX_SENTIMENT_HISTORY);
    sentimentHistoryCache = await redis.getSentimentHistory(MAX_SENTIMENT_HISTORY);

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

    // Store message in Redis
    await redis.addMessage(msg, MAX_MESSAGES);
    recentMessagesCache = await redis.getMessages(MAX_MESSAGES);

    io.emit("message", msg);
    io.emit("mood", computeCurrentMood());
  });

  socket.on("reveal", async (payload) => {
    const handle = typeof payload === "string" ? payload : payload?.handle;
    const tag = typeof payload === "object" && payload?.tag !== undefined ? payload.tag : undefined;
    const sigil = typeof payload === "object" && payload?.sigil != null ? payload.sigil : undefined;

    // Validate inputs
    socket.userHandle = validateHandle(handle);
    socket.userTag = validateTag(tag);
    const validatedSigil = validateSigil(sigil);
    if (validatedSigil) socket.userSigil = validatedSigil;

    const color = socket.userColor || "#7b5278";

    // Update messages in Redis with new identity info
    await redis.updateMessagesByColor(color, {
      handle: socket.userHandle,
      tag: socket.userTag,
      sigil: socket.userSigil || null,
    });
    recentMessagesCache = await redis.getMessages(MAX_MESSAGES);

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
    // Rate limit typing events
    const rateCheck = checkRateLimit(socket.id, "typing");
    if (!rateCheck.allowed) {
      if (rateCheck.reason === "abuse") {
        logger.warn("Abuse detected, disconnecting", { socketId: socket.id });
        socket.disconnect(true);
      }
      return;
    }

    socket.broadcast.emit("typing", { color: socket.userColor, handle: socket.userHandle });
    // Auto-emit typing-stop after 5 seconds of no activity
    if (typingTimers.has(socket.id)) clearTimeout(typingTimers.get(socket.id));
    typingTimers.set(socket.id, setTimeout(() => {
      socket.broadcast.emit("typing-stop", { color: socket.userColor });
      typingTimers.delete(socket.id);
    }, 5000));
  });

  socket.on("typing-stop", () => {
    socket.broadcast.emit("typing-stop", { color: socket.userColor });
    if (typingTimers.has(socket.id)) {
      clearTimeout(typingTimers.get(socket.id));
      typingTimers.delete(socket.id);
    }
  });

  socket.on("ping", () => socket.emit("pong"));

  socket.on("copy", () => {
    io.emit("copy", {
      color: socket.userColor || "#7b5278",
      handle: socket.userHandle || null,
    });
  });

  socket.on("disconnect", () => {
    socketIdToIP.delete(socket.id);
    cleanupRateLimits(socket.id);
    if (typingTimers.has(socket.id)) {
      clearTimeout(typingTimers.get(socket.id));
      typingTimers.delete(socket.id);
    }
    broadcastPresence(io);
  });
});

httpServer.listen(PORT, () => {
  logger.info("Socket server started", { port: PORT, url: `http://localhost:${PORT}` });
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    logger.error("Port already in use", { port: PORT, hint: `fuser -k ${PORT}/tcp` });
  } else {
    logger.error("Server error", { error: err.message });
  }
  process.exit(1);
});

// Graceful shutdown
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("Shutdown initiated", { signal });

  // Notify connected clients
  io.emit("server-shutdown", { message: "Server is shutting down" });

  // Clear all timers
  if (moodDecayTimer) clearInterval(moodDecayTimer);
  for (const timer of typingTimers.values()) {
    clearTimeout(timer);
  }
  typingTimers.clear();

  // Close all socket connections gracefully
  io.close(async () => {
    logger.info("All connections closed");
    await redis.closeRedis();
    logger.info("Redis closed");
    httpServer.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.warn("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
