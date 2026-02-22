/**
 * Witchat — Standalone Socket.io server.
 * Run separately from Next.js so dev gets clean HMR. Client connects via NEXT_PUBLIC_SOCKET_URL.
 */

const { createServer } = require("http");
const { Server } = require("socket.io");
const Sentiment = require("sentiment");
const redis = require("./lib/redis");
const moderation = require("./lib/moderation");

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
const MOOD_NEUTRAL = "neutral";
const MOOD_CALM = "calm";
const MOOD_INTENSE = "intense";
const SIGILS = ["spiral", "eye", "triangle", "cross", "diamond"];
const DEFAULT_ROOM_ID = "main";
const DEFAULT_ROOM_TITLE = process.env.ROOM_TITLE || "the well";
const MOOD_DECAY_MS = 3 * 60 * 1000;
const SILENCE_THRESHOLD_MS = 30 * 1000; // 30 seconds for "settled silence"
let moodDecayTimer = null;
let silenceTimer = null;
const socketIdToIP = new Map(); // Track unique users by IP
const socketFocused = new Map(); // Track who has tab focused
const socketAway = new Map(); // Track who's "stepping away"
const awayTimers = new Map(); // Auto-disconnect after prolonged away
const typingTimers = new Map();
const messageResonance = new Map(); // messageId -> copy count
const RESONANCE_DECAY_MS = 5 * 60 * 1000; // 5 minutes

// Room management
const rooms = new Map(); // roomId -> { title, secret, createdAt, messages, sentiment, lastActivity, presence ghosts }
const socketToRoom = new Map(); // socketId -> roomId

// Active DM conversations (crosstalk) - visible to room but text obscured
const activeDMs = new Map(); // `${roomId}:${color1}:${color2}` (sorted colors) -> { participants, lastActivity }
const dmCleanupTimers = new Map(); // dmKey -> timer (single timer per DM session)
const MAX_ROOMS = 50; // Limit total rooms to prevent DoS (Issue #4)

function getRoomId(roomIdOrSlug) {
  // Normalize room ID: lowercase, alphanumeric + hyphens only
  if (!roomIdOrSlug || typeof roomIdOrSlug !== "string") return DEFAULT_ROOM_ID;
  const normalized = roomIdOrSlug.toLowerCase().trim().replace(/[^a-z0-9-]/g, "").slice(0, 32);
  return normalized || DEFAULT_ROOM_ID;
}

function getOrCreateRoom(roomId, options = {}) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      title: options.title || (roomId === DEFAULT_ROOM_ID ? DEFAULT_ROOM_TITLE : roomId),
      secret: options.secret || false,
      createdAt: Date.now(),
      messages: [],
      sentiment: [],
      lastActivity: Date.now(),
      lastMessageTs: 0,
      silenceState: false,
      presenceGhosts: [],
    });
    logger.info("Room created", { roomId, secret: options.secret || false });
  }
  return rooms.get(roomId);
}

function getRoomPresence(io, roomId) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return 0;
  const ips = new Set();
  for (const socketId of room) {
    const ip = socketIdToIP.get(socketId);
    if (ip) ips.add(ip);
  }
  return ips.size;
}

function getRoomList() {
  const publicRooms = [];
  for (const [id, room] of rooms) {
    if (!room.secret) {
      publicRooms.push({
        id: room.id,
        title: room.title,
        presence: 0, // Will be filled in by caller
        lastActivity: room.lastActivity,
      });
    }
  }
  return publicRooms;
}

// DM key is sorted colors + roomId to ensure consistency and room scoping (Issue #1)
function getDMKey(color1, color2, roomId) {
  return `${roomId}:${[color1, color2].sort().join(":")}`;
}

// Presence Ghosts: track recently departed users (per-room in room.presenceGhosts)
const GHOST_DURATION_MS = 3 * 60 * 1000; // 3 minutes
const AWAY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes before auto-disconnect when away

// Banned IPs (in-memory, resets on restart - could persist to Redis)
const bannedIPs = new Set();

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
  createRoom: { max: 3, windowMs: 60000 },  // 3 room creations per minute (Issue #4)
  total: { max: 200, windowMs: 60000 },     // 200 events per minute (abuse threshold)
};

