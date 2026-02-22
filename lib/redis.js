/**
 * Redis client wrapper for Witch@.
 * Provides graceful fallback to in-memory storage if Redis is unavailable.
 */

const Redis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL;
const MESSAGES_KEY = "witchat:messages";
const SENTIMENT_KEY = "witchat:sentiment";
const MESSAGE_TTL = 24 * 60 * 60; // 24 hours in seconds

let redis = null;
let isRedisAvailable = false;

// In-memory fallback storage
const memoryStore = {
  messages: [],
  sentiment: [],
};

function initRedis() {
  if (!REDIS_URL) {
    console.log("[Redis] No REDIS_URL configured, using in-memory storage");
    return null;
  }

  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          console.warn("[Redis] Max retries reached, falling back to in-memory");
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on("connect", () => {
      console.log("[Redis] Connected");
      isRedisAvailable = true;
    });

    redis.on("error", (err) => {
      console.error("[Redis] Error:", err.message);
      isRedisAvailable = false;
    });

    redis.on("close", () => {
      console.log("[Redis] Connection closed");
      isRedisAvailable = false;
    });

    redis.connect().catch((err) => {
      console.warn("[Redis] Failed to connect:", err.message);
      isRedisAvailable = false;
    });

    return redis;
  } catch (err) {
    console.warn("[Redis] Initialization failed:", err.message);
    return null;
  }
}

async function getMessages(maxMessages = 3) {
  if (isRedisAvailable && redis) {
    try {
      const messages = await redis.lrange(MESSAGES_KEY, -maxMessages, -1);
      return messages.map((m) => JSON.parse(m));
    } catch (err) {
      console.error("[Redis] getMessages error:", err.message);
    }
  }
  return memoryStore.messages.slice(-maxMessages);
}

async function addMessage(message, maxMessages = 3) {
  if (isRedisAvailable && redis) {
    try {
      await redis.rpush(MESSAGES_KEY, JSON.stringify(message));
      await redis.ltrim(MESSAGES_KEY, -maxMessages, -1);
      await redis.expire(MESSAGES_KEY, MESSAGE_TTL);
      return;
    } catch (err) {
      console.error("[Redis] addMessage error:", err.message);
    }
  }
  // Fallback to memory
  memoryStore.messages.push(message);
  if (memoryStore.messages.length > maxMessages) {
    memoryStore.messages.shift();
  }
}

async function updateMessagesByColor(color, updates) {
  if (isRedisAvailable && redis) {
    try {
      const messages = await redis.lrange(MESSAGES_KEY, 0, -1);
      const updated = messages.map((m) => {
        const msg = JSON.parse(m);
        if (msg.color === color) {
          return JSON.stringify({ ...msg, ...updates });
        }
        return m;
      });
      await redis.del(MESSAGES_KEY);
      if (updated.length > 0) {
        await redis.rpush(MESSAGES_KEY, ...updated);
        await redis.expire(MESSAGES_KEY, MESSAGE_TTL);
      }
      return;
    } catch (err) {
      console.error("[Redis] updateMessagesByColor error:", err.message);
    }
  }
  // Fallback to memory
  for (const msg of memoryStore.messages) {
    if (msg.color === color) {
      Object.assign(msg, updates);
    }
  }
}

async function getSentimentHistory(maxHistory = 5) {
  if (isRedisAvailable && redis) {
    try {
      const history = await redis.lrange(SENTIMENT_KEY, -maxHistory, -1);
      return history.map((s) => parseFloat(s));
    } catch (err) {
      console.error("[Redis] getSentimentHistory error:", err.message);
    }
  }
  return memoryStore.sentiment.slice(-maxHistory);
}

async function addSentiment(score, maxHistory = 5) {
  if (isRedisAvailable && redis) {
    try {
      await redis.rpush(SENTIMENT_KEY, score.toString());
      await redis.ltrim(SENTIMENT_KEY, -maxHistory, -1);
      await redis.expire(SENTIMENT_KEY, MESSAGE_TTL);
      return;
    } catch (err) {
      console.error("[Redis] addSentiment error:", err.message);
    }
  }
  // Fallback to memory
  memoryStore.sentiment.push(score);
  if (memoryStore.sentiment.length > maxHistory) {
    memoryStore.sentiment.shift();
  }
}

async function closeRedis() {
  if (redis) {
    try {
      await redis.quit();
    } catch (err) {
      console.error("[Redis] Error closing:", err.message);
    }
  }
}

function isAvailable() {
  return isRedisAvailable;
}

module.exports = {
  initRedis,
  getMessages,
  addMessage,
  updateMessagesByColor,
  getSentimentHistory,
  addSentiment,
  closeRedis,
  isAvailable,
};
