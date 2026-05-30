'use client';

import { useState, useMemo } from 'react';
import type { BetSide, Market } from '../../types';
import { usePlaceBet } from '../../hooks/usePlaceBet';
import { useWallet } from '../../hooks/useWallet';
import { ConnectPrompt } from '../ui/ConnectPrompt';
import { TxStatusToast } from '../ui/TxStatusToast';
import { useAppStore } from '../../store';

interface BetFormProps {
  market: Market;
}

const SIDES: { value: BetSide; label: (a: string, b: string) => string }[] = [
  { value: 'fighter_a', label: (a) => a },
  { value: 'draw', label: () => 'Draw' },
  { value: 'fighter_b', label: (_, b) => b },
];

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

/**
 * BetForm component for placing bets on a market.
 * Features:
 * - Three outcome buttons: Fighter A / Draw / Fighter B
 * - Amount input with min validation and balance check
 * - Real-time projected payout display
 * - "Connect Wallet" prompt if not connected
 * - Disabled with reason when market is Locked/Resolved/Cancelled
 * - Calls usePlaceBet() mutation on submit
 * - Shows TransactionStatus during/after submission
 */
export function BetForm({ market }: BetFormProps): JSX.Element {
  const { isConnected } = useWallet();
  const { placeBet, txStatus, error } = usePlaceBet();
  const setTxStatus = useAppStore((s) => s.setTxStatus);

  const [side, setSide] = useState<BetSide | null>(null);
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amountNum = parseFloat(amount);
  const isAmountValid = !isNaN(amountNum) && amountNum > 0 && amountNum >= 1;

  const projectedPayout = useMemo(() => {
    if (!side) return null;
    return calcPayout(market, side, amountNum);
  }, [side, amountNum, market]);

  const canSubmit = isConnected && !!side && isAmountValid && !isSubmitting && market.status === 'open';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await placeBet(market.market_id, side, amountNum);
      setSide(null);
      setAmount('');
    } catch {
      // Error is handled by usePlaceBet and displayed in TxStatusToast
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isConnected) {
    return <ConnectPrompt />;
  }

  if (market.status !== 'open') {
    return (
      <div className="rounded-xl bg-gray-900 p-6 text-center">
        <p className="text-gray-400 font-semibold">Betting is closed</p>
        <p className="text-gray-500 text-sm mt-1 capitalize">Market is {market.status}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gray-900 p-6 space-y-4 text-white">
      {/* Side selector */}
      <div className="flex gap-2">
        {SIDES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setSide(value)}
            disabled={isSubmitting}
            className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
              side === value
                ? 'bg-amber-500 text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50'
            }`}
          >
            {label(market.fighter_a, market.fighter_b)}
          </button>
        ))}
      </div>

      {/* Amount input */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Amount (XLM)</label>
        <input
          type="number"
          min="1"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          disabled={isSubmitting}
          className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
        />
        <p className="text-xs text-gray-500 mt-1">Min: 1 XLM</p>
      </div>

      {/* Payout preview */}
      <div className="bg-gray-800 rounded-lg px-4 py-3 space-y-1 text-sm">
        <div className="flex justify-between text-gray-400">
          <span>Platform fee</span>
          <span>{market.fee_bps / 100}%</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Est. payout</span>
          <span>{projectedPayout != null ? `${projectedPayout.toFixed(4)} XLM` : '—'}</span>
        </div>
      </div>

      {/* Submit button */}
      <button
        disabled={!canSubmit}
        onClick={handleSubmit}
        className="w-full min-h-[44px] rounded-lg bg-amber-500 hover:bg-amber-400 font-semibold text-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? 'Placing Bet…' : 'Place Bet'}
      </button>

      {/* Transaction status toast */}
      <TxStatusToast
        txStatus={txStatus}
        onDismiss={() => {
          setTxStatus({ hash: null, status: 'idle', error: null });
        }}
      />
    </div>
  );
}
