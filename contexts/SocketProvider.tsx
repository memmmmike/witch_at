"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { connectSocket, getSocket } from "@/lib/socket";
import { useStreamStore } from "@/lib/store/useStreamStore";
import { useSound } from "@/hooks/useSound";

type Mood = "calm" | "neutral" | "intense";

const IDENTITY_STORAGE_KEY = "witchat_identity";
const STREAM_STORAGE_KEY = "witchat_stream";
const CLIENT_ID_KEY = "witchat_client_id";

function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = `c${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export type Identity = {
  color: string;
  handle: string | null;
  tag: string | null;
  sigil: string | null;
};

function loadIdentity(): Identity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const { color, handle, tag, sigil } = data;
    if (typeof color !== "string") return null;
    return {
      color,
      handle: handle ?? null,
      tag: tag ?? null,
      sigil: sigil ?? null,
    };
  } catch {
    return null;
  }
}

function saveIdentity(payload: Identity) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

type StoredMessage = {
  id: string;
  text: string;
  color: string;
  handle: string | null;
  tag?: string | null;
  sigil?: string | null;
  whisper?: boolean;
  ts: number;
};
function loadStream(): StoredMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STREAM_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}
function saveStream(messages: StoredMessage[]) {
  if (typeof window === "undefined") return;
  try {
    if (messages.length > 0) {
      sessionStorage.setItem(STREAM_STORAGE_KEY, JSON.stringify(messages));
    } else {
      sessionStorage.removeItem(STREAM_STORAGE_KEY);
    }
  } catch (_) {}
}

export type CopyNotification = {
  id: number;
  color: string;
  handle: string | null;
};

export type ActivityLogEntry = {
  id: number;
  type: "join" | "leave" | "reveal" | "presence" | "copy" | "summon" | "banned" | "rejected";
  color?: string;
  handle?: string | null;
  message: string;
  ts: number;
};

export type PresenceGhost = {
  color: string;
  handle: string | null;
  fade: number; // 0-1, how faded
};

export type AttentionState = {
  id?: string; // Socket ID for unique identification (Issue #3)
  color: string;
  handle: string | null;
  focused: boolean;
  steppingAway?: boolean;
};

export type RoomInfo = {
  id: string;
  title: string;
  secret: boolean;
};

export type RoomListItem = {
  id: string;
  title: string;
  presence: number;
  lastActivity: number;
};

export type CrosstalkParticipant = {
  color: string;
  handle: string | null;
};

export type DMMessage = {
  id: string;
  text: string;
  color: string;
  handle: string | null;
  sigil: string | null;
  targetColor: string;
  targetSocketId?: string; // Socket ID for unique DM targeting
  targetHandle: string | null;
  ts: number;
};

const MAX_ACTIVITY_LOG = 10;

type SocketContextValue = {
  connected: boolean;
  mood: Mood;
  identity: Identity | null;
  copyNotifications: CopyNotification[];
  presence: number;
  someoneTyping: { color: string; handle: string | null } | null;
  roomTitle: string;
  activityLog: ActivityLogEntry[];
  presenceGhosts: PresenceGhost[];
  summoned: { byColor: string; byHandle: string | null } | null;
  resonance: Map<string, number>; // messageId -> copy count
  silenceSettled: boolean; // Comfortable silence after 30s of no activity
  attention: AttentionState[]; // Who's focused vs away
  affirmations: Map<string, string[]>; // messageId -> list of colors that affirmed
  // Room management
  currentRoom: RoomInfo | null;
  roomList: RoomListItem[];
  // DMs (Crosstalk)
  activeCrosstalk: CrosstalkParticipant[] | null; // Who's DMing in the room
  dmMessages: DMMessage[]; // DMs for current user
  dmTyping: { color: string; handle: string | null } | null;
};

const SocketContext = createContext<SocketContextValue>({
  connected: false,
  mood: "neutral",
  identity: null,
  copyNotifications: [],
  presence: 0,
  someoneTyping: null,
  roomTitle: "the well",
  activityLog: [],
  presenceGhosts: [],
  summoned: null,
  resonance: new Map(),
  silenceSettled: false,
  attention: [],
  affirmations: new Map(),
  currentRoom: null,
  roomList: [],
  activeCrosstalk: null,
  dmMessages: [],
  dmTyping: null,
});

const COPY_NOTIFICATION_MS = 5000;

const SUMMON_DURATION_MS = 5000;

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [mood, setMood] = useState<Mood>("neutral");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [copyNotifications, setCopyNotifications] = useState<CopyNotification[]>([]);
  const [presence, setPresence] = useState(0);
  const [someoneTyping, setSomeoneTyping] = useState<{ color: string; handle: string | null } | null>(null);
  const [roomTitle, setRoomTitle] = useState("the well");
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [presenceGhosts, setPresenceGhosts] = useState<PresenceGhost[]>([]);
  const [summoned, setSummoned] = useState<{ byColor: string; byHandle: string | null } | null>(null);
  const [resonance, setResonance] = useState<Map<string, number>>(new Map());
  const [silenceSettled, setSilenceSettled] = useState(false);
  const [attention, setAttention] = useState<AttentionState[]>([]);
  const [affirmations, setAffirmations] = useState<Map<string, string[]>>(new Map());
  const [currentRoom, setCurrentRoom] = useState<RoomInfo | null>(null);
  const [roomList, setRoomList] = useState<RoomListItem[]>([]);
  const [activeCrosstalk, setActiveCrosstalk] = useState<CrosstalkParticipant[] | null>(null);
  const [dmMessages, setDmMessages] = useState<DMMessage[]>([]);
  const [dmTyping, setDmTyping] = useState<{ color: string; handle: string | null } | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dmTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crosstalkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Issue #4: Track crosstalk timer
  const prevPresenceRef = useRef<number>(0);
  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const clearStreamOnJoinRef = useRef(false);
  const addMessage = useStreamStore((s) => s.addMessage);
  const setStream = useStreamStore((s) => s.setStream);
  const clearStream = useStreamStore((s) => s.clearStream);
  const updateHandleForColor = useStreamStore((s) => s.updateHandleForColor);
  const updateTagForColor = useStreamStore((s) => s.updateTagForColor);
  const updateSigilForColor = useStreamStore((s) => s.updateSigilForColor);
  const { playMessageSound, playJoinSound, playLeaveSound, playSummonSound } = useSound();

  const addActivityLog = (type: ActivityLogEntry["type"], message: string, color?: string, handle?: string | null) => {
    setActivityLog((prev) => {
      const entry: ActivityLogEntry = {
        id: Date.now(),
        type,
        color,
        handle,
        message,
        ts: Date.now(),
      };
      const updated = [...prev, entry];
      return updated.slice(-MAX_ACTIVITY_LOG);
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("clear") === "1") {
      clearStream();
      clearStreamOnJoinRef.current = true;
      sessionStorage.removeItem(STREAM_STORAGE_KEY);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [clearStream]);

  // Soft refresh: save stream to sessionStorage so we can restore after reload
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBeforeUnload = () => {
      const messages = useStreamStore.getState().messages;
      const toStore = messages.map((m) => ({
        id: m.id,
        text: m.text,
        color: m.color,
        handle: m.handle,
        tag: m.tag ?? null,
        sigil: m.sigil ?? null,
        whisper: m.whisper,
        ts: m.ts,
      }));
      saveStream(toStore);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Ctrl+F5 (or Cmd+Shift+R on Mac) → reload with ?clear=1 so chat is cleared
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const isHardRefresh =
        (e.key === "F5" && e.ctrlKey) ||
        (e.key === "r" && (e.metaKey || e.ctrlKey) && e.shiftKey);
      if (isHardRefresh) {
        e.preventDefault();
        const path = window.location.pathname || "/";
        window.location.href = `${path}?clear=1`;
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      console.log("[Witch@] App at", window.location.origin);
    }
    const sock = connectSocket();
    socketRef.current = sock;

    sock.on("connect", () => {
      if (process.env.NODE_ENV === "development") {
        console.log("[Witch@] Socket connected");
      }
      setConnected(true);
      clearStream();
      const saved = loadIdentity();
      const color = saved?.color ?? `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
      const handle = saved?.handle ?? null;
      const tag = saved?.tag ?? null;
      const sigil = saved?.sigil ?? null;
      const clientId = getOrCreateClientId();
      if (clearStreamOnJoinRef.current) clearStreamOnJoinRef.current = false;
      sock.emit("join", { color, handle, tag, sigil, clientId });
    });
    sock.on("disconnect", () => setConnected(false));
    sock.on("connect_error", (err) => {
      console.error("[Witch@] Socket connection failed:", err.message);
    });
    sock.on("identity", (payload: Identity) => {
      setIdentity(payload);
      saveIdentity(payload);
    });
    sock.on("presence", (count: number) => {
      const prev = prevPresenceRef.current;
      if (count > prev && prev > 0) {
        addActivityLog("join", "Someone entered the stream");
        playJoinSound();
      } else if (count < prev && prev > 0) {
        addActivityLog("leave", "Someone left the stream");
        playLeaveSound();
      }
      prevPresenceRef.current = count;
      setPresence(count);
    });
    sock.on("room-title", (title: string) => setRoomTitle(title || "the well"));
    sock.on("typing", (payload: { color: string; handle: string | null }) => {
      setSomeoneTyping(payload);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setSomeoneTyping(null), 3000);
    });
    sock.on("typing-stop", () => setSomeoneTyping(null));
    sock.on("stream", (messages: Parameters<typeof setStream>[0]) => {
      const list = Array.isArray(messages) ? messages : [];
      setStream(list);
      // Soft refresh: restore stream from sessionStorage (hard refresh / ?clear=1 already cleared it)
      if (list.length === 0) {
        const restored = loadStream();
        if (restored?.length) {
          setStream(restored.map((m) => ({ ...m, leaving: false } as Parameters<typeof setStream>[0][number])));
          sessionStorage.removeItem(STREAM_STORAGE_KEY);
        }
      }
    });
    sock.on("ghosts", (messages: Parameters<typeof setStream>[0]) => {
      // Ghost messages: blurred remnants of conversation you weren't present for
      const list = Array.isArray(messages) ? messages : [];
      if (list.length > 0) {
        // Check if we have our own messages in sessionStorage (soft refresh)
        const restored = loadStream();
        if (restored?.length) {
          // User is returning, show their messages normally
          setStream(restored.map((m) => ({ ...m, leaving: false } as Parameters<typeof setStream>[0][number])));
          sessionStorage.removeItem(STREAM_STORAGE_KEY);
        } else {
          // New user or hard refresh, show ghosts
          setStream(list.map((m) => ({ ...m, leaving: false, ghost: true })));
        }
      }
    });
    sock.on("mood", (m: Mood) => setMood(m));
    sock.on("message", (msg: Parameters<typeof addMessage>[0]) => {
      addMessage(msg);
      playMessageSound();
    });
    sock.on("identity-revealed", (payload: { color: string; handle: string | null; tag?: string | null; sigil?: string | null }) => {
      updateHandleForColor(payload.color, payload.handle);
      updateTagForColor(payload.color, payload.tag ?? null);
      updateSigilForColor(payload.color, payload.sigil ?? null);
      const name = payload.handle || "Someone";
      addActivityLog("reveal", `${name} updated their identity`, payload.color, payload.handle);
    });
    sock.on("copy", (payload: { color: string; handle: string | null }) => {
      const id = Date.now();
      setCopyNotifications((prev) => [...prev, { id, color: payload.color, handle: payload.handle }]);
      setTimeout(() => {
        setCopyNotifications((prev) => prev.filter((n) => n.id !== id));
      }, COPY_NOTIFICATION_MS);
      const name = payload.handle || "Someone";
      addActivityLog("copy", `${name} took a note`, payload.color, payload.handle);
    });
    sock.on("rate-limited", (payload: { event: string; reason: string }) => {
      console.warn("[Witch@] Rate limited:", payload.event, payload.reason);
    });
    sock.on("server-shutdown", () => {
      console.warn("[Witch@] Server is shutting down");
    });

    // Presence Ghosts: faint traces of who was recently here
    sock.on("presence-ghosts", (ghosts: PresenceGhost[]) => {
      setPresenceGhosts(Array.isArray(ghosts) ? ghosts : []);
    });

    // Message Resonance: track copy counts per message
    sock.on("resonance", (payload: { messageId: string; count: number }) => {
      setResonance((prev) => {
        const next = new Map(prev);
        next.set(payload.messageId, payload.count);
        return next;
      });
    });

    // Summoning: being gently pinged back
    sock.on("summoned", (payload: { byColor: string; byHandle: string | null }) => {
      setSummoned(payload);
      playSummonSound();
      const name = payload.byHandle || "Someone";
      addActivityLog("summon", `${name} is thinking of you`, payload.byColor, payload.byHandle);
      setTimeout(() => setSummoned(null), SUMMON_DURATION_MS);
    });

    // Moderation events
    sock.on("message-rejected", (payload: { reason: string }) => {
      addActivityLog("rejected", payload.reason);
    });

    sock.on("banned", (payload: { reason: string }) => {
      addActivityLog("banned", `You have been banned: ${payload.reason}`);
    });

    sock.on("user-banned", (payload: { color: string; handle: string; reason: string }) => {
      addActivityLog("banned", `${payload.handle} was banned for ${payload.reason}`, payload.color, payload.handle);
    });

    // Comfortable silence
    sock.on("silence", (payload: { settled: boolean }) => {
      setSilenceSettled(payload.settled);
    });

    // Arrival vibe - instant room read on join
    sock.on("arrival-vibe", (payload: { presence: number; mood: string; quietFor: string | null; hasGhosts: boolean }) => {
      let vibe = `${payload.presence} here`;
      if (payload.mood !== "neutral") vibe += `, ${payload.mood}`;
      if (payload.quietFor) vibe += `, quiet for ${payload.quietFor}`;
      if (payload.hasGhosts) vibe += `, traces linger`;
      addActivityLog("presence", vibe);
    });

    // Attention state - who's focused vs away
    sock.on("attention", (state: AttentionState[]) => {
      setAttention(Array.isArray(state) ? state : []);
    });

    // Track visibility and emit focus/blur
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        sock.emit("focus");
      } else {
        sock.emit("blur");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Deliberate departure events
    sock.on("user-away", (payload: { color: string; handle: string | null }) => {
      const name = payload.handle || "Someone";
      addActivityLog("leave", `${name} is stepping away`, payload.color, payload.handle);
    });

    sock.on("user-back", (payload: { color: string; handle: string | null }) => {
      const name = payload.handle || "Someone";
      addActivityLog("join", `${name} returned`, payload.color, payload.handle);
    });

    // Affirmations - silent pulses on messages
    sock.on("affirmation", (payload: { messageId: string; color: string }) => {
      setAffirmations((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.messageId) || [];
        next.set(payload.messageId, [...existing, payload.color]);
        return next;
      });
      // Clear after animation (1.5s)
      setTimeout(() => {
        setAffirmations((prev) => {
          const next = new Map(prev);
          const existing = next.get(payload.messageId) || [];
          const updated = existing.slice(1); // Remove oldest
          if (updated.length === 0) {
            next.delete(payload.messageId);
          } else {
            next.set(payload.messageId, updated);
          }
          return next;
        });
      }, 1500);
    });

    // Room management events
    sock.on("room-joined", (payload: RoomInfo) => {
      setCurrentRoom(payload);
      // Clear stream when switching rooms
      clearStream();
      setDmMessages([]);
      setActiveCrosstalk(null);
    });

    sock.on("room-list", (list: RoomListItem[]) => {
      setRoomList(Array.isArray(list) ? list : []);
    });

    sock.on("room-created", (payload: { roomId: string; title: string; secret: boolean }) => {
      addActivityLog("presence", `Created room: ${payload.title}`);
    });

    sock.on("room-create-failed", (payload: { reason: string }) => {
      addActivityLog("rejected", `Failed to create room: ${payload.reason}`);
    });

    sock.on("room-switch-failed", (payload: { reason: string }) => {
      addActivityLog("rejected", `Failed to switch room: ${payload.reason}`);
    });

    sock.on("room-deleted", (payload: { roomId: string }) => {
      addActivityLog("presence", `Room deleted: ${payload.roomId}`);
    });

    sock.on("room-delete-failed", (payload: { reason: string }) => {
      addActivityLog("rejected", `Failed to delete room: ${payload.reason}`);
    });

    // DM (Crosstalk) events
    sock.on("dm-received", (msg: DMMessage) => {
      setDmMessages((prev) => [...prev.slice(-49), msg]); // Keep last 50 DMs
    });

    sock.on("crosstalk", (payload: { participants: CrosstalkParticipant[]; ts: number }) => {
      setActiveCrosstalk(payload.participants);
      // Clear previous timer before setting new one to prevent leaks
      if (crosstalkTimeoutRef.current) clearTimeout(crosstalkTimeoutRef.current);
      crosstalkTimeoutRef.current = setTimeout(() => {
        setActiveCrosstalk(null); // Clear after 5s of no activity
        crosstalkTimeoutRef.current = null;
      }, 5000);
    });

    sock.on("crosstalk-ended", () => {
      if (crosstalkTimeoutRef.current) clearTimeout(crosstalkTimeoutRef.current);
      crosstalkTimeoutRef.current = null;
      setActiveCrosstalk(null);
    });

    sock.on("dm-typing", (payload: { color: string; handle: string | null }) => {
      setDmTyping(payload);
      if (dmTypingTimeoutRef.current) clearTimeout(dmTypingTimeoutRef.current);
      dmTypingTimeoutRef.current = setTimeout(() => setDmTyping(null), 3000);
    });

    sock.on("dm-failed", (payload: { reason: string }) => {
      addActivityLog("rejected", `DM failed: ${payload.reason}`);
    });

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (dmTypingTimeoutRef.current) clearTimeout(dmTypingTimeoutRef.current);
      if (crosstalkTimeoutRef.current) clearTimeout(crosstalkTimeoutRef.current);
      sock.off("connect");
      sock.off("disconnect");
      sock.off("identity");
      sock.off("presence");
      sock.off("room-title");
      sock.off("typing");
      sock.off("typing-stop");
      sock.off("stream");
      sock.off("ghosts");
      sock.off("mood");
      sock.off("message");
      sock.off("identity-revealed");
      sock.off("copy");
      sock.off("rate-limited");
      sock.off("server-shutdown");
      sock.off("presence-ghosts");
      sock.off("resonance");
      sock.off("summoned");
      sock.off("message-rejected");
      sock.off("banned");
      sock.off("user-banned");
      sock.off("silence");
      sock.off("arrival-vibe");
      sock.off("attention");
      sock.off("affirmation");
      sock.off("user-away");
      sock.off("user-back");
      sock.off("room-joined");
      sock.off("room-list");
      sock.off("room-created");
      sock.off("room-create-failed");
      sock.off("room-switch-failed");
      sock.off("room-deleted");
      sock.off("room-delete-failed");
      sock.off("dm-received");
      sock.off("crosstalk");
      sock.off("crosstalk-ended");
      sock.off("dm-typing");
      sock.off("dm-failed");
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [addMessage, setStream, clearStream, updateHandleForColor, updateTagForColor, updateSigilForColor, playJoinSound, playLeaveSound, playSummonSound]);

  // Apply mood to document body for Context Engine (atmosphere)
  useEffect(() => {
    document.body.classList.remove("mood-calm", "mood-neutral", "mood-intense");
    document.body.classList.add(`mood-${mood}`);
  }, [mood]);

  return (
    <SocketContext.Provider value={{ connected, mood, identity, copyNotifications, presence, someoneTyping, roomTitle, activityLog, presenceGhosts, summoned, resonance, silenceSettled, attention, affirmations, currentRoom, roomList, activeCrosstalk, dmMessages, dmTyping }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  const socket = getSocket();
  return { ...ctx, socket };
}
