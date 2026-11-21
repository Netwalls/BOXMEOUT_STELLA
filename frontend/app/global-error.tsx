"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/telemetry";

/** Catches failures in the root layout, which the regular error boundary cannot. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { source: "global-error", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="flex flex-col items-center justify-center gap-4 py-24 px-4 text-center">
          <h1 className="text-xl font-bold">Something went wrong.</h1>
          <p>An unexpected error occurred. Try again.</p>
          <button type="button" onClick={() => reset()} className="px-4 py-2 rounded-md">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
