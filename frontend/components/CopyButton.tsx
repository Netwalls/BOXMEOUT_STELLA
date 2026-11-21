"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";

/** How long the copied or failed state stays visible, in milliseconds. */
export const COPY_FEEDBACK_MS = 2000;

type CopyState = "idle" | "copied" | "failed";

export interface CopyButtonProps {
  /** Text written to the clipboard when the button is pressed. */
  value: string;
  /** Accessible name in the idle state. */
  label: string;
  /** Accessible name while the copied confirmation is shown. */
  copiedLabel?: string;
  /** Live-region announcement after a successful copy. */
  copiedMessage?: string;
  /** Live-region announcement after a failed copy. */
  failedMessage?: string;
  /** Called once per attempt with whether the copy succeeded, for toasts or analytics. */
  onResult?: (copied: boolean) => void;
  className?: string;
  /** Optional visible text rendered after the icon. */
  children?: ReactNode;
}

/**
 * A copy-to-clipboard button with visible and announced feedback. The button
 * shows a check icon and `copiedLabel` for a short time after success. The
 * polite live region announces the outcome to screen readers, including
 * failures, so the user is never left guessing.
 */
export function CopyButton({
  value,
  label,
  copiedLabel = "Copied",
  copiedMessage = "Copied to clipboard",
  failedMessage = "Could not copy to clipboard",
  onResult,
  className,
  children,
}: CopyButtonProps): JSX.Element {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleClick = async () => {
    const copied = await copyToClipboard(value);
    setState(copied ? "copied" : "failed");
    onResult?.(copied);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState("idle"), COPY_FEEDBACK_MS);
  };

  const isCopied = state === "copied";
  const isFailed = state === "failed";
  const message = isCopied ? copiedMessage : isFailed ? failedMessage : "";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={isCopied ? copiedLabel : label}
        title={isCopied ? copiedLabel : isFailed ? "Copy failed" : label}
        className={className}
      >
        {isCopied ? (
          <Check className="h-3.5 w-3.5 text-green-400" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {children}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </>
  );
}
