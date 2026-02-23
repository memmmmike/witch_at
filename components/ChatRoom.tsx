"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStreamStore, type Message } from "@/lib/store/useStreamStore";
import { useSocket } from "@/contexts/SocketProvider";
import { useIdle } from "@/hooks/useIdle";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Glamour } from "./Glamour";
import { SigilIcon } from "./SigilIcon";
import { ActivityLog } from "./ActivityLog";
import { ContextualHints } from "./ContextualHints";
import { Logo } from "./Logo";
import { Feedback } from "./Feedback";
import { Ambiance } from "./Ambiance";
import { RoomSelector } from "./RoomSelector";
import { CrosstalkIndicator } from "./Crosstalk";

const RULE_OF_THREE = 3;
const MAX_VISIBLE = 6; // Show up to 6 messages, blur those beyond 3
const IDLE_MS = 45_000;
const SLASH_FEEDBACK_MS = 4000; // For non-help feedback
const PERSISTENT_COMMANDS = ["/help"]; // These stay until dismissed

// Relative timestamp helper
function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ChatRoom() {
  const messages = useStreamStore((s) => s.messages);
  const removeAfterDissipate = useStreamStore((s) => s.removeAfterDissipate);
  const clearStream = useStreamStore((s) => s.clearStream);
  const { socket, connected, mood, copyNotifications, presence, someoneTyping, roomTitle, presenceGhosts, summoned, resonance, silenceSettled, attention, affirmations, activeCrosstalk, topicSubscriptions, topicToasts } = useSocket();
  const isIdle = useIdle(IDLE_MS);
  const reducedMotion = useReducedMotion();
  const [slashFeedback, setSlashFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = (text: string, options?: { whisper?: boolean }) => {
    if (!text.trim() || !socket) return;
    if (options?.whisper) {
      socket.emit("message", { text: text.trim(), whisper: true });
    } else {
      socket.emit("message", text.trim());
    }
  };

  const handleAffirm = (messageId: string) => {
    if (!socket) return;
    socket.emit("affirm", messageId);
  };

  // Transparent copy: when user copies from a message (Ctrl+C / right-click), notify the room
  useEffect(() => {
    if (!socket) return;
    const onCopy = () => {
      const sel = typeof document !== "undefined" ? document.getSelection() : null;
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!text) return;
      // 1) Selection is inside a message bubble
      const anchor = sel.anchorNode;
      const focus = sel.focusNode;
      const getEl = (n: Node | null): Element | null =>
        n ? (n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as Element)) : null;
      const inMessage =
        getEl(anchor)?.closest?.("[data-message]") ?? getEl(focus)?.closest?.("[data-message]");
      if (inMessage) {
        // Find which message was copied for resonance
        const allMessages = useStreamStore.getState().messages;
        const copied = allMessages.find((m) => m.text.includes(text) || text.includes(m.text));
        socket.emit("copy", { messageId: copied?.id || null });
        return;
      }
      // 2) Fallback: copied text matches/overlaps a message in the stream
      const allMessages = useStreamStore.getState().messages.filter((m) => !m.leaving);
      const copied = allMessages.find(
        (m) =>
          m.text.includes(text) ||
          text.includes(m.text) ||
          m.text === text
      );
      if (copied) socket.emit("copy", { messageId: copied.id });
    };
    document.addEventListener("copy", onCopy, true);
    return () => document.removeEventListener("copy", onCopy, true);
  }, [socket]);

  // Rule of Three: latest 3 are fully visible, older ones blur progressively
  const nonLeavingMessages = messages.filter((m) => !m.leaving);
  const visibleMessages = nonLeavingMessages.slice(-MAX_VISIBLE);
  const leavingMessages = messages.filter((m) => m.leaving);

  // Calculate fade level: 0 = fully visible (newest 3), 1-3 = progressively more faded
  const getFadeLevel = (index: number, total: number): number => {
    const positionFromEnd = total - 1 - index;
    if (positionFromEnd < RULE_OF_THREE) return 0; // Newest 3 are fully visible
    return Math.min(positionFromEnd - RULE_OF_THREE + 1, 3); // 1, 2, 3 levels of fade
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-3 sm:p-6 relative">
      <Ambiance />
      <Glamour />
      <ActivityLog />
      <ContextualHints />
      <Logo />
      <Feedback />
      {/* Topic subscription toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
        <AnimatePresence>
          {topicToasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="glass rounded-lg border border-witch-amber-500/50 px-3 py-2 text-sm shadow-lg"
            >
              <div className="flex items-center gap-2 text-witch-amber-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-witch-amber-500" />
                #{toast.topic}
              </div>
              <p className="text-witch-parchment/90 mt-1 text-xs">
                {toast.handle && <span className="font-mono text-witch-plum-400">{toast.handle}: </span>}
                {toast.text}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="absolute top-2 left-2 sm:top-4 sm:left-4 flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-[10px] sm:text-xs text-witch-sage-500/80 max-w-[60%] sm:max-w-none">
        <RoomSelector />
        <span className="text-witch-sage-500/50 hidden sm:inline">·</span>
        <span className="flex items-center gap-1 sm:gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-witch-forest-500/90" : "bg-rose-600/70"}`} />
          <span className="hidden sm:inline">{connected ? "Connected" : "Connecting…"}</span>
        </span>
        <span className="text-witch-sage-500/50 hidden sm:inline">·</span>
        <span title="People in the stream" className="hidden sm:inline">{presence} in the stream</span>
        <span className="sm:hidden">{presence}</span>
        {/* Attention indicators - who's focused vs away vs stepping away */}
        {attention.length > 0 && (
          <span className="flex items-center gap-0.5 ml-1">
            {attention.map((a, i) => (
              <span
                key={`att-${i}-${a.color}`}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  a.steppingAway ? "opacity-20 animate-pulse" :
                  a.focused ? "" : "opacity-30"
                }`}
                style={{
                  backgroundColor: a.steppingAway ? "transparent" : (a.focused ? a.color : "transparent"),
                  border: (a.steppingAway || !a.focused) ? `1.5px dashed ${a.color}` : "none",
                }}
                title={
                  a.steppingAway ? (a.handle ? `${a.handle} (stepping away)` : "stepping away") :
                  a.handle ? `${a.handle} ${a.focused ? "(here)" : "(away)"}` :
                  (a.focused ? "present" : "away")
                }
              />
            ))}
          </span>
        )}
        {/* Presence Ghosts: faint traces of who was recently here */}
        {presenceGhosts.length > 0 && (
          <span className="flex items-center gap-1 ml-1" title="Recently departed">
            {presenceGhosts.map((ghost, i) => (
              <span
                key={`ghost-${i}-${ghost.color}`}
                className="w-2 h-2 rounded-full transition-opacity duration-1000"
                style={{
                  backgroundColor: ghost.color,
                  opacity: Math.max(0.15, 0.6 - ghost.fade * 0.5),
                }}
                title={ghost.handle ? `${ghost.handle} was here` : "Someone was here"}
              />
            ))}
          </span>
        )}
        <span className="text-witch-sage-500/50 hidden sm:inline">·</span>
        <span
          className="capitalize hidden sm:inline"
          title="Context Engine: background shifts with conversation tone"
        >
          {mood === "calm" && "Calm"}
          {mood === "intense" && "Intense"}
          {mood === "neutral" && "Neutral"}
        </span>
      </div>

      {/* Summoned indicator: gentle glow when someone is thinking of you */}
      <AnimatePresence>
        {summoned && (
          <motion.div
            key="summoned"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 pointer-events-none z-20 flex items-center justify-center"
          >
            <div
              className="absolute inset-0 animate-pulse"
              style={{
                background: `radial-gradient(circle at center, ${summoned.byColor}20 0%, transparent 60%)`,
              }}
            />
            <p className="text-sm text-witch-plum-400/90 glass px-4 py-2 rounded-lg pointer-events-auto">
              <span
                className="inline-block w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: summoned.byColor }}
              />
              {summoned.byHandle ? (
                <><span className="font-mono">{summoned.byHandle}</span> is thinking of you</>
              ) : (
                <>Someone is thinking of you</>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {isIdle && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-witch-soot-950/90 backdrop-blur-sm"
          >
            <p className="text-sm text-witch-plum-400/90 font-medium">You&apos;ve been idle. Move or tap to resume.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-lg space-y-4 min-h-[220px] flex flex-col justify-end">
        <AnimatePresence mode="popLayout" initial={false}>
          {copyNotifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-2 text-xs text-witch-sage-500/70 italic"
            >
              <span
                className="shrink-0 w-2 h-2 rounded-full"
                style={{ backgroundColor: n.color }}
              />
              <span>
                {n.handle ? (
                  <><span className="font-mono not-italic text-witch-plum-400/80">{n.handle}</span> is taking a note.</>
                ) : (
                  <>Someone is taking a note.</>
                )}
              </span>
            </motion.div>
          ))}
          {visibleMessages.map((msg, index) => (
            <StreamMessage
              key={msg.id}
              message={msg}
              onDissipateEnd={() => removeAfterDissipate(msg.id)}
              onAffirm={() => handleAffirm(msg.id)}
              reducedMotion={reducedMotion}
              fadeLevel={getFadeLevel(index, visibleMessages.length)}
              resonance={resonance.get(msg.id) || 0}
              affirmColors={affirmations.get(msg.id) || []}
              topicSubscriptions={topicSubscriptions}
            />
          ))}
          {leavingMessages.map((msg) => (
            <StreamMessage
              key={msg.id}
              message={msg}
              onDissipateEnd={() => removeAfterDissipate(msg.id)}
              onAffirm={() => handleAffirm(msg.id)}
              leaving
              reducedMotion={reducedMotion}
              resonance={resonance.get(msg.id) || 0}
              affirmColors={affirmations.get(msg.id) || []}
              topicSubscriptions={topicSubscriptions}
            />
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {slashFeedback && (
          <motion.div
            key="slash-feedback"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            onClick={() => setSlashFeedback(null)}
            className="absolute bottom-[4.5rem] left-1/2 -translate-x-1/2 w-full max-w-lg glass rounded-lg px-4 py-3 text-xs text-witch-plum-400/95 whitespace-pre-wrap text-left z-0 cursor-pointer hover:bg-witch-soot-800/50 transition-colors"
          >
            {slashFeedback}
            <span className="block text-[10px] text-witch-sage-500/50 mt-2">tap to dismiss</span>
          </motion.div>
        )}
      </AnimatePresence>
      <MessageInput
        ref={inputRef}
        onSend={handleSend}
        onClearStream={clearStream}
        onSlashFeedback={setSlashFeedback}
        feedbackDurationMs={SLASH_FEEDBACK_MS}
        disabled={!socket}
      />
      {someoneTyping ? (
        <p className="w-full max-w-lg mt-2 text-xs text-witch-sage-500/60 italic animate-pulse flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: someoneTyping.color }}
          />
          {someoneTyping.handle ? (
            <><span className="font-mono not-italic text-witch-plum-400/70">{someoneTyping.handle}</span> is speaking…</>
          ) : (
            <>Someone is speaking…</>
          )}
        </p>
      ) : activeCrosstalk ? (
        <div className="w-full max-w-lg mt-2">
          <CrosstalkIndicator />
        </div>
      ) : silenceSettled && presence > 1 ? (
        <p className="w-full max-w-lg mt-2 text-xs text-witch-sage-500/40 italic">
          settled silence
        </p>
      ) : (
        <div className="h-6" />
      )}
    </div>
  );
}

function StreamMessage({
  message,
  onDissipateEnd,
  onAffirm,
  leaving = false,
  reducedMotion = false,
  fadeLevel = 0,
  resonance = 0,
  affirmColors = [],
  topicSubscriptions = [],
}: {
  message: Message;
  onDissipateEnd: () => void;
  onAffirm?: () => void;
  leaving?: boolean;
  reducedMotion?: boolean;
  fadeLevel?: number;
  resonance?: number;
  affirmColors?: string[];
  topicSubscriptions?: string[];
}) {
  const [relativeTime, setRelativeTime] = useState(() => formatRelativeTime(message.ts));
  // Resonance slows down the dissipation - more copies = slower fade
  const resonanceMultiplier = Math.max(1, 1 + resonance * 0.5);
  const duration = reducedMotion ? 0 : leaving ? 0.5 * resonanceMultiplier : 0.4;
  const isGhost = message.ghost === true;

  // Check if message matches any subscribed topics (keyword match in text)
  const messageTextLower = message.text.toLowerCase();
  const isSubscribedTopic = topicSubscriptions.length > 0 &&
    topicSubscriptions.some(topic => messageTextLower.includes(topic));

  // Fade settings based on fadeLevel (0 = fully visible, 1-3 = progressively faded)
  // Ghosts get extra heavy blur
  // Resonance reduces fade intensity (messages with resonance stay more visible)
  const ghostBlur = isGhost ? 8 : 0;
  const resonanceOpacityBoost = Math.min(resonance * 0.1, 0.3);
  const fadeOpacity = isGhost ? 0.5 : fadeLevel === 0 ? 1 : Math.max(0.1 + resonanceOpacityBoost, 1 - fadeLevel * 0.3);
  const fadeBlur = ghostBlur + (fadeLevel === 0 ? 0 : Math.max(0, fadeLevel * 3 - resonance)); // Resonance reduces blur

  // Update timestamp every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(message.ts));
    }, 10000);
    return () => clearInterval(interval);
  }, [message.ts]);

  const handleClick = () => {
    if (!isGhost && onAffirm) {
      onAffirm();
    }
  };

  return (
    <motion.div
      layout
      initial={leaving ? false : { opacity: 0, y: 8 }}
      animate={leaving
        ? { opacity: 0, y: -12, scale: 0.98 }
        : { opacity: fadeOpacity, y: 0, filter: `blur(${fadeBlur}px)`, scale: 1 - fadeLevel * 0.02 }
      }
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{
        duration,
        ease: leaving ? [0.4, 0, 1, 1] : [0, 0, 0.2, 1],
      }}
      onAnimationComplete={() => {
        if (leaving) onDissipateEnd();
      }}
      onClick={handleClick}
      className={`glass rounded-xl border ${message.flagged ? "border-rose-600/60 bg-rose-950/20" : isSubscribedTopic ? "border-witch-amber-500/60 ring-1 ring-witch-amber-500/30" : "border-witch-plum-900/40"} ${message.whisper ? "px-3 py-2 opacity-75" : "px-4 py-3"} ${isGhost ? "select-none" : "cursor-pointer hover:border-witch-plum-700/60"} relative overflow-hidden`}
      data-message
      title={isGhost ? "You weren't here for this" : isSubscribedTopic ? "Matches your subscribed topic" : "Tap to affirm"}
    >
      {/* Topic subscription glow */}
      {isSubscribedTopic && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none opacity-20"
          style={{ background: 'radial-gradient(ellipse at center, var(--witch-amber-500, #f59e0b) 0%, transparent 70%)' }}
        />
      )}
      {/* Affirmation pulses */}
      <AnimatePresence>
        {affirmColors.map((color, i) => (
          <motion.div
            key={`affirm-${i}-${color}`}
            initial={{ opacity: 0.6, scale: 0.8 }}
            animate={{ opacity: 0, scale: 2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{
              background: `radial-gradient(circle at center, ${color}40 0%, transparent 70%)`,
            }}
          />
        ))}
      </AnimatePresence>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className="inline-block w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: message.color, filter: isGhost ? "none" : undefined }}
        />
        {message.sigil && !isGhost && (
          <span style={{ color: message.color }} title={message.sigil}>
            <SigilIcon sigil={message.sigil} color="currentColor" size={14} />
          </span>
        )}
        {message.tag && !isGhost && (
          <span className="text-[10px] text-witch-sage-500/80 italic">{message.tag}</span>
        )}
        {message.handle && !isGhost && (
          <span className="text-xs font-mono text-witch-plum-400/95">{message.handle}</span>
        )}
        <span
          className={
            message.whisper
              ? "text-witch-parchment/70 text-xs leading-relaxed italic"
              : "text-witch-parchment/95 text-sm leading-relaxed"
          }
        >
          {message.text}
        </span>
        {!isGhost && (
          <span className="text-[10px] text-witch-sage-500/50 ml-auto shrink-0" title={new Date(message.ts).toLocaleString()}>
            {relativeTime}
          </span>
        )}
      </div>
    </motion.div>
  );
}

const SLASH_HELP = `/clear       — clear your stream
/help        — show this
/anon        — hide your handle (go anonymous)
/id          — show your color & handle
/mood        — show current atmosphere
/copy        — copy latest message (others see you took a note)
/whisper     — send message in quieter style
/summon      — gently ping someone (e.g. /summon alice)
/away        — step away (others see you're gone)
/back        — return from away
/subscribe   — follow a topic (e.g. /subscribe witchcraft)
/unsub       — unfollow a topic (e.g. /unsub witchcraft)
/topics      — list your subscribed topics
/topic-sound — toggle sound for topic matches (on/off)
/topic-notify— toggle browser notifications (on/off)
/shrug       — send ¯\\_(ツ)_/¯
/flip        — send table flip
/spark       — clear stream, fresh start
/ping        — pong (latency)`;

const TYPING_DEBOUNCE_MS = 2000;

const MessageInput = React.forwardRef<
  HTMLInputElement,
  {
    onSend: (text: string, options?: { whisper?: boolean }) => void;
    onClearStream: () => void;
    onSlashFeedback: (msg: string | null) => void;
    feedbackDurationMs: number;
    disabled?: boolean;
  }
>(function MessageInput(
  { onSend, onClearStream, onSlashFeedback, feedbackDurationMs, disabled },
  ref
) {
  const [value, setValue] = useState("");
  const [persistentFeedback, setPersistentFeedback] = useState(false);
  const { socket, identity, mood, topicSubscriptions, subscribeTopic, unsubscribeTopic, topicSoundEnabled, setTopicSoundEnabled, topicNotifyEnabled, setTopicNotifyEnabled } = useSocket();
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = (msg: string, persistent = false) => {
    onSlashFeedback(msg);
    setPersistentFeedback(persistent);
    if (!persistent) {
      setTimeout(() => onSlashFeedback(null), feedbackDurationMs);
    }
  };

  const dismissFeedback = () => {
    if (persistentFeedback) {
      onSlashFeedback(null);
      setPersistentFeedback(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    dismissFeedback(); // Dismiss persistent feedback when typing
    if (socket) {
      socket.emit("typing");
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => socket.emit("typing-stop"), TYPING_DEBOUNCE_MS);
    }
  };

  const handleFocus = () => {
    if (socket) socket.emit("typing");
  };
  const handleBlur = () => {
    if (socket) socket.emit("typing-stop");
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const submit = () => {
    const t = value.trim();
    if (!t) return;
    const cmd = t.toLowerCase().split(/\s/)[0];
    switch (cmd) {
      case "/clear":
        onClearStream();
        setValue("");
        return;
      case "/help":
        showFeedback(SLASH_HELP, true); // Persistent until dismissed
        setValue("");
        return;
      case "/anon":
        if (socket) {
          socket.emit("reveal", null);
          showFeedback("Identity hidden. You appear anonymous.");
        }
        setValue("");
        return;
      case "/id":
        showFeedback(
          identity
            ? `Color: ${identity.color}\nHandle: ${identity.handle ?? "—"}\nTag: ${identity.tag ?? "—"}\nSigil: ${identity.sigil ?? "—"}`
            : "No identity yet."
        );
        setValue("");
        return;
      case "/mood":
        showFeedback(`Atmosphere: ${mood === "calm" ? "Calm" : mood === "intense" ? "Intense" : "Neutral"}`);
        setValue("");
        return;
      case "/summon": {
        const targetHandle = t.slice(7).trim();
        if (!targetHandle) {
          showFeedback("Usage: /summon handle (e.g. /summon alice)");
          setValue("");
          return;
        }
        if (socket) {
          socket.emit("summon", targetHandle);
          socket.once("summon-sent", (data: { target: string }) => showFeedback(`Summoning ${data.target}...`));
          socket.once("summon-failed", () => showFeedback(`"${targetHandle}" isn't in the stream or has no handle.`));
        }
        setValue("");
        return;
      }
      case "/away":
        if (socket) {
          socket.emit("away");
          showFeedback("Stepping away. Others will see you're gone.");
        }
        setValue("");
        return;
      case "/back":
        if (socket) {
          socket.emit("back");
          showFeedback("Welcome back.");
        }
        setValue("");
        return;
      case "/subscribe":
      case "/sub": {
        const topic = t.slice(cmd.length).trim();
        if (!topic) {
          showFeedback("Usage: /subscribe topic");
        } else {
          subscribeTopic(topic);
          showFeedback(`Subscribed to #${topic.replace(/^#/, '')}`);
        }
        setValue("");
        return;
      }
      case "/unsubscribe":
      case "/unsub": {
        const topic = t.slice(cmd.length).trim();
        if (!topic) {
          showFeedback("Usage: /unsub topic");
        } else {
          unsubscribeTopic(topic);
          showFeedback(`Unsubscribed from #${topic.replace(/^#/, '')}`);
        }
        setValue("");
        return;
      }
      case "/topics": {
        if (topicSubscriptions.length === 0) {
          showFeedback("No topic subscriptions. Use /subscribe topic");
        } else {
          showFeedback(`Subscribed: ${topicSubscriptions.map(t => '#' + t).join(', ')}`);
        }
        setValue("");
        return;
      }
      case "/topic-sound": {
        const arg = t.slice(cmd.length).trim().toLowerCase();
        if (arg === "on") {
          setTopicSoundEnabled(true);
          showFeedback("Topic sound enabled");
        } else if (arg === "off") {
          setTopicSoundEnabled(false);
          showFeedback("Topic sound disabled");
        } else {
          showFeedback(`Topic sound is ${topicSoundEnabled ? "on" : "off"}. Use /topic-sound on|off`);
        }
        setValue("");
        return;
      }
      case "/topic-notify": {
        const arg = t.slice(cmd.length).trim().toLowerCase();
        if (arg === "on") {
          setTopicNotifyEnabled(true).then(granted => {
            if (granted) {
              showFeedback("Browser notifications enabled for topics");
            } else {
              showFeedback("Browser notification permission denied");
            }
          });
        } else if (arg === "off") {
          setTopicNotifyEnabled(false);
          showFeedback("Browser notifications disabled");
        } else {
          showFeedback(`Topic notifications are ${topicNotifyEnabled ? "on" : "off"}. Use /topic-notify on|off`);
        }
        setValue("");
        return;
      }
      case "/shrug":
        onSend("¯\\_(ツ)_/¯");
        setValue("");
        return;
      case "/whisper": {
        const rest = t.slice(8).trim();
        if (rest) onSend(rest, { whisper: true });
        setValue("");
        return;
      }
      case "/flip":
        onSend("(╯°□°)╯︵ ┻━┻");
        setValue("");
        return;
      case "/spark":
        onClearStream();
        showFeedback("Stream cleared. Fresh start.");
        setValue("");
        return;
      case "/ping":
        if (socket) {
          const start = Date.now();
          socket.emit("ping");
          socket.once("pong", () => showFeedback(`pong — ${Date.now() - start}ms`));
        }
        setValue("");
        return;
      case "/copy": {
        const msgs = useStreamStore.getState().messages.filter((m) => !m.leaving);
        const last = msgs[msgs.length - 1];
        if (!last) {
          showFeedback("Nothing to copy.");
          setValue("");
          return;
        }
        navigator.clipboard
          ?.writeText(last.text)
          .then(() => {
            socket?.emit("copy", { messageId: last.id });
            showFeedback("Copied. Others will see you took a note.");
          })
          .catch(() => showFeedback("Could not copy."));
        setValue("");
        return;
      }
      default:
        break;
    }
    onSend(t);
    setValue("");
  };

  return (
    <div className="w-full max-w-lg mt-4 sm:mt-6 flex gap-2">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit()}
        placeholder="Speak… (or /help)"
        disabled={disabled}
        className="flex-1 bg-witch-soot-800/90 border border-witch-plum-700/50 rounded-lg px-3 sm:px-4 py-3 text-sm text-witch-parchment placeholder:text-witch-sage-500/70 focus:outline-none focus:ring-1 focus:ring-witch-amber-500/50 focus:border-witch-amber-500/50 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="px-3 sm:px-4 py-3 rounded-lg bg-witch-plum-700/70 hover:bg-witch-plum-500/80 active:bg-witch-plum-600/80 text-sm font-medium text-witch-parchment disabled:opacity-50 transition-colors"
      >
        Send
      </button>
    </div>
  );
});
