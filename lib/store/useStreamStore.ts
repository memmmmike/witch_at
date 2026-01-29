/**
 * Zustand store for the ephemeral message stream.
 * Rule of Three: newest 3 are fully visible, older ones fade gradually.
 * We keep up to MAX_VISIBLE messages before marking oldest as leaving.
 */

import { create } from "zustand";

export type Message = {
  id: string;
  text: string;
  color: string;
  handle: string | null;
  tag?: string | null;
  sigil?: string | null;
  whisper?: boolean;
  ts: number;
  leaving?: boolean;
  ghost?: boolean; // Messages you weren't present for - shown blurred
  flagged?: boolean; // Message was moderated (bigotry masked)
};

const MAX_VISIBLE = 6; // Keep 6 messages, fade those beyond the newest 3

type StreamState = {
  messages: Message[];
  addMessage: (msg: Omit<Message, "leaving">) => void;
  markLeaving: (id: string) => void;
  removeAfterDissipate: (id: string) => void;
  setStream: (messages: Message[]) => void;
  clearStream: () => void;
  updateHandleForColor: (color: string, handle: string | null) => void;
  updateTagForColor: (color: string, tag: string | null) => void;
  updateSigilForColor: (color: string, sigil: string | null) => void;
};

export const useStreamStore = create<StreamState>((set, get) => ({
  messages: [],

  addMessage: (msg) => {
    set((state) => {
      const next = [...state.messages, { ...msg, leaving: false }];
      // Rule of Three: if we exceed 3 visible, mark oldest non-leaving as leaving
      const visible = next.filter((m) => !m.leaving);
      if (visible.length > MAX_VISIBLE) {
        const oldest = visible[0];
        const updated = next.map((m) =>
          m.id === oldest.id ? { ...m, leaving: true } : m
        );
        return { messages: updated };
      }
      return { messages: next };
    });
  },

  markLeaving: (id) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, leaving: true } : m
      ),
    }));
  },

  removeAfterDissipate: (id) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    }));
  },

  setStream: (messages) => {
    set({ messages: messages.map((m) => ({ ...m, leaving: false })) });
  },

  clearStream: () => set({ messages: [] }),

  updateHandleForColor: (color, handle) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.color === color ? { ...m, handle } : m
      ),
    }));
  },
  updateTagForColor: (color, tag) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.color === color ? { ...m, tag } : m
      ),
    }));
  },
  updateSigilForColor: (color, sigil) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.color === color ? { ...m, sigil } : m
      ),
    }));
  },
}));
