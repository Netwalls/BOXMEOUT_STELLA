"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useAccessibleDialog } from "@/hooks/useAccessibleDialog";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TxStatus = "pending" | "success" | "error";
export type TransactionStatus = TxStatus;

export interface TransactionStatusModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Current transaction state */
  status: TxStatus;
  /** Optional title override per state */
  title?: string;
  /** Success: the confirmed transaction hash used to build the explorer link */
  txHash?: string;
  /** Error: a human-readable description (not a raw stack trace) */
  errorMessage?: string;
  /** Called when the user dismisses the modal (success or error states only) */
  onClose: () => void;
  /**
   * Stellar block explorer base URL.
   * Defaults to Stellar Expert on testnet.
   */
  explorerBaseUrl?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_EXPLORER = "https://stellar.expert/explorer/testnet/tx";

function buildExplorerUrl(hash: string, base: string): string {
  return `${base.replace(/\/$/, "")}/${hash}`;
}

/**
 * Converts a raw error to a human-readable message.
 * Strips stack traces, internal contract error codes, and raw XDR blobs.
 */
export function humanizeError(raw: string | Error | null | undefined): string {
  if (!raw) return "An unexpected error occurred. Please try again.";

  const text = raw instanceof Error ? raw.message : raw;

  // Trim to the first meaningful sentence to avoid dumping stack traces
  const firstLine = text.split(/\n/)[0]?.trim() ?? "";

  // If it looks like a raw object or very long technical string, use a fallback
  if (firstLine.length > 200 || firstLine.startsWith("{") || firstLine.startsWith("Error:")) {
    return "The transaction failed. Please check your wallet and try again.";
  }

  return firstLine || "An unexpected error occurred. Please try again.";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin h-12 w-12 text-amber-400 mx-auto"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-12 w-12 text-green-400 mx-auto"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      className="h-12 w-12 text-red-400 mx-auto"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
      />
    </svg>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

/**
 * TransactionStatusModal — generic modal that reflects the three phases of a
 * Stellar / Soroban wallet transaction:
 *
 * - **pending**: spinner, non-dismissable (user should not navigate away)
 * - **success**: checkmark + optional block-explorer link for the tx hash
 * - **error**:  warning icon + human-readable error message (never a raw stack trace)
 */
export function TransactionStatusModal({
  isOpen,
  status,
  title,
  txHash,
  errorMessage,
  onClose,
  explorerBaseUrl = DEFAULT_EXPLORER,
}: TransactionStatusModalProps): JSX.Element | null {
  const canDismiss = status === "success" || status === "error";
  const dialogRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");

  const handleClose = useCallback(() => {
    if (canDismiss) {
      setAnnouncement("");
      onClose();
    }
  }, [canDismiss, onClose]);

  // ── Derived display content ──
  const defaultTitles: Record<TxStatus, string> = {
    pending: "Processing Transaction…",
    success: "Transaction Confirmed",
    error: "Transaction Failed",
  };

  const displayTitle = title ?? defaultTitles[status];
  const friendlyError = humanizeError(errorMessage);
  const explorerUrl = txHash ? buildExplorerUrl(txHash, explorerBaseUrl) : null;

  // Announce status changes to assistive technology
  useEffect(() => {
    if (!isOpen) {
      setAnnouncement("");
      return;
    }
    if (status === "pending") {
      setAnnouncement(`${displayTitle}. Please keep this window open while your transaction is confirmed.`);
    } else if (status === "success") {
      setAnnouncement(`${displayTitle}. Your transaction was successfully confirmed on-chain.`);
    } else if (status === "error") {
      setAnnouncement(`${displayTitle}. ${friendlyError}`);
    }
  }, [isOpen, status, displayTitle, friendlyError]);

  useAccessibleDialog({
    isOpen,
    containerRef: dialogRef,
    onClose: handleClose,
    isBusy: status === "pending",
    onBlockedEscape: () => {
      setAnnouncement("Transaction is in progress. Please keep this window open while confirmation completes.");
    },
  });

  if (!isOpen) return null;

  return createPortal(
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleClose}
      role="presentation"
    >
      {/* Panel */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-gray-900 rounded-2xl border border-gray-700 p-8 w-full max-w-sm mx-4 space-y-5 text-center shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-modal-title"
        aria-describedby="tx-modal-body"
      >
        {/* Screen reader announcement region for live status changes & escape blocks */}
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>
        {/* Icon */}
        <div className="flex justify-center">
          {status === "pending" && <Spinner />}
          {status === "success" && <CheckIcon />}
          {status === "error" && <ErrorIcon />}
        </div>

        {/* Title */}
        <h2 id="tx-modal-title" className="text-lg font-semibold text-white">
          {displayTitle}
        </h2>

        {/* Body */}
        <div id="tx-modal-body" className="space-y-3">
          {status === "pending" && (
            <p className="text-sm text-gray-400">
              Please keep this window open while your transaction is being confirmed
              on the Stellar network.
            </p>
          )}

          {status === "success" && (
            <>
              <p className="text-sm text-gray-400">
                Your transaction was successfully confirmed on-chain.
              </p>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
                >
                  View on Stellar Expert
                  {/* External link icon */}
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
            </>
          )}

          {status === "error" && (
            <p className="text-sm text-red-300 bg-red-950/30 rounded-lg px-4 py-3 border border-red-900">
              {friendlyError}
            </p>
          )}
        </div>

        {/* Close button — only shown when the modal can be dismissed */}
        {canDismiss && (
          <button
            onClick={handleClose}
            className="w-full rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2.5 transition-colors"
          >
            {status === "success" ? "Done" : "Dismiss"}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
