"use client";

import { useRef, useCallback } from "react";

const SOUND_KEY = "witchat_sound";

function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!isSoundEnabled()) return null;
    try {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      return ctx;
    } catch {
      return null;
    }
  }, []);

  // Soft blip for incoming messages
  const playMessageSound = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    try {
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
  }, [getContext]);

  // Soft chime for user join
  const playJoinSound = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440; // A4
      osc.type = "sine";
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  }, [getContext]);

  // Soft falling tone for user leave
  const playLeaveSound = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(350, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.2);
      osc.type = "sine";
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch (_) {}
  }, [getContext]);

  // Gentle pulsing tone for being summoned
  const playSummonSound = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    try {
      // Two-tone ascending chime
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = i === 0 ? 392 : 523; // G4 -> C5
        osc.type = "sine";
        const startTime = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0.08, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
        osc.start(startTime);
        osc.stop(startTime + 0.2);
      }
    } catch (_) {}
  }, [getContext]);

  // Very soft whisper-like sound for typing (barely audible)
  const playTypingSound = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    try {
      const bufferSize = ctx.sampleRate * 0.05; // 50ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // Pink noise
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.02;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.015, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      source.start(ctx.currentTime);
    } catch (_) {}
  }, [getContext]);

  // Distinct chime for topic subscription matches (ignores global sound setting)
  const playTopicSound = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      // Three-note ascending arpeggio
      const notes = [523, 659, 784]; // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        const startTime = ctx.currentTime + i * 0.08;
        gain.gain.setValueAtTime(0.1, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
        osc.start(startTime);
        osc.stop(startTime + 0.15);
      });
    } catch (_) {}
  }, []);

  return { playMessageSound, playJoinSound, playLeaveSound, playSummonSound, playTypingSound, playTopicSound };
}
