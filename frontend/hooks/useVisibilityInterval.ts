"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `callback` on a fixed interval, but only while the document is visible.
 * When the tab is hidden the interval is cleared so background tabs stop
 * polling; when the tab becomes visible again the callback fires immediately
 * and the interval resumes.
 *
 * @param callback Function invoked on each tick. Kept in a ref so callers do
 *   not need to memoize it.
 * @param delay Interval in milliseconds. Pass `null` to disable the interval.
 */
export function useVisibilityInterval(
  callback: () => void,
  delay: number | null
): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      callbackRef.current();
    };

    const start = () => {
      if (interval !== null) return;
      tick();
      interval = setInterval(tick, delay);
    };

    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    if (typeof document !== "undefined" && document.hidden) {
      // Tab is already hidden; wait for it to become visible before starting.
    } else {
      start();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stop();
    };
  }, [delay]);
}
