"use client";
import { useEffect, useState } from "react";

export interface CountdownTimerProps {
  targetTimestamp: number;
  label: string;
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "LIVE";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CountdownTimer({ targetTimestamp, label }: CountdownTimerProps): JSX.Element {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, targetTimestamp - Math.floor(Date.now() / 1000))
  );

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining(Math.max(0, targetTimestamp - Math.floor(Date.now() / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [targetTimestamp, remaining]);

  const display = formatRemaining(remaining);

  return (
    <span className="text-sm text-gray-400">
      {display === "LIVE" ? (
        <span className="text-green-400 font-semibold">LIVE</span>
      ) : (
        <>{label}: <span className="font-mono text-white">{display}</span></>
      )}
    </span>
  );
}
