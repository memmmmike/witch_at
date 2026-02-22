"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket, type RoomListItem } from "@/contexts/SocketProvider";
import { getSocket } from "@/lib/socket";

export function RoomSelector() {
  const { currentRoom, roomList } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const socket = getSocket();

  // Click-outside handler to dismiss dropdown (Issue #10)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleRoomClick = (roomId: string) => {
    if (roomId === currentRoom?.id) {
      setIsOpen(false);
      return;
    }
    socket?.emit("switch-room", { roomId });
    setIsOpen(false);
  };

  const handleCreateRoom = () => {
    if (!newRoomTitle.trim() || isCreating) return;
    setIsCreating(true);

    // Issue #3: Shared cleanup to prevent stuck state
    const cleanup = () => {
      socket?.off("room-created", onRoomCreated);
      socket?.off("room-create-failed", onRoomFailed);
      clearTimeout(timeoutId);
      setIsCreating(false);
    };

    const onRoomCreated = (data: { roomId: string }) => {
      cleanup();
      socket?.emit("switch-room", { roomId: data.roomId });
      setNewRoomTitle("");
      setIsSecret(false);
      setShowCreateRoom(false);
      setIsOpen(false);
    };

    const onRoomFailed = () => {
      cleanup();
    };

    // Issue #3: 10-second timeout failsafe for disconnect scenarios
    const timeoutId = setTimeout(() => {
      cleanup();
    }, 10000);

    socket?.on("room-created", onRoomCreated);
    socket?.on("room-create-failed", onRoomFailed);
    socket?.emit("create-room", { title: newRoomTitle.trim(), secret: isSecret });
  };

  const handleRefreshRooms = () => {
    socket?.emit("list-rooms");
  };

  const handleDeleteRoom = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    socket?.emit("delete-room", { roomId });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) handleRefreshRooms();
        }}
        className="flex items-center gap-1.5 text-witch-plum-400/90 hover:text-witch-plum-300 transition-colors text-xs sm:text-sm"
        title="Switch rooms"
      >
        <span className="font-medium">{currentRoom?.title || "the well"}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        {currentRoom?.secret && (
          <span className="text-[10px] text-witch-sage-500/60" title="Secret room">
            (secret)
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-56 glass rounded-lg border border-witch-plum-900/40 shadow-xl z-50 overflow-hidden"
          >
            <div className="p-2 border-b border-witch-plum-900/30">
              <div className="flex items-center justify-between text-[10px] text-witch-sage-500/70 px-2">
                <span>ROOMS</span>
                <button
                  onClick={handleRefreshRooms}
                  className="hover:text-witch-plum-400 transition-colors"
                  title="Refresh"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto">
              {roomList.length === 0 ? (
                <p className="text-xs text-witch-sage-500/60 p-3 text-center">No public rooms</p>
              ) : (
                roomList.map((room: RoomListItem) => (
                  <div
                    key={room.id}
                    className={`w-full px-3 py-2 hover:bg-witch-plum-900/30 transition-colors flex items-center justify-between group ${
                      currentRoom?.id === room.id ? "bg-witch-plum-900/20" : ""
                    }`}
                  >
                    <button
                      onClick={() => handleRoomClick(room.id)}
                      className="flex-1 text-left"
                    >
                      <span className="text-xs text-witch-parchment/90 truncate">{room.title}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-witch-sage-500/60 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-witch-forest-500/70" />
                        {room.presence}
                      </span>
                      {room.id !== "main" && (
                        <button
                          onClick={(e) => handleDeleteRoom(e, room.id)}
                          disabled={room.presence > 0}
                          className={`text-witch-sage-500/50 hover:text-red-400/80 transition-all ${room.presence > 0 ? "opacity-30 cursor-not-allowed" : ""}`}
                          title={room.presence > 0 ? "Room must be empty to delete" : "Delete room"}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-2 border-t border-witch-plum-900/30">
              {showCreateRoom ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newRoomTitle}
                    onChange={(e) => setNewRoomTitle(e.target.value)}
                    placeholder="Room name..."
                    className="w-full bg-witch-soot-800/90 border border-witch-plum-700/50 rounded px-2 py-1.5 text-xs text-witch-parchment placeholder:text-witch-sage-500/70 focus:outline-none focus:ring-1 focus:ring-witch-amber-500/50"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()}
                    autoFocus
                  />
                  <label className="flex items-center gap-2 text-xs text-witch-sage-500/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSecret}
                      onChange={(e) => setIsSecret(e.target.checked)}
                      className="w-3 h-3 rounded bg-witch-soot-800 border-witch-plum-700/50"
                    />
                    Secret (invite only)
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateRoom}
                      disabled={!newRoomTitle.trim()}
                      className="flex-1 px-2 py-1.5 rounded bg-witch-plum-700/70 hover:bg-witch-plum-500/80 text-xs text-witch-parchment disabled:opacity-50 transition-colors"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateRoom(false);
                        setNewRoomTitle("");
                        setIsSecret(false);
                      }}
                      className="px-2 py-1.5 rounded bg-witch-soot-700/70 hover:bg-witch-soot-600/70 text-xs text-witch-parchment transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreateRoom(true)}
                  className="w-full px-2 py-1.5 rounded bg-witch-soot-700/70 hover:bg-witch-soot-600/70 text-xs text-witch-sage-500/90 transition-colors flex items-center justify-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Room
                </button>
              )}
            </div>

            <div className="px-3 py-2 border-t border-witch-plum-900/30">
              <p className="text-[10px] text-witch-sage-500/50 leading-relaxed">
                Join secret rooms via URL: /room-name
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