function getRateLimitBucket(socketId) {
  if (!rateLimits.has(socketId)) {
    rateLimits.set(socketId, { message: [], typing: [], join: [], createRoom: [], total: [] });
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

function broadcastPresence(io, roomId = null) {
  if (roomId) {
    // Broadcast to specific room
    const presence = getRoomPresence(io, roomId);
    io.to(roomId).emit("presence", presence);
  } else {
    // Legacy: broadcast global presence (for backward compat during transition)
    const uniqueIPs = new Set(socketIdToIP.values()).size;
    io.emit("presence", uniqueIPs);
  }
}

// Get attention state - who's focused vs away vs stepping away
function getAttentionState(io, roomId = null) {
  const state = [];
  for (const [socketId, focused] of socketFocused) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock && sock.userColor) {
      // If roomId specified, only include users in that room
      if (roomId && socketToRoom.get(socketId) !== roomId) continue;
      state.push({
        id: socketId, // Issue #3: Include socket.id for unique DM targeting
        color: sock.userColor,
        handle: sock.userHandle || null,
        focused: focused,
        steppingAway: socketAway.get(socketId) || false,
      });
    }
  }
  return state;
}

function broadcastAttention(io, roomId = null) {
  if (roomId) {
    io.to(roomId).emit("attention", getAttentionState(io, roomId));
  } else {
    io.emit("attention", getAttentionState(io));
  }
}

// Clean up old presence ghosts for a room
function cleanPresenceGhosts(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const now = Date.now();
  while (room.presenceGhosts.length > 0 && now - room.presenceGhosts[0].leftAt > GHOST_DURATION_MS) {
    room.presenceGhosts.shift();
  }
}

// Add a presence ghost when someone leaves a room
function addPresenceGhost(color, handle, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  cleanPresenceGhosts(roomId);
  room.presenceGhosts.push({ color, handle, leftAt: Date.now() });
  // Keep max 10 ghosts per room
  while (room.presenceGhosts.length > 10) {
    room.presenceGhosts.shift();
  }
}

// Get current presence ghosts with fade level (0-1) for a room
function getPresenceGhosts(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  cleanPresenceGhosts(roomId);
  const now = Date.now();
  return room.presenceGhosts.map((g) => ({
    color: g.color,
    handle: g.handle,
    fade: Math.min(1, (now - g.leftAt) / GHOST_DURATION_MS),
  }));
}

// Track message resonance (copy events)
function addResonance(messageId) {
  const current = messageResonance.get(messageId) || 0;
  messageResonance.set(messageId, current + 1);
  // Schedule cleanup
  setTimeout(() => {
    messageResonance.delete(messageId);
  }, RESONANCE_DECAY_MS);
  return current + 1;
}

function getResonance(messageId) {
  return messageResonance.get(messageId) || 0;
}

// Issue #6: Extract shared room state sending logic to reduce duplication
function sendRoomState(socket, io, room, roomId) {
  socket.emit("room-joined", {
    id: room.id, // Fix: match RoomInfo type (was "roomId")
    title: room.title,
    secret: room.secret,
  });

  socket.emit("ghosts", room.messages.slice(-MAX_MESSAGES));
  socket.emit("mood", computeCurrentMood(room.sentiment));
  socket.emit("room-title", room.title);
  socket.emit("presence-ghosts", getPresenceGhosts(roomId));
  socket.emit("silence", { settled: room.silenceState, since: room.lastActivity });

  // Send arrival vibe
  const roomPresence = getRoomPresence(io, roomId);
  const timeSinceActivity = room.lastActivity ? Math.floor((Date.now() - room.lastActivity) / 1000) : null;
  let quietFor = null;
  if (timeSinceActivity !== null) {
    if (timeSinceActivity < 60) quietFor = `${timeSinceActivity}s`;
    else if (timeSinceActivity < 3600) quietFor = `${Math.floor(timeSinceActivity / 60)}m`;
    else quietFor = `${Math.floor(timeSinceActivity / 3600)}h`;
  }
  socket.emit("arrival-vibe", {
    presence: roomPresence,
    mood: computeCurrentMood(room.sentiment),
    quietFor: quietFor,
    hasGhosts: room.presenceGhosts.length > 0,
  });
}

