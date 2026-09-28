"use client";

import { useEffect, useState } from "react";
import { getTransaction, type TransactionStatus } from "../lib/stellar";

const EXPLORER_BASE = "https://stellar.expert/explorer/testnet/tx";
const POLL_TIMEOUT_MS = 30_000;
const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 5_000;

/**
 * Confirmation states surfaced to the UI.
 * - pending: still polling getTransaction
 * - success: ledger reports SUCCESS
 * - failed: ledger reports FAILED
 * - timeout: 30s elapsed without a terminal status
 */
export type ConfirmationState = "pending" | "success" | "failed" | "timeout";

interface TransactionStatusModalProps {
  /** Transaction hash returned by submitTransaction. */
  txHash: string;
  /** Optional network override; defaults to testnet explorer. */
  network?: "testnet" | "public";
  /** Called whenever the confirmation state changes. */
  onStatusChange?: (state: ConfirmationState) => void;
  /** Called once a terminal state (success/failed/timeout) is reached. */
  onClose?: () => void;
}

function explorerUrl(txHash: string, network: "testnet" | "public"): string {
  const base =
    network === "public"
      ? "https://stellar.expert/explorer/public/tx"
      : EXPLORER_BASE;
  return `${base}/${txHash}`;
}

/**
 * Polls getTransaction with exponential backoff until the transaction reaches
 * SUCCESS/FAILED or the 30s timeout elapses, then reports the state.
 */
export default function TransactionStatusModal({
  txHash,
  network = "testnet",
  onStatusChange,
  onClose,
}: TransactionStatusModalProps) {
  const [state, setState] = useState<ConfirmationState>("pending");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    let delay = INITIAL_DELAY_MS;

    const update = (next: ConfirmationState) => {
      if (cancelled) return;
      setState(next);
      onStatusChange?.(next);
      if (next !== "pending") onClose?.();
    };

    const poll = async () => {
      if (cancelled) return;

      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        update("timeout");
        return;
      }

      try {
        const status: TransactionStatus = await getTransaction(txHash);
        if (cancelled) return;

        if (status === "SUCCESS") {
          update("success");
          return;
        }
        if (status === "FAILED") {
          update("failed");
          return;
        }
      } catch {
        // Transient errors (e.g. tx not yet indexed) are retried until timeout.
      }

      if (cancelled) return;
      delay = Math.min(delay * 2, MAX_DELAY_MS);
      timer = setTimeout(poll, delay);
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [txHash, onStatusChange, onClose]);

  const url = explorerUrl(txHash, network);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Transaction status"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">
          Transaction status
        </h2>

        <p className="mt-2 text-sm text-gray-600">
          {state === "pending" && "Waiting for confirmation…"}
          {state === "success" && "Transaction confirmed."}
          {state === "failed" && "Transaction failed."}
          {state === "timeout" &&
            "Timed out after 30s. The transaction may still confirm."}
        </p>

        <p className="mt-4 break-all text-xs text-gray-500">
          Tx hash: <span className="font-mono">{txHash}</span>
        </p>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          View on stellar.expert
        </a>

        {state !== "pending" && (
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
