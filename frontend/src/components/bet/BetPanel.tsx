'use client';

import { useState } from 'react';
import type { BetSide, Market } from '../../types';
import { useBet } from '../../hooks/useBet';
import { useWallet } from '../../hooks/useWallet';
import { BetConfirmModal } from './BetConfirmModal';
import { TxStatusToast } from '../ui/TxStatusToast';
import { useAppStore } from '../../store';

interface BetPanelProps {
  market: Market;
}

const SIDES: { value: BetSide; label: (a: string, b: string) => string }[] = [
  { value: 'fighter_a', label: (a) => a },
  { value: 'draw', label: () => 'Draw' },
  { value: 'fighter_b', label: (_, b) => b },
];

export function BetPanel({ market }: BetPanelProps): JSX.Element {
  const { isConnected, connect } = useWallet();
  const { side, setSide, amount, setAmount, estimatedPayout, isSubmitting, txStatus, submitBet, reset } = useBet(market);
  const setTxStatus = useAppStore((s) => s.setTxStatus);
  const [showModal, setShowModal] = useState(false);

  const amountNum = parseFloat(amount);
  const isAmountValid = !isNaN(amountNum) && amountNum > 0;
  const canSubmit = isConnected && !!side && isAmountValid && !isSubmitting && market.status === 'open';

  if (!isConnected) {
    return (
      <div className="rounded-xl bg-gray-900 p-6 text-center space-y-3">
        <p className="text-gray-400 text-sm">Connect your wallet to place a bet</p>
        <button onClick={connect} className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 font-semibold text-black">
          Connect Wallet to Bet
        </button>
      </div>
    );
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
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              side === value
                ? 'bg-amber-500 text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
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
          className="w-full bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
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
          <span>{estimatedPayout != null ? `${estimatedPayout.toFixed(4)} XLM` : '—'}</span>
        </div>
      </div>

      {/* Submit */}
      <button
        disabled={!canSubmit}
        onClick={() => setShowModal(true)}
        className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 font-semibold text-black disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Placing Bet…' : 'Place Bet'}
      </button>

      <BetConfirmModal
        isOpen={showModal}
        fighter_a={market.fighter_a}
        fighter_b={market.fighter_b}
        side={side ?? 'fighter_a'}
        amount_xlm={amountNum || 0}
        estimated_payout_xlm={estimatedPayout ?? 0}
        fee_bps={market.fee_bps}
        onCancel={() => setShowModal(false)}
        onConfirm={async () => {
          setShowModal(false);
          await submitBet();
        }}
      />

      <TxStatusToast
        txStatus={txStatus}
        onDismiss={() => {
          setTxStatus({ hash: null, status: 'idle', error: null });
          if (txStatus.status === 'success') reset();
        }}
      />
    </div>
  );
}
