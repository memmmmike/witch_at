#!/usr/bin/env node
/**
 * Socket.io test script to simulate multiple users in Witch@
 * Run with: node tests/simulate-users.js
 *
 * Environment variables:
 *   URL      - Socket server URL (default: http://localhost:4001)
 *   USERS    - Number of users (default: 3)
 *   DURATION - Duration in ms (default: 60000)
 */

const { io } = require("socket.io-client");

const SOCKET_URL = process.env.URL || "http://localhost:4001";
const NUM_USERS = parseInt(process.env.USERS || "3", 10);
const DURATION_MS = parseInt(process.env.DURATION || "60000", 10);

const HANDLES = ["ghost", "whisper", "shadow", "ember", "raven", "moss", "fog", "ash", "dusk", "thorn"];
const MESSAGES = [
  "anyone here?",
  "the veil is thin tonight",
  "i sense a presence",
  "what brings you to the well?",
  "interesting...",
  "go on",
  "the silence speaks volumes",
  "hmm",
  "i was thinking the same thing",
  "curious",
  "tell me more",
  "the stream flows ever onward",
  "*listens*",
  "yes",
  "perhaps",
  "...",
  "indeed",
  "fascinating",
];

const ROOM_NAMES = ["crypt", "grove", "depths", "sanctum"];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomColor() {
  return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TestUser {
  constructor(id) {
    this.id = id;
    this.handle = `${randomChoice(HANDLES)}${id}`;
    this.color = randomColor();
    this.socket = null;
    this.currentRoom = "main";
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log(`[User ${this.id}] Connecting to ${SOCKET_URL}...`);

      this.socket = io(SOCKET_URL, {
        path: "/api/socketio",
        transports: ["websocket", "polling"],
      });

      this.socket.on("connect", () => {
        console.log(`[User ${this.id}] Connected (${this.socket.id})`);

        // Join with identity
        this.socket.emit("join", {
          color: this.color,
          handle: null, // Start anonymous
          roomId: "main",
        });

        resolve();
      });

      this.socket.on("connect_error", (err) => {
        console.log(`[User ${this.id}] Connection error: ${err.message}`);
        reject(err);
      });

      this.socket.on("identity", (data) => {
        this.color = data.color;
        console.log(`[User ${this.id}] Identity: ${data.color}`);
      });

      this.socket.on("message", (msg) => {
        if (msg.color !== this.color) {
          console.log(`[User ${this.id}] Received: "${msg.text}" from ${msg.handle || msg.color}`);
        }
      });

      this.socket.on("room-joined", (data) => {
        this.currentRoom = data.id;
        console.log(`[User ${this.id}] Joined room: ${data.title}`);
      });

      this.socket.on("presence", (count) => {
        console.log(`[User ${this.id}] Presence: ${count} in room`);
      });

      this.socket.on("dm-received", (msg) => {
        console.log(`[User ${this.id}] DM from ${msg.handle || msg.color}: "${msg.text}"`);
      });

      this.socket.on("disconnect", () => {
        console.log(`[User ${this.id}] Disconnected`);
      });

      // Timeout after 10s
      setTimeout(() => reject(new Error("Connection timeout")), 10000);
    });
  }

  revealIdentity() {
    console.log(`[User ${this.id}] Revealing as "${this.handle}"`);
    this.socket.emit("reveal", { handle: this.handle });
  }

  sendMessage(text) {
    const message = text || randomChoice(MESSAGES);
    console.log(`[User ${this.id}] Sending: "${message}"`);
    this.socket.emit("message", { text: message });
  }

  startTyping() {
    console.log(`[User ${this.id}] Typing...`);
    this.socket.emit("typing");
  }

  stopTyping() {
    this.socket.emit("typing-stop");
  }

  switchRoom(roomId) {
    console.log(`[User ${this.id}] Switching to room: ${roomId}`);
    this.socket.emit("switch-room", { roomId });
  }

  createRoom(title, secret = false) {
    console.log(`[User ${this.id}] Creating room: ${title}`);
    this.socket.emit("create-room", { title, secret });
  }

  sendDM(targetColor, text) {
    const message = text || `hey ${randomChoice(MESSAGES)}`;
    console.log(`[User ${this.id}] DM to ${targetColor}: "${message}"`);
    this.socket.emit("dm", { targetColor, text: message });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

async function simulateActivity(user, durationMs, allUsers) {
  const endTime = Date.now() + durationMs;

  // Reveal identity after a bit
  await sleep(2000 + Math.random() * 3000);
  user.revealIdentity();

  while (Date.now() < endTime) {
    const action = Math.random();

    if (action < 0.5) {
      // 50% chance: send message
      user.sendMessage();
    } else if (action < 0.65) {
      // 15% chance: type but don't send
      user.startTyping();
      await sleep(1000 + Math.random() * 2000);
      user.stopTyping();
    } else if (action < 0.75) {
      // 10% chance: switch room
      const roomName = randomChoice(ROOM_NAMES);
      user.switchRoom(roomName);
    } else if (action < 0.85) {
      // 10% chance: DM someone
      const others = allUsers.filter(u => u.id !== user.id);
      if (others.length > 0) {
        const target = randomChoice(others);
        user.sendDM(target.color);
      }
    } else {
      // 15% chance: lurk
      console.log(`[User ${user.id}] Lurking...`);
    }

    // Wait 3-8 seconds between actions
    await sleep(3000 + Math.random() * 5000);
  }
}

async function main() {
  console.log(`\n=== Witch@ Test Users ===`);
  console.log(`URL: ${SOCKET_URL}`);
  console.log(`Users: ${NUM_USERS}`);
  console.log(`Duration: ${DURATION_MS / 1000}s\n`);

  const users = [];

  try {
    // Create and connect all users
    for (let i = 0; i < NUM_USERS; i++) {
      const user = new TestUser(i + 1);
      await user.connect();
      users.push(user);
      await sleep(500); // Stagger connections
    }

    // One user creates a test room
    if (users.length > 0) {
      await sleep(1000);
      users[0].createRoom(randomChoice(ROOM_NAMES));
    }

    console.log(`\n[All ${NUM_USERS} users connected. Simulating activity...]\n`);

    // Run all users in parallel
    await Promise.all(users.map((user) => simulateActivity(user, DURATION_MS, users)));

    console.log(`\n[Simulation complete]\n`);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    // Cleanup
    for (const user of users) {
      user.disconnect();
    }
    process.exit(0);
  }
}

main();
