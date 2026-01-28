"use client";

import { useEffect, useState } from "react";

const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"] as const;

/**
 * Returns true when the user has had no activity (mouse, keyboard, touch, scroll) for `thresholdMs`.
 * When they interact again, returns false. Used to hide the stream while idle.
 */
export function useIdle(thresholdMs: number): boolean {
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      setIsIdle(false);
      timeoutId = setTimeout(() => {
        setIsIdle(true);
        timeoutId = null;
      }, thresholdMs);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, resetTimer));

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [thresholdMs]);

  return isIdle;
}
