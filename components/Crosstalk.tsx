"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket, type CrosstalkParticipant, type DMMessage } from "@/contexts/SocketProvider";
import { getSocket } from "@/lib/socket";
import { SigilIcon } from "./SigilIcon";

export function CrosstalkIndicator() {
  const { activeCrosstalk, identity } = useSocket();

  // Check if current user is part of the crosstalk
  const isParticipant = activeCrosstalk?.some(p => p.color === identity?.color);
  const showIndicator = activeCrosstalk && activeCrosstalk.length >= 2;

  // Issue #8: Always render AnimatePresence with conditional child inside
  return (
    <AnimatePresence>
      {showIndicator && (
        <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-2 text-xs text-witch-sage-500/70"
      >
        <span className="flex items-center gap-0.5">
          {activeCrosstalk.map((p, i) => (
            <span
              key={`ct-${i}-${p.color}`}
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: p.color }}
              title={p.handle || "Someone"}
            />
          ))}
        </span>
        <span className="italic">
          {isParticipant ? "crosstalk..." : "whispering aside..."}
        </span>
      </motion.div>
      )}
    </AnimatePresence>
  );
}

const DM_TYPING_DEBOUNCE_MS = 300; // Issue #7: Debounce DM typing

export function DMPanel() {
  const { dmMessages, dmTyping, identity, attention } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ color: string; handle: string | null; id?: string } | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [seenMessageIds, setSeenMessageIds] = useState<Set<string>>(new Set()); // Issue #9: Track seen messages
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Issue #7: Debounce timer
  const socket = getSocket();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages]);

  // Issue #9: Mark messages as seen when viewing conversation
  useEffect(() => {
    if (selectedUser && filteredDMs.length > 0) {
      const newSeen = new Set(seenMessageIds);
      filteredDMs.forEach(m => newSeen.add(m.id));
      if (newSeen.size !== seenMessageIds.size) {
        setSeenMessageIds(newSeen);
      }
    }
  }, [selectedUser, dmMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter DMs for selected user
  const filteredDMs = selectedUser
    ? dmMessages.filter(
        (m) =>
          (m.color === selectedUser.color && m.targetColor === identity?.color) ||
          (m.targetColor === selectedUser.color && m.color === identity?.color)
      )
    : [];

  // Get unique DM participants (people who have messaged current user or been messaged by them)
  const dmParticipants = Array.from(
    new Map(
      dmMessages
        .flatMap((m) => [
          { color: m.color, handle: m.handle },
          { color: m.targetColor, handle: m.targetHandle },
        ])
        .filter((p) => p.color !== identity?.color)
        .map((p) => [p.color, p])
    ).values()
  );

  // Get users in room who can receive DMs
  const usersInRoom = attention.filter((a) => a.color !== identity?.color);

  const handleSendDM = () => {
    if (!inputValue.trim() || !selectedUser || !socket) return;
    // Issue #3: Use targetSocketId if available for unique identification
    socket.emit("dm", {
      targetColor: selectedUser.color,
      targetSocketId: selectedUser.id,
      text: inputValue.trim()
    });
    setInputValue("");
  };

  // Issue #7: Debounced typing handler
  const handleTyping = () => {
    if (!selectedUser || !socket) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("dm-typing", {
        targetColor: selectedUser.color,
        targetSocketId: selectedUser.id
      });
      typingTimeoutRef.current = null;
    }, DM_TYPING_DEBOUNCE_MS);
  };

  // Issue #9: Proper unread count - only count unseen messages sent TO current user
  const unreadCount = dmMessages.filter(
    (m) => m.targetColor === identity?.color && !seenMessageIds.has(m.id)
  ).length;

  return (
    <>
      {/* DM toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative text-witch-sage-500/70 hover:text-witch-plum-400 transition-colors"
        title="Direct messages (crosstalk)"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-witch-plum-500 text-[8px] flex items-center justify-center text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* DM Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed right-2 sm:right-4 top-12 bottom-24 w-72 glass rounded-lg border border-witch-plum-900/40 shadow-xl z-40 flex flex-col overflow-hidden"
          >
            <div className="p-3 border-b border-witch-plum-900/30 flex items-center justify-between">
              <span className="text-xs font-medium text-witch-plum-400/90">
                {selectedUser ? (
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="flex items-center gap-2 hover:text-witch-plum-300 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: selectedUser.color }}
                    />
                    {selectedUser.handle || "Anonymous"}
                  </button>
                ) : (
                  "Crosstalk"
                )}
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="text-witch-sage-500/60 hover:text-witch-plum-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {selectedUser ? (
              <>
                {/* Conversation view */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {filteredDMs.length === 0 ? (
                    <p className="text-xs text-witch-sage-500/50 text-center py-4">
                      Start a private conversation
                    </p>
                  ) : (
                    filteredDMs.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.color === identity?.color ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] px-3 py-2 rounded-lg text-xs ${
                            msg.color === identity?.color
                              ? "bg-witch-plum-700/50 text-witch-parchment/90"
                              : "bg-witch-soot-700/70 text-witch-parchment/80"
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Typing indicator */}
                {dmTyping && dmTyping.color === selectedUser.color && (
                  <p className="px-3 py-1 text-[10px] text-witch-sage-500/60 italic animate-pulse">
                    typing...
                  </p>
                )}

                {/* Input */}
                <div className="p-2 border-t border-witch-plum-900/30 flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      handleTyping();
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSendDM()}
                    placeholder="Whisper..."
                    className="flex-1 bg-witch-soot-800/90 border border-witch-plum-700/50 rounded px-2 py-1.5 text-xs text-witch-parchment placeholder:text-witch-sage-500/70 focus:outline-none focus:ring-1 focus:ring-witch-amber-500/50"
                  />
                  <button
                    onClick={handleSendDM}
                    disabled={!inputValue.trim()}
                    className="px-2 py-1.5 rounded bg-witch-plum-700/70 hover:bg-witch-plum-500/80 text-xs text-witch-parchment disabled:opacity-50 transition-colors"
                  >
                    Send
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* User list */}
                <div className="flex-1 overflow-y-auto">
                  {dmParticipants.length > 0 && (
                    <div className="p-2 border-b border-witch-plum-900/20">
                      <p className="text-[10px] text-witch-sage-500/50 px-2 mb-1">RECENT</p>
                      {dmParticipants.map((p) => (
                        <button
                          key={p.color}
                          onClick={() => setSelectedUser(p)}
                          className="w-full px-3 py-2 flex items-center gap-2 hover:bg-witch-plum-900/30 rounded transition-colors"
                        >
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="text-xs text-witch-parchment/80 truncate">
                            {p.handle || "Anonymous"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="p-2">
                    <p className="text-[10px] text-witch-sage-500/50 px-2 mb-1">IN ROOM</p>
                    {usersInRoom.length === 0 ? (
                      <p className="text-xs text-witch-sage-500/50 px-3 py-2">
                        No one else here
                      </p>
                    ) : (
                      usersInRoom.map((u) => (
                        <button
                          key={u.id || u.color}
                          onClick={() => setSelectedUser({ color: u.color, handle: u.handle, id: u.id })}
                          className="w-full px-3 py-2 flex items-center gap-2 hover:bg-witch-plum-900/30 rounded transition-colors"
                        >
                          <span
                            className={`w-3 h-3 rounded-full ${u.focused ? "" : "opacity-40"}`}
                            style={{ backgroundColor: u.color }}
                          />
                          <span className="text-xs text-witch-parchment/80 truncate">
                            {u.handle || "Anonymous"}
                          </span>
                          {u.steppingAway && (
                            <span className="text-[10px] text-witch-sage-500/50">(away)</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="p-3 border-t border-witch-plum-900/30">
                  <p className="text-[10px] text-witch-sage-500/50 leading-relaxed">
                    Others see you&apos;re whispering, but not what you say.
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