function checkSilence(io, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const now = Date.now();
  const isSilent = now - room.lastActivity > SILENCE_THRESHOLD_MS;

  if (isSilent && !room.silenceState) {
    room.silenceState = true;
    io.to(roomId).emit("silence", { settled: true, since: room.lastActivity });
  } else if (!isSilent && room.silenceState) {
    room.silenceState = false;
    io.to(roomId).emit("silence", { settled: false });
  }
}

function checkAllRoomsSilence(io) {
  for (const roomId of rooms.keys()) {
    checkSilence(io, roomId);
  }
}

function startSilenceTimer(io) {
  if (silenceTimer) clearInterval(silenceTimer);
  silenceTimer = setInterval(() => checkAllRoomsSilence(io), 5000); // Check every 5s
}

function recordActivity(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.lastActivity = Date.now();
  room.silenceState = false; // Immediately break silence locally
}

function startMoodDecayTimer(io) {
  if (moodDecayTimer) clearInterval(moodDecayTimer);
  moodDecayTimer = setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms) {
      if (now - room.lastMessageTs > MOOD_DECAY_MS && room.sentiment.length > 0) {
        room.sentiment.push(0);
        if (room.sentiment.length > MAX_SENTIMENT_HISTORY) {
          room.sentiment.shift();
        }
        io.to(roomId).emit("mood", computeCurrentMood(room.sentiment));
      }
    }
  }, 60 * 1000);
}

const serverStartTime = Date.now();

// Initialize Redis
redis.initRedis();

// Initialize default room
getOrCreateRoom(DEFAULT_ROOM_ID, { title: DEFAULT_ROOM_TITLE, secret: false });

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
startSilenceTimer(io);

