"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/telemetry";

/** Reports uncaught window errors and unhandled promise rejections. */
export function ErrorReporter(): null {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportError(event.error ?? event.message, { source: "window.onerror" });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportError(event.reason, { source: "unhandledrejection" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
