"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const HINTS_KEY = "witchat_hints_seen";
const HINT_DELAY_MS = 3000; // Show first hint after 3 seconds

type Hint = {
  id: string;
  message: string;
  trigger: "time" | "idle";
  delay?: number;
};

const HINTS: Hint[] = [
  {
    id: "welcome",
    message: "Welcome to the well. Messages fade like memories. Type /help for commands.",
    trigger: "time",
    delay: HINT_DELAY_MS,
  },
];

export function ContextualHints() {
  const [currentHint, setCurrentHint] = useState<Hint | null>(null);
  const [seenHints, setSeenHints] = useState<Set<string>>(new Set());

  // Load seen hints from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(HINTS_KEY);
      if (stored) {
        setSeenHints(new Set(JSON.parse(stored)));
      }
    } catch {}
  }, []);

  // Show time-based hints
  useEffect(() => {
    const timeHints = HINTS.filter(
      (h) => h.trigger === "time" && !seenHints.has(h.id)
    );

    const timers: ReturnType<typeof setTimeout>[] = [];

    for (const hint of timeHints) {
      const timer = setTimeout(() => {
        setCurrentHint(hint);
      }, hint.delay || HINT_DELAY_MS);
      timers.push(timer);
    }

    return () => timers.forEach(clearTimeout);
  }, [seenHints]);

  const dismissHint = () => {
    if (!currentHint) return;

    const newSeen = new Set(seenHints);
    newSeen.add(currentHint.id);
    setSeenHints(newSeen);

    try {
      localStorage.setItem(HINTS_KEY, JSON.stringify([...newSeen]));
    } catch {}

    setCurrentHint(null);
  };

  return (
    <AnimatePresence>
      {currentHint && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 max-w-sm"
        >
          <div className="glass rounded-lg border border-witch-amber-500/30 px-4 py-3 shadow-lg">
            <p className="text-sm text-witch-parchment/90 leading-relaxed">
              {currentHint.message}
            </p>
            <button
              onClick={dismissHint}
              className="mt-2 text-xs text-witch-amber-400/80 hover:text-witch-amber-400 transition-colors"
            >
              Got it
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
