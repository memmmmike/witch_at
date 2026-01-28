"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStreamStore, type Message } from "@/lib/store/useStreamStore";
import { useSocket } from "@/contexts/SocketProvider";
import { useIdle } from "@/hooks/useIdle";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Glamour } from "./Glamour";
import { SigilIcon } from "./SigilIcon";

const RULE_OF_THREE = 3;
const IDLE_MS = 45_000;

const SLASH_FEEDBACK_MS = 4000;

export function ChatRoom() {
  const messages = useStreamStore((s) => s.messages);
  const removeAfterDissipate = useStreamStore((s) => s.removeAfterDissipate);
  const clearStream = useStreamStore((s) => s.clearStream);
  const { socket, connected, mood, copyNotifications, presence, someoneTyping, roomTitle } = useSocket();
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
        socket.emit("copy");
        return;
      }
      // 2) Fallback: copied text matches/overlaps a message in the stream
      const messageTexts = useStreamStore.getState().messages
        .filter((m) => !m.leaving)
        .map((m) => m.text);
      const fromStream = messageTexts.some(
        (msgText) =>
          msgText.includes(text) ||
          text.includes(msgText) ||
          msgText === text
      );
      if (fromStream) socket.emit("copy");
    };
    document.addEventListener("copy", onCopy, true);
    return () => document.removeEventListener("copy", onCopy, true);
  }, [socket]);

  // Rule of Three: only the latest 3 non-leaving messages; any leaving message dissipates separately
  const visibleMessages = messages.filter((m) => !m.leaving).slice(-RULE_OF_THREE);
  const leavingMessages = messages.filter((m) => m.leaving);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative">
      <Glamour />
      <div className="absolute top-4 left-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-witch-sage-500/80">
        <span className="font-medium text-witch-plum-400/90">{roomTitle}</span>
        <span className="text-witch-sage-500/50">·</span>
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-witch-forest-500/90" : "bg-rose-600/70"}`} />
          {connected ? "Connected" : "Connecting…"}
        </span>
        <span className="text-witch-sage-500/50">·</span>
        <span title="People in the stream">{presence} in the stream</span>
        <span className="text-witch-sage-500/50">·</span>
        <span
          className="capitalize"
          title="Context Engine: background shifts with conversation tone"
        >
          {mood === "calm" && "Calm"}
          {mood === "intense" && "Intense"}
          {mood === "neutral" && "Neutral"}
        </span>
      </div>
      {someoneTyping && (
        <p className="absolute left-1/2 -translate-x-1/2 top-[calc(50%-5rem)] text-xs text-witch-sage-500/60 italic animate-pulse">
          Someone is speaking…
        </p>
      )}

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
          {visibleMessages.map((msg) => (
            <StreamMessage
              key={msg.id}
              message={msg}
              onDissipateEnd={() => removeAfterDissipate(msg.id)}
              reducedMotion={reducedMotion}
            />
          ))}
          {leavingMessages.map((msg) => (
            <StreamMessage
              key={msg.id}
              message={msg}
              onDissipateEnd={() => removeAfterDissipate(msg.id)}
              leaving
              reducedMotion={reducedMotion}
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
            className="absolute bottom-[4.5rem] left-1/2 -translate-x-1/2 w-full max-w-lg glass rounded-lg px-4 py-3 text-xs text-witch-plum-400/95 whitespace-pre-wrap text-center z-0"
          >
            {slashFeedback}
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
    </div>
  );
}

function StreamMessage({
  message,
  onDissipateEnd,
  leaving = false,
  reducedMotion = false,
}: {
  message: Message;
  onDissipateEnd: () => void;
  leaving?: boolean;
  reducedMotion?: boolean;
}) {
  const duration = reducedMotion ? 0 : leaving ? 0.5 : 0.4;
  const noBlur = reducedMotion;

  return (
    <motion.div
      layout
      initial={
        leaving ? false : noBlur ? { opacity: 0 } : { opacity: 0, filter: "blur(8px)", y: 8 }
      }
      animate={
        leaving
          ? noBlur ? { opacity: 0 } : { opacity: 0, filter: "blur(12px)", y: -12, scale: 0.98 }
          : noBlur ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)", y: 0 }
      }
      exit={noBlur ? { opacity: 0 } : { opacity: 0, filter: "blur(12px)", y: -12, scale: 0.98 }}
      transition={{
        duration,
        ease: leaving ? [0.4, 0, 1, 1] : [0, 0, 0.2, 1],
      }}
      onAnimationComplete={() => {
        if (leaving) onDissipateEnd();
      }}
      className={`glass rounded-xl border border-witch-plum-900/40 ${message.whisper ? "px-3 py-2 opacity-75" : "px-4 py-3"}`}
      data-message
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className="inline-block w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: message.color }}
        />
        {message.sigil && (
          <span style={{ color: message.color }} title={message.sigil}>
            <SigilIcon sigil={message.sigil} color="currentColor" size={14} />
          </span>
        )}
        {message.tag && (
          <span className="text-[10px] text-witch-sage-500/80 italic">{message.tag}</span>
        )}
        {message.handle && (
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
      </div>
    </motion.div>
  );
}

const SLASH_HELP = `/clear   — clear your stream
/help    — show this
/anon    — hide your handle (go anonymous)
/id      — show your color & handle
/mood    — show current atmosphere
/copy    — copy latest message (others see you took a note)
/whisper — send message in quieter style
/shrug   — send ¯\\_(ツ)_/¯
/flip    — send table flip
/spark   — clear stream, fresh start
/ping    — pong (latency)`;

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
  const { socket, identity, mood } = useSocket();
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = (msg: string) => {
    onSlashFeedback(msg);
    setTimeout(() => onSlashFeedback(null), feedbackDurationMs);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
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
        showFeedback(SLASH_HELP);
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
            socket?.emit("copy");
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
    <div className="w-full max-w-lg mt-6 flex gap-2">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit()}
        placeholder="Speak into the well… (or / for commands)"
        disabled={disabled}
        className="flex-1 bg-witch-soot-800/90 border border-witch-plum-700/50 rounded-lg px-4 py-3 text-sm text-witch-parchment placeholder:text-witch-sage-500/70 focus:outline-none focus:ring-1 focus:ring-witch-amber-500/50 focus:border-witch-amber-500/50 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="px-4 py-3 rounded-lg bg-witch-plum-700/70 hover:bg-witch-plum-500/80 text-sm font-medium text-witch-parchment disabled:opacity-50 transition-colors"
      >
        Send
      </button>
    </div>
  );
});
