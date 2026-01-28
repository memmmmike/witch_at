"use client";

import { useState, useEffect } from "react";
import { useSocket } from "@/contexts/SocketProvider";
import { SigilIcon } from "./SigilIcon";

const SOUND_KEY = "witchat_sound";
const SIGILS = ["spiral", "eye", "triangle", "cross", "diamond"] as const;

export function Glamour() {
  const { socket, identity } = useSocket();
  const [revealOpen, setRevealOpen] = useState(false);
  const [handleInput, setHandleInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [selectedSigil, setSelectedSigil] = useState<string>(SIGILS[0]);
  const [soundOn, setSoundOn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setSoundOn(localStorage.getItem(SOUND_KEY) === "1");
    } catch (_) {}
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    } catch (_) {}
  };

  const handleReveal = () => {
    if (socket) {
      socket.emit("reveal", {
        handle: handleInput.trim() || null,
        tag: tagInput.trim() || null,
        sigil: selectedSigil && SIGILS.includes(selectedSigil as (typeof SIGILS)[number]) ? selectedSigil : SIGILS[0],
      });
      setRevealOpen(false);
    }
  };

  useEffect(() => {
    if (revealOpen && identity) {
      setHandleInput(identity.handle ?? "");
      setTagInput(identity.tag ?? "");
      setSelectedSigil(identity.sigil && SIGILS.includes(identity.sigil as (typeof SIGILS)[number]) ? identity.sigil : SIGILS[0]);
    }
  }, [revealOpen, identity]);

  const color = identity?.color ?? "#7b5278";
  const handle = identity?.handle ?? null;
  const tag = identity?.tag ?? null;
  const sigil = identity?.sigil ?? null;

  return (
    <div className="absolute top-4 right-4 flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-4 h-4 rounded-full border border-white/10 shrink-0"
          style={{ backgroundColor: color }}
          title="Your aura"
        />
        {sigil && (
          <span className="text-witch-plum-400/80" style={{ color }} title={sigil}>
            <SigilIcon sigil={sigil} color="currentColor" size={16} />
          </span>
        )}
        {tag && (
          <span className="text-[10px] text-witch-sage-500/80 italic max-w-[60px] truncate">
            {tag}
          </span>
        )}
        {handle && (
          <span className="text-xs font-mono text-witch-plum-400/95 max-w-[120px] truncate">
            {handle}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={toggleSound}
        className="text-xs text-witch-sage-500/70 hover:text-witch-plum-400/90"
        title={soundOn ? "Sound on" : "Sound off"}
      >
        {soundOn ? "🔔" : "🔕"}
      </button>
      <button
        type="button"
        onClick={() => setRevealOpen((o) => !o)}
        className="text-xs text-witch-amber-400/90 hover:text-witch-amber-400 border border-witch-amber-500/40 hover:border-witch-amber-500/60 rounded px-2 py-1 transition-colors"
        title={revealOpen ? "Close panel" : handle || tag ? "Edit identity" : "Set handle, tag, sigil"}
      >
        {revealOpen ? "Close" : handle || tag ? "Edit Identity" : "Reveal Identity"}
      </button>
      {revealOpen && (
        <div className="absolute top-full right-0 mt-2 glass rounded-lg p-3 border border-witch-plum-900/40 flex flex-col gap-2 min-w-[200px]">
          <input
            type="text"
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            placeholder="Handle (optional)"
            maxLength={32}
            className="bg-witch-soot-800/90 border border-witch-plum-700/50 rounded px-3 py-2 text-sm text-witch-parchment placeholder:text-witch-sage-500/70 focus:outline-none focus:ring-1 focus:ring-witch-amber-500/50"
          />
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Tag (one word, e.g. they, scribe)"
            maxLength={16}
            className="bg-witch-soot-800/90 border border-witch-plum-700/50 rounded px-3 py-2 text-sm text-witch-parchment placeholder:text-witch-sage-500/70 focus:outline-none focus:ring-1 focus:ring-witch-amber-500/50"
          />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-witch-sage-500/80 uppercase tracking-wide">Sigil</span>
            <div className="flex gap-2">
              {SIGILS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedSigil(s)}
                  title={s}
                  className={`rounded p-1.5 transition-colors ${
                    selectedSigil === s
                      ? "bg-witch-amber-500/30 border border-witch-amber-500/60"
                      : "bg-witch-soot-800/80 border border-witch-plum-700/40 hover:border-witch-plum-500/50"
                  }`}
                  style={selectedSigil === s ? { color } : undefined}
                >
                  <SigilIcon sigil={s} color={selectedSigil === s ? color : "currentColor"} size={18} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setRevealOpen(false)}
              className="text-xs text-witch-sage-500/80 hover:text-witch-plum-400/90 rounded px-3 py-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReveal}
              className="text-xs bg-witch-plum-700/70 hover:bg-witch-plum-500/80 text-witch-parchment rounded px-3 py-2 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
