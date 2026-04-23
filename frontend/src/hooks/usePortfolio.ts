// ============================================================
// BOXMEOUT — usePortfolio Hook
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import type { Portfolio, TxStatus } from '../types';
import { useWallet } from './useWallet';
import { fetchPortfolio } from '../services/api';
import { submitClaim, submitRefund } from '../services/wallet';

export interface UsePortfolioResult {
  portfolio: Portfolio | null;
  isLoading: boolean;
  error: Error | null;
  claimTxStatus: TxStatus;
  /** Submits claim_winnings for a market contract. Refreshes portfolio after. */
  claimWinnings: (market_contract_address: string) => Promise<void>;
  /** Submits claim_refund for a cancelled market. Refreshes portfolio after. */
  claimRefund: (market_contract_address: string) => Promise<void>;
}

/**
 * Fetches the portfolio for the currently connected wallet.
 * Returns null portfolio if no wallet is connected.
 * Refreshes automatically after a successful claim.
 */
export function usePortfolio(): UsePortfolioResult {
  const { address } = useWallet();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [claimTxStatus, setClaimTxStatus] = useState<TxStatus>({
    hash: null,
    status: 'idle',
    error: null,
  });

  const load = useCallback(async () => {
    if (!address) { setPortfolio(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      setPortfolio(await fetchPortfolio(address));
    } catch (e: any) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  const runClaim = useCallback(async (fn: () => Promise<string>) => {
    setClaimTxStatus({ hash: null, status: 'pending', error: null });
    try {
      const hash = await fn();
      setClaimTxStatus({ hash, status: 'success', error: null });
      await load();
    } catch (e: any) {
      setClaimTxStatus({ hash: null, status: 'error', error: e?.message ?? String(e) });
    }
  }, [load]);

  const claimWinnings = useCallback(
    (market_contract_address: string) =>
      runClaim(() => submitClaim(market_contract_address)),
    [runClaim],
  );

  const claimRefund = useCallback(
    (market_contract_address: string) =>
      runClaim(() => submitRefund(market_contract_address)),
    [runClaim],
  );

  return { portfolio, isLoading, error, claimTxStatus, claimWinnings, claimRefund };
}
