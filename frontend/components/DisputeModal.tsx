"use client";
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Market, Bet } from "@/lib/api";
import { CountdownTimer } from "@/components/CountdownTimer";
import { buildSorobanInvocation, submitTransaction } from "@/lib/stellar";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/components/ToastProvider";

/** Soroban contract maximum for the dispute reason string. */
const MAX_REASON_CHARS = 256;
const MIN_REASON_CHARS = 20;
/** 24-hour dispute window in seconds. */
const DISPUTE_WINDOW_SEC = 86400;

export interface DisputeModalProps {
  market: Market;
  /** Bets placed by the current user in this market. Used to guard the submit button. */
  userBets?: Bet[];
  isOpen: boolean;
  onDisputed: () => void;
  onClose: () => void;
}

export function DisputeModal({
  market,
  userBets = [],
  isOpen,
  onDisputed,
  onClose,
}: DisputeModalProps): JSX.Element | null {
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { address, signTransaction, isNetworkMismatched } = useWallet();
  const { addToast: showToast } = useToast();

  // Compute dispute window end timestamp (seconds since epoch)
  // Uses scheduledAt as proxy for resolvedAt since Market type has no resolvedAt field.
  const resolvedAtSec = Math.floor(new Date(market.scheduledAt).getTime() / 1000);
  const windowEndSec = resolvedAtSec + DISPUTE_WINDOW_SEC;

  const withinWindow =
    market.status === "Resolved" && Date.now() < windowEndSec * 1000;

  const hasUserBets = userBets.length > 0;
  const canSubmit = withinWindow && hasUserBets && !isSubmitting;

  const handleClose = useCallback(() => {
    setReason("");
    setValidationError(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen || !withinWindow) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!withinWindow) {
      setValidationError("The dispute window has closed.");
      return;
    }
    if (!hasUserBets) {
      setValidationError("You must have placed a bet to dispute this result.");
      return;
    }
    if (reason.trim().length < MIN_REASON_CHARS) {
      setValidationError(`Reason must be at least ${MIN_REASON_CHARS} characters.`);
      return;
    }
    if (reason.length > MAX_REASON_CHARS) {
      setValidationError(`Reason must not exceed ${MAX_REASON_CHARS} characters.`);
      return;
    }
    if (!address) {
      setValidationError("Wallet not connected.");
      return;
    }
    if (isNetworkMismatched) {
      setValidationError("Wallet is connected to the wrong network.");
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);

    try {
      // Call dispute_resolution on-chain
      const xdr = await buildSorobanInvocation({
        contractId: market.id,
        method: "dispute_resolution",
        args: [reason.trim()],
        signerAddress: address,
      });

      const signedXdr = await signTransaction(xdr);
      await submitTransaction(signedXdr);

      showToast("Dispute submitted successfully.", "success");
      onDisputed();
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setValidationError(`Submission failed: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const charsLeft = MAX_REASON_CHARS - reason.length;
  const isOverLimit = reason.length > MAX_REASON_CHARS;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleClose}
    >
      <div
        className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-full max-w-md mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispute-modal-title"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="dispute-modal-title" className="text-lg font-semibold text-white">
            Dispute This Result
          </h2>
          {/* Countdown timer showing time remaining in dispute window */}
          <CountdownTimer
            targetTimestamp={windowEndSec}
            label="Window closes"
            expiredLabel="Window closed"
          />
        </div>

        <p className="text-sm text-gray-400">
          If you believe the reported outcome is incorrect, submit a dispute with a detailed
          reason. Disputes must be raised within 24 hours of resolution.
        </p>

        {!hasUserBets && (
          <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
            You must have placed a bet in this market to file a dispute.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <textarea
              value={reason}
              onChange={(e) => {
                // Allow typing but flag over-limit in real time
                setReason(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder={`Describe why this result is incorrect (${MIN_REASON_CHARS}–${MAX_REASON_CHARS} characters)…`}
              rows={4}
              maxLength={MAX_REASON_CHARS + 1} // allow 1 over so the counter turns red
              className={`w-full rounded-md border bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                isOverLimit ? "border-red-500" : "border-gray-700"
              }`}
              disabled={isSubmitting || !hasUserBets}
              aria-describedby="reason-counter"
            />

            {/* Character counter */}
            <p
              id="reason-counter"
              className={`mt-1 text-xs text-right ${
                isOverLimit
                  ? "text-red-400"
                  : charsLeft < 30
                  ? "text-amber-400"
                  : "text-gray-500"
              }`}
            >
              {isOverLimit ? `${Math.abs(charsLeft)} over limit` : `${charsLeft} remaining`}
            </p>

            {validationError && (
              <p className="mt-1 text-xs text-red-400" role="alert">
                {validationError}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-md text-sm text-gray-300 hover:text-white hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || isOverLimit}
              className="px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting…" : "Submit Dispute"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
