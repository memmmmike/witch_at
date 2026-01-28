"use client";

import { useRef, useCallback } from "react";

const SOUND_KEY = "witchat_sound";

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const playMessageSound = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(SOUND_KEY) !== "1") return;
    } catch {
      return;
    }
    try {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 320;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } catch (_) {}
  }, []);

  return { playMessageSound };
}
