'use client';

import type { TxStatus } from '../../types';
import { TX_PENDING_STATES } from '../../types';
import { stellarExplorerUrl } from '../../services/wallet';

const PENDING_LABELS: Record<string, string> = {
  signing: 'Waiting for signature…',
  broadcasting: 'Broadcasting to network…',
  confirming: 'Confirming on Stellar…',
};

interface TransactionStatusProps {
  txStatus: TxStatus;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function TransactionStatus({ txStatus, onRetry, onDismiss }: TransactionStatusProps): JSX.Element | null {
  const { status, hash, error } = txStatus;

  if (status === 'idle') return null;

  const isPending = (TX_PENDING_STATES as readonly string[]).includes(status);

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border p-4 flex items-start gap-3 text-sm
        bg-gray-900 border-gray-700 dark:bg-gray-900 dark:border-gray-700"
    >
      {isPending && (
        <>
          <svg
            className="animate-spin h-5 w-5 text-amber-400 shrink-0 mt-0.5"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-gray-200">{PENDING_LABELS[status]}</p>
        </>
      )}

      {status === 'success' && (
        <>
          <svg className="h-5 w-5 text-green-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="font-semibold text-green-400">Transaction confirmed!</p>
            {hash && (
              <a
                href={stellarExplorerUrl('tx', hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 underline break-all text-xs mt-1 block"
              >
                View on Stellar Explorer ↗
              </a>
            )}
          </div>
          {onDismiss && (
            <button onClick={onDismiss} aria-label="Dismiss" className="text-gray-400 hover:text-white">✕</button>
          )}
        </>
      )}

      {status === 'error' && (
        <>
          <svg className="h-5 w-5 text-red-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="font-semibold text-red-400">Transaction failed</p>
            {error && <p className="text-gray-300 mt-0.5">{error}</p>}
            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-2 text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg transition-colors"
              >
                Retry
              </button>
            )}
          </div>
          {onDismiss && (
            <button onClick={onDismiss} aria-label="Dismiss" className="text-gray-400 hover:text-white">✕</button>
          )}
        </>
      )}
    </div>
  );
}
