// ============================================================
// BOXMEOUT — useClaimWinnings Hook
// ============================================================

import { useState, useCallback } from 'react';
import type { TxStatus } from '../types';
import { submitClaimWithStages, stroopsToXlm } from '../services/wallet';
import { useAppStore } from '../store';
import { rpc } from '@stellar/stellar-sdk';

export interface UseClaimWinningsResult {
  claimWinnings: (marketId: string) => Promise<number>;
  txStatus: TxStatus;
  txHash: string | null;
  claimedAmount: number | null;
  error: string | null;
  reset: () => void;
}

const IDLE: TxStatus = { hash: null, status: 'idle', error: null };

export function useClaimWinnings(): UseClaimWinningsResult {
  const [txStatus, setTxStatus] = useState<TxStatus>(IDLE);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [claimedAmount, setClaimedAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { setTxStatus: setStoreTxStatus } = useAppStore();

  const claimWinnings = useCallback(async (marketId: string): Promise<number> => {
    setError(null);
    setTxHash(null);
    setClaimedAmount(null);

    const update = (status: TxStatus) => {
      setTxStatus(status);
      setStoreTxStatus(status);
    };

    update({ hash: null, status: 'signing', error: null });

    try {
      const hash = await submitClaimWithStages(marketId, (stage) => {
        update({ hash: null, status: stage, error: null });
      });

      setTxHash(hash);

      // Parse claimed amount from transaction result
      const server = new rpc.Server(
        process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
          ? 'https://soroban-rpc.stellar.org'
          : 'https://soroban-testnet.stellar.org',
      );
      const txResult = await server.getTransaction(hash);

      let amount = 0;
      if (txResult.status === 'SUCCESS' && (txResult as any).returnValue) {
        try {
          const returnValue = (txResult as any).returnValue;
          const stroops = BigInt(returnValue.i128?.lo ?? 0);
          amount = stroopsToXlm(stroops);
        } catch {
          // If we can't parse, just use 0
        }
      }

      setClaimedAmount(amount);
      update({ hash, status: 'success', error: null });

      // Invalidate caches so useBets and useMarket refetch fresh data
      window.dispatchEvent(new CustomEvent('boxmeout:claim_success', { detail: { marketId, amount } }));

      return amount;
    } catch (e: any) {
      const msg = e?.message ?? 'Claim failed';
      setError(msg);
      update({ hash: null, status: 'error', error: msg });
      throw e;
    }
  }, [setStoreTxStatus]);

  const reset = useCallback(() => {
    setTxStatus(IDLE);
    setStoreTxStatus(IDLE);
    setTxHash(null);
    setClaimedAmount(null);
    setError(null);
  }, [setStoreTxStatus]);

  return { claimWinnings, txStatus, txHash, claimedAmount, error, reset };
}
