// ============================================================
// BOXMEOUT — useBet Hook
// ============================================================

import { useState, useCallback, useMemo } from 'react';
import type { BetSide, Market, TxStatus } from '../types';
import { submitBet } from '../services/wallet';
import { useAppStore } from '../store';

export interface UseBetResult {
  side: BetSide | null;
  setSide: (side: BetSide) => void;
  amount: string;
  setAmount: (amount: string) => void;
  estimatedPayout: number | null;
  isSubmitting: boolean;
  txStatus: TxStatus;
  error: string | null;
  submitBet: () => Promise<void>;
  reset: () => void;
}

const FEE_DIVISOR = 10000;

function calcPayout(market: Market, side: BetSide, amountXlm: number): number | null {
  if (!amountXlm || amountXlm <= 0) return null;
  const poolA = Number(market.pool_a) / 1e7;
  const poolB = Number(market.pool_b) / 1e7;
  const poolDraw = Number(market.pool_draw) / 1e7;
  const sidePool = side === 'fighter_a' ? poolA : side === 'fighter_b' ? poolB : poolDraw;
  const total = poolA + poolB + poolDraw + amountXlm;
  const newSidePool = sidePool + amountXlm;
  if (newSidePool === 0) return null;
  const gross = (amountXlm / newSidePool) * total;
  return gross * (1 - market.fee_bps / FEE_DIVISOR);
}

export function useBet(market: Market): UseBetResult {
  const [side, setSide] = useState<BetSide | null>(null);
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { lastTxStatus, setTxStatus, walletAddress } = useAppStore();

  const estimatedPayout = useMemo(() => {
    if (!side) return null;
    const xlm = parseFloat(amount);
    return calcPayout(market, side, xlm);
  }, [side, amount, market]);

  const submit = useCallback(async () => {
    if (!side || !walletAddress) return;
    const xlm = parseFloat(amount);
    if (!xlm || xlm <= 0) return;
    setError(null);
    setIsSubmitting(true);
    setTxStatus({ hash: null, status: 'pending', error: null });
    try {
      const hash = await submitBet(market.market_id, side, xlm);
      setTxStatus({ hash, status: 'success', error: null });
    } catch (e: any) {
      const msg = e?.message ?? 'Transaction failed';
      setError(msg);
      setTxStatus({ hash: null, status: 'error', error: msg });
    } finally {
      setIsSubmitting(false);
    }
  }, [side, amount, market, walletAddress, setTxStatus]);

  const reset = useCallback(() => {
    setSide(null);
    setAmount('');
    setError(null);
    setTxStatus({ hash: null, status: 'idle', error: null });
  }, [setTxStatus]);

  return { side, setSide, amount, setAmount, estimatedPayout, isSubmitting, txStatus: lastTxStatus, error, submitBet: submit, reset };
}
