/**
 * Socket.io client for Witchat.
 * Connects to the Socket server (separate process). Set NEXT_PUBLIC_SOCKET_URL in dev (.env.local).
 */

import { io, Socket } from "socket.io-client";

const SOCKET_PATH = "/api/socketio";

function getSocketUrl(): string {
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4001";
  const { hostname, protocol } = window.location;
  // On localhost, socket server defaults to 4001 (avoids stealing 3001 from other apps)
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:4001`;
  }
  return process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
}

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  const url = getSocketUrl();
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    console.log("[Witchat] Connecting to socket at", url);
  }
  socket = io(url, {
    path: SOCKET_PATH,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
