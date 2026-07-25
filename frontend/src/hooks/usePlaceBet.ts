// ============================================================
// BOXMEOUT — usePlaceBet Hook
// Mutation hook for signing and broadcasting place_bet transactions
// ============================================================

import { useCallback, useState } from 'react';
import type { BetSide, TxStatus } from '../types';
import { submitBet, WalletSignError, TxSubmissionError } from '../services/wallet';
import { useAppStore } from '../store';

export interface UsePlaceBetResult {
  placeBet: (market_id: string, side: BetSide, amount: number, token: string, minXlmOut: number) => Promise<void>;
  txStatus: TxStatus;
  txHash: string | null;
  error: string | null;
  errorType: 'wallet-rejected' | 'network-failed' | 'contract-reverted' | null;
  reset: () => void;
}

/**
 * Mutation hook for placing a bet on a market.
 * Manages state machine: idle → signing → broadcasting → confirming → success | error
 * On success, invalidates useMarket and useBets query caches.
 */
export function usePlaceBet(): UsePlaceBetResult {
  const [txStatus, setTxStatus] = useState<TxStatus>({ hash: null, status: 'idle', error: null });
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'wallet-rejected' | 'network-failed' | 'contract-reverted' | null>(null);
  const { setTxStatus: setAppTxStatus } = useAppStore();

  const placeBet = useCallback(
    async (market_id: string, side: BetSide, amount: number, token: string, minXlmOut: number) => {
      setError(null);
      setErrorType(null);
      setTxStatus({ hash: null, status: 'signing', error: null });

      try {
        // Sign and broadcast transaction
        setTxStatus({ hash: null, status: 'broadcasting', error: null });
        const hash = await submitBet(market_id, side, amount, token, minXlmOut);

        // Confirm transaction
        setTxStatus({ hash, status: 'confirming', error: null });

        // Success
        setTxStatus({ hash, status: 'success', error: null });
        setAppTxStatus({ hash, status: 'success', error: null });

        // Invalidate caches (handled by parent component via useMarket/useBets polling)
      } catch (err: any) {
        const msg = err?.message ?? 'Transaction failed';
        let type: 'wallet-rejected' | 'network-failed' | 'contract-reverted' = 'network-failed';

        if (err instanceof WalletSignError) {
          type = 'wallet-rejected';
        } else if (err instanceof TxSubmissionError) {
          // Check if it's a contract error or network error
          if (err.details?.status === 'FAILED') {
            type = 'contract-reverted';
          }
        }

        setError(msg);
        setErrorType(type);
        setTxStatus({ hash: null, status: 'error', error: msg });
        setAppTxStatus({ hash: null, status: 'error', error: msg });
        throw err;
      }
    },
    [setAppTxStatus],
  );

  const reset = useCallback(() => {
    setTxStatus({ hash: null, status: 'idle', error: null });
    setError(null);
    setErrorType(null);
    setAppTxStatus({ hash: null, status: 'idle', error: null });
  }, [setAppTxStatus]);

  return {
    placeBet,
    txStatus,
    txHash: txStatus.hash,
    error,
    errorType,
    reset,
  };
}
