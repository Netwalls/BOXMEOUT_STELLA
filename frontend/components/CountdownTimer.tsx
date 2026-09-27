"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export interface CountdownTimerProps {
  targetTimestamp: number;
  label: string;
  /** Text shown once the target timestamp has passed. Defaults to "Ended". */
  expiredLabel?: string;
}

function formatRemaining(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CountdownTimer({ targetTimestamp, label, expiredLabel = "Ended" }: CountdownTimerProps): JSX.Element {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, targetTimestamp - Math.floor(Date.now() / 1000))
  );

  useEffect(() => {
    const id = setInterval(() => {
      const secs = Math.max(0, targetTimestamp - Math.floor(Date.now() / 1000));
      setRemaining(secs);
      if (secs <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [targetTimestamp]);

  const isExpired = remaining <= 0;

  return (
    <span className="text-sm text-gray-400" role="status" aria-live="polite">
      {isExpired ? (
        // framer-motion respects MotionConfig reducedMotion="user" — when the
        // user has prefers-reduced-motion: reduce set, the flash animation is
        // skipped and the element renders at full opacity immediately.
        <motion.span
          className="text-red-400 font-semibold"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {expiredLabel}
        </motion.span>
      ) : (
        <>
          {label}:{" "}
          <motion.span
            key={remaining}
            className="font-mono text-white"
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {formatRemaining(remaining)}
          </motion.span>
        </>
      )}
    </span>
  );
}