io.on("connection", (socket) => {
  const clientIP = getClientIP(socket);

  // Check if banned
  if (bannedIPs.has(clientIP)) {
    logger.info("Banned IP attempted connection", { ip: clientIP });
    socket.emit("banned", { reason: "You have been banned." });
    socket.disconnect(true);
    return;
  }

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

    const { color, handle, tag, sigil, roomId: requestedRoomId } = payload || {};
    const clientIP = getClientIP(socket);
    socketIdToIP.set(socket.id, clientIP);
    socketFocused.set(socket.id, true); // Assume focused on join

    // Validate inputs
    const validatedColor = validateColor(color);
    const validatedHandle = validateHandle(handle);
    const validatedTag = validateTag(tag);
    const validatedSigil = validateSigil(sigil);

    socket.userColor = validatedColor || `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
    socket.userHandle = validatedHandle;
    socket.userTag = validatedTag;
    socket.userSigil = validatedSigil || SIGILS[Math.floor(Math.random() * SIGILS.length)];

    // Join the specified room (or default)
    let roomId = getRoomId(requestedRoomId);

    // Fix: Check if room exists; if not and at MAX_ROOMS, fall back to default
    if (!rooms.has(roomId) && roomId !== DEFAULT_ROOM_ID) {
      if (rooms.size >= MAX_ROOMS) {
        roomId = DEFAULT_ROOM_ID;
        logger.warn("MAX_ROOMS reached, falling back to default room", { requestedRoomId, socketId: socket.id });
      }
    }

    const room = getOrCreateRoom(roomId);

    // Leave any previous room
    const prevRoomId = socketToRoom.get(socket.id);
    if (prevRoomId && prevRoomId !== roomId) {
      socket.leave(prevRoomId);
      addPresenceGhost(socket.userColor, socket.userHandle, prevRoomId);
      broadcastPresence(io, prevRoomId);
      broadcastAttention(io, prevRoomId);
      io.to(prevRoomId).emit("presence-ghosts", getPresenceGhosts(prevRoomId));
    }

    // Join new room
    socket.join(roomId);
    socketToRoom.set(socket.id, roomId);
    socket.currentRoom = roomId;

    broadcastPresence(io, roomId);
    broadcastAttention(io, roomId);
    logger.debug("User joined room", { socketId: socket.id, ip: clientIP, roomId });

    socket.emit("identity", {
      color: socket.userColor,
      handle: socket.userHandle,
      tag: socket.userTag,
      sigil: socket.userSigil,
    });

    // Send room state using helper (Issue #6)
    sendRoomState(socket, io, room, roomId);
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

    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
    const room = getOrCreateRoom(roomId);

    // Content moderation
    const modResult = moderation.moderate(trimmed);

    // Block links silently
    if (!modResult.allowed && modResult.reason === "no-links") {
      socket.emit("message-rejected", { reason: "Links are not allowed." });
      logger.info("Link blocked", { socketId: socket.id });
      return;
    }

    // Handle bigotry: mask, force-reveal, broadcast, ban
    if (modResult.isBigotry) {
      const userIP = getClientIP(socket);
      logger.warn("Bigotry detected", {
        socketId: socket.id,
        ip: userIP,
        original: trimmed,
        masked: modResult.maskedText,
      });

      // Force reveal identity - they lose anonymity
      const revealedHandle = socket.userHandle || `anon-${socket.userColor.slice(1, 4)}`;

      // Broadcast the masked message WITH forced attribution (to room only)
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        text: modResult.maskedText,
        color: socket.userColor || "#7b5278",
        handle: revealedHandle,
        tag: socket.userTag || null,
        sigil: socket.userSigil || null,
        whisper: false,
        ts: Date.now(),
        flagged: true, // Mark as moderated
      };

      io.to(roomId).emit("message", msg);
      io.to(roomId).emit("user-banned", {
        color: socket.userColor,
        handle: revealedHandle,
        reason: "bigotry",
      });

      // Ban and disconnect
      bannedIPs.add(userIP);
      socket.emit("banned", { reason: "Bigotry is not tolerated." });
      socket.disconnect(true);
      return;
    }

    room.lastMessageTs = Date.now();
    recordActivity(roomId);
    io.to(roomId).emit("silence", { settled: false }); // Immediately notify silence is broken
    const result = sentiment.analyze(trimmed);
    const energy = energyPenalty(trimmed);
    const effectiveScore = result.score - energy;

    // Store sentiment in room
    room.sentiment.push(effectiveScore);
    if (room.sentiment.length > MAX_SENTIMENT_HISTORY) {
      room.sentiment.shift();
    }

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

    // Store message in room
    room.messages.push(msg);
    if (room.messages.length > MAX_MESSAGES) {
      room.messages.shift();
    }

    io.to(roomId).emit("message", msg);
    io.to(roomId).emit("mood", computeCurrentMood(room.sentiment));
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
    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
    const room = rooms.get(roomId);

    // Update messages in room with new identity info
    if (room) {
      for (const msg of room.messages) {
        if (msg.color === color) {
          msg.handle = socket.userHandle;
          msg.tag = socket.userTag;
          msg.sigil = socket.userSigil || null;
        }
      }
    }

    socket.emit("identity", {
      color,
      handle: socket.userHandle,
      tag: socket.userTag,
      sigil: socket.userSigil,
    });
    io.to(roomId).emit("identity-revealed", {
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

    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
    recordActivity(roomId);
    io.to(roomId).emit("silence", { settled: false }); // Typing breaks silence
    socket.to(roomId).emit("typing", { color: socket.userColor, handle: socket.userHandle });
    // Auto-emit typing-stop after 5 seconds of no activity
    if (typingTimers.has(socket.id)) clearTimeout(typingTimers.get(socket.id));
    typingTimers.set(socket.id, setTimeout(() => {
      socket.to(roomId).emit("typing-stop", { color: socket.userColor });
      typingTimers.delete(socket.id);
    }, 5000));
  });

  socket.on("typing-stop", () => {
    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
    socket.to(roomId).emit("typing-stop", { color: socket.userColor });
    if (typingTimers.has(socket.id)) {
      clearTimeout(typingTimers.get(socket.id));
      typingTimers.delete(socket.id);
    }
  });

  socket.on("ping", () => socket.emit("pong"));

  // Attention tracking - focus/blur
  socket.on("focus", () => {
    socketFocused.set(socket.id, true);
    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
    broadcastAttention(io, roomId);
  });

  socket.on("blur", () => {
    socketFocused.set(socket.id, false);
    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
    broadcastAttention(io, roomId);
  });

  // Affirmation - silent "I hear you" pulse
  socket.on("affirm", (messageId) => {
    if (!messageId || typeof messageId !== "string") return;
    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
    io.to(roomId).emit("affirmation", {
      messageId,
      color: socket.userColor || "#7b5278",
    });
  });

  // Deliberate departure - "stepping away"
  socket.on("away", () => {
    socketAway.set(socket.id, true);
    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
    broadcastAttention(io, roomId);
    io.to(roomId).emit("user-away", {
      color: socket.userColor,
      handle: socket.userHandle,
    });
    // Auto-disconnect after timeout
    if (awayTimers.has(socket.id)) clearTimeout(awayTimers.get(socket.id));
    awayTimers.set(socket.id, setTimeout(() => {
      if (socketAway.get(socket.id)) {
        socket.disconnect(true);
      }
    }, AWAY_TIMEOUT_MS));
  });

  socket.on("back", () => {
    const wasAway = socketAway.get(socket.id);
    socketAway.delete(socket.id);
    if (awayTimers.has(socket.id)) {
      clearTimeout(awayTimers.get(socket.id));
      awayTimers.delete(socket.id);
    }
    if (wasAway) {
      const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
      broadcastAttention(io, roomId);
      io.to(roomId).emit("user-back", {
        color: socket.userColor,
        handle: socket.userHandle,
      });
    }
  });

  socket.on("copy", (payload) => {
    const messageId = typeof payload === "object" ? payload?.messageId : null;
    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
    io.to(roomId).emit("copy", {
      color: socket.userColor || "#7b5278",
      handle: socket.userHandle || null,
    });
    // Track resonance if we know which message was copied
    if (messageId) {
      const resonance = addResonance(messageId);
      io.to(roomId).emit("resonance", { messageId, count: resonance });
    }
  });

  // Summoning: gently ping an idle user by handle (within same room)
  socket.on("summon", (target) => {
    if (!target || typeof target !== "string") return;
    const targetLower = target.toLowerCase().trim();
    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
    // Find socket with that handle in the same room
    for (const [, s] of io.sockets.sockets) {
      if (s.id !== socket.id && s.userHandle && s.userHandle.toLowerCase() === targetLower) {
        const targetRoomId = socketToRoom.get(s.id);
        if (targetRoomId === roomId) {
          s.emit("summoned", {
            byColor: socket.userColor,
            byHandle: socket.userHandle,
          });
          // Notify the summoner it worked
          socket.emit("summon-sent", { target: s.userHandle });
          return;
        }
      }
    }
    // Handle not found
    socket.emit("summon-failed", { target, reason: "not-found" });
  });

  // Room management
  socket.on("list-rooms", () => {
    const roomList = getRoomList().map((r) => ({
      ...r,
      presence: getRoomPresence(io, r.id),
    }));
    socket.emit("room-list", roomList);
  });

  socket.on("create-room", (payload) => {
    // Issue #4: Rate limit room creation
    const rateCheck = checkRateLimit(socket.id, "createRoom");
    if (!rateCheck.allowed) {
      socket.emit("room-create-failed", { reason: "Too many room creations. Please wait." });
      return;
    }

    const { title, secret } = payload || {};
    if (!title || typeof title !== "string") {
      socket.emit("room-create-failed", { reason: "Title required" });
      return;
    }

    // Issue #4: Enforce MAX_ROOMS cap to prevent DoS
    if (rooms.size >= MAX_ROOMS) {
      socket.emit("room-create-failed", { reason: "Maximum room limit reached" });
      return;
    }

    const sanitizedTitle = title.trim().slice(0, 64);
    const roomId = getRoomId(sanitizedTitle.replace(/\s+/g, "-"));

    if (rooms.has(roomId)) {
      socket.emit("room-create-failed", { reason: "Room already exists" });
      return;
    }

    getOrCreateRoom(roomId, { title: sanitizedTitle, secret: !!secret });
    socket.emit("room-created", { roomId, title: sanitizedTitle, secret: !!secret });

    // Broadcast updated room list to everyone (excluding secret rooms)
    if (!secret) {
      const roomList = getRoomList().map((r) => ({
        ...r,
        presence: getRoomPresence(io, r.id),
      }));
      io.emit("room-list", roomList);
    }
  });

  socket.on("delete-room", (payload) => {
    const { roomId: targetRoomId } = payload || {};
    if (!targetRoomId || typeof targetRoomId !== "string") {
      socket.emit("room-delete-failed", { reason: "Room ID required" });
      return;
    }

    const roomId = getRoomId(targetRoomId);

    // Can't delete the default room
    if (roomId === DEFAULT_ROOM_ID) {
      socket.emit("room-delete-failed", { reason: "Cannot delete the main room" });
      return;
    }

    // Check if room exists
    if (!rooms.has(roomId)) {
      socket.emit("room-delete-failed", { reason: "Room not found" });
      return;
    }

    // Check if room is empty
    const presence = getRoomPresence(io, roomId);
    if (presence > 0) {
      socket.emit("room-delete-failed", { reason: "Room must be empty to delete" });
      return;
    }

    // Delete the room
    const room = rooms.get(roomId);
    const wasSecret = room.secret;

    // Fix: Clean up orphaned DM timers for this room
    for (const [dmKey, timer] of dmCleanupTimers) {
      if (dmKey.startsWith(`${roomId}:`)) {
        clearTimeout(timer);
        dmCleanupTimers.delete(dmKey);
        activeDMs.delete(dmKey);
      }
    }

    rooms.delete(roomId);
    logger.info("Room deleted", { roomId });

    socket.emit("room-deleted", { roomId });

    // Broadcast updated room list (if it was public)
    if (!wasSecret) {
      const roomList = getRoomList().map((r) => ({
        ...r,
        presence: getRoomPresence(io, r.id),
      }));
      io.emit("room-list", roomList);
    }
  });

  socket.on("switch-room", (payload) => {
    const { roomId: targetRoomId } = payload || {};
    if (!targetRoomId || typeof targetRoomId !== "string") {
      socket.emit("room-switch-failed", { reason: "Room ID required" });
      return;
    }

    const roomId = getRoomId(targetRoomId);
    const currentRoomId = socketToRoom.get(socket.id);

    if (currentRoomId === roomId) {
      // Already in this room
      return;
    }

    // Issue #2: Only allow switching to existing rooms or default room (no implicit creation)
    if (!rooms.has(roomId) && roomId !== DEFAULT_ROOM_ID) {
      socket.emit("room-switch-failed", { reason: "Room does not exist" });
      return;
    }

    // Leave current room
    if (currentRoomId) {
      socket.leave(currentRoomId);
      addPresenceGhost(socket.userColor, socket.userHandle, currentRoomId);
      broadcastPresence(io, currentRoomId);
      broadcastAttention(io, currentRoomId);
      io.to(currentRoomId).emit("presence-ghosts", getPresenceGhosts(currentRoomId));
    }

    // Join new room (getOrCreateRoom is safe here since we validated above)
    const room = getOrCreateRoom(roomId);
    socket.join(roomId);
    socketToRoom.set(socket.id, roomId);
    socket.currentRoom = roomId;

    broadcastPresence(io, roomId);
    broadcastAttention(io, roomId);

    // Send room state using helper (Issue #6)
    sendRoomState(socket, io, room, roomId);
  });

  // DM (Crosstalk) - visible to room but text obscured
  socket.on("dm", (payload) => {
    // Issue #3: Support targetSocketId for unique identification, fall back to targetColor
    const { targetColor, targetSocketId, text } = payload || {};
    if ((!targetColor && !targetSocketId) || !text || typeof text !== "string") return;
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;

    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
    const senderColor = socket.userColor;

    // Find target socket - prefer socketId if provided for unique identification
    let targetSocket = null;
    if (targetSocketId) {
      const sock = io.sockets.sockets.get(targetSocketId);
      if (sock && socketToRoom.get(sock.id) === roomId) {
        targetSocket = sock;
      }
    } else {
      // Fall back to color matching (legacy)
      for (const [, s] of io.sockets.sockets) {
        if (s.userColor === targetColor && socketToRoom.get(s.id) === roomId) {
          targetSocket = s;
          break;
        }
      }
    }

    if (!targetSocket) {
      socket.emit("dm-failed", { reason: "User not in room" });
      return;
    }

    const resolvedTargetColor = targetSocket.userColor;
    const dmKey = getDMKey(senderColor, resolvedTargetColor, roomId);

    // Track active DM for visibility
    activeDMs.set(dmKey, {
      participants: [senderColor, resolvedTargetColor],
      lastActivity: Date.now(),
    });

    // Single timer per DM session - clears 30s after last message
    if (dmCleanupTimers.has(dmKey)) {
      clearTimeout(dmCleanupTimers.get(dmKey));
    }
    dmCleanupTimers.set(dmKey, setTimeout(() => {
      activeDMs.delete(dmKey);
      dmCleanupTimers.delete(dmKey);
      io.to(roomId).emit("crosstalk-ended", { participants: [senderColor, resolvedTargetColor] });
    }, 30000));

    const msg = {
      id: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      text: trimmed,
      color: senderColor,
      handle: socket.userHandle || null,
      sigil: socket.userSigil || null,
      targetColor: resolvedTargetColor,
      targetSocketId: targetSocket.id, // Include for client reference
      targetHandle: targetSocket.userHandle || null,
      ts: Date.now(),
    };

    // Send full message to sender and recipient
    socket.emit("dm-received", msg);
    targetSocket.emit("dm-received", msg);

    // Broadcast to room that DM is happening (crosstalk - visible but obscured)
    io.to(roomId).emit("crosstalk", {
      participants: [
        { color: senderColor, handle: socket.userHandle },
        { color: resolvedTargetColor, handle: targetSocket.userHandle },
      ],
      ts: Date.now(),
    });
  });

  // DM typing indicator
  socket.on("dm-typing", (payload) => {
    // Rate limit typing events (reuse typing limit)
    const rateCheck = checkRateLimit(socket.id, "typing");
    if (!rateCheck.allowed) return;

    const { targetColor, targetSocketId } = payload || {};
    if (!targetColor && !targetSocketId) return;

    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;

    // Issue #3: Support targetSocketId for unique identification
    if (targetSocketId) {
      const targetSock = io.sockets.sockets.get(targetSocketId);
      if (targetSock && socketToRoom.get(targetSock.id) === roomId) {
        targetSock.emit("dm-typing", { color: socket.userColor, handle: socket.userHandle });
        return;
      }
    }

    // Fall back to color matching (legacy)
    for (const [, s] of io.sockets.sockets) {
      if (s.userColor === targetColor && socketToRoom.get(s.id) === roomId) {
        s.emit("dm-typing", { color: socket.userColor, handle: socket.userHandle });
        return;
      }
    }
  });

  socket.on("disconnect", () => {
    const roomId = socketToRoom.get(socket.id) || DEFAULT_ROOM_ID;
    // Add to presence ghosts before removing
    if (socket.userColor) {
      addPresenceGhost(socket.userColor, socket.userHandle, roomId);
      io.to(roomId).emit("presence-ghosts", getPresenceGhosts(roomId));
    }
    socketIdToIP.delete(socket.id);
    socketFocused.delete(socket.id);
    socketAway.delete(socket.id);
    socketToRoom.delete(socket.id);
    if (awayTimers.has(socket.id)) {
      clearTimeout(awayTimers.get(socket.id));
      awayTimers.delete(socket.id);
    }
    cleanupRateLimits(socket.id);
    if (typingTimers.has(socket.id)) {
      clearTimeout(typingTimers.get(socket.id));
      typingTimers.delete(socket.id);
    }
    broadcastPresence(io, roomId);
    broadcastAttention(io, roomId);
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
  if (silenceTimer) clearInterval(silenceTimer);
  for (const timer of typingTimers.values()) {
    clearTimeout(timer);
  }
  typingTimers.clear();
  for (const timer of awayTimers.values()) {
    clearTimeout(timer);
  }
  awayTimers.clear();
  for (const timer of dmCleanupTimers.values()) {
    clearTimeout(timer);
  }
  dmCleanupTimers.clear();

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
