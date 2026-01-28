"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket, type ActivityLogEntry } from "@/contexts/SocketProvider";

function formatTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getIcon(type: ActivityLogEntry["type"]): string {
  switch (type) {
    case "join": return "→";
    case "leave": return "←";
    case "reveal": return "✦";
    case "copy": return "✎";
    case "presence": return "●";
    default: return "·";
  }
}

export function ActivityLog() {
  const { activityLog } = useSocket();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute bottom-4 left-4 z-20">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="text-xs text-witch-sage-500/70 hover:text-witch-plum-400/90 border border-witch-plum-900/40 hover:border-witch-plum-700/50 rounded px-2 py-1 transition-colors glass"
        title={isOpen ? "Close activity log" : "Open activity log"}
      >
        {isOpen ? "Close Log" : `Activity${activityLog.length > 0 ? ` (${activityLog.length})` : ""}`}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 w-64 max-h-60 overflow-y-auto glass rounded-lg border border-witch-plum-900/40 p-2"
          >
            {activityLog.length === 0 ? (
              <p className="text-xs text-witch-sage-500/50 italic text-center py-2">
                No activity yet
              </p>
            ) : (
              <ul className="space-y-1">
                {activityLog.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start gap-2 text-xs text-witch-sage-500/80"
                  >
                    <span className="text-witch-plum-400/70 shrink-0">
                      {getIcon(entry.type)}
                    </span>
                    {entry.color && (
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: entry.color }}
                      />
                    )}
                    <span className="flex-1 leading-tight">{entry.message}</span>
                    <span className="text-witch-sage-500/40 shrink-0">
                      {formatTime(entry.ts)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
