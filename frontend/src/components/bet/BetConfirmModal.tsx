'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { BetSide } from '../../types';

interface BetConfirmModalProps {
  isOpen: boolean;
  fighter_a: string;
  fighter_b: string;
  side: BetSide;
  amount_xlm: number;
  estimated_payout_xlm: number;
  fee_bps: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const SIDE_LABEL: Record<BetSide, (a: string, b: string) => string> = {
  fighter_a: (a) => a,
  fighter_b: (_, b) => b,
  draw: () => 'Draw',
};

export function BetConfirmModal({
  isOpen, fighter_a, fighter_b, side, amount_xlm, estimated_payout_xlm, fee_bps, onConfirm, onCancel,
}: BetConfirmModalProps): JSX.Element {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return <></>;

  const feeXlm = amount_xlm * (fee_bps / 10000);
  const chosen = SIDE_LABEL[side](fighter_a, fighter_b);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="bg-gray-900 rounded-xl p-6 w-full max-w-sm space-y-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">Confirm Bet</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-gray-400">Fighter</dt><dd>{chosen}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-400">Amount</dt><dd>{amount_xlm} XLM</dd></div>
          <div className="flex justify-between"><dt className="text-gray-400">Platform fee ({fee_bps / 100}%)</dt><dd>{feeXlm.toFixed(4)} XLM</dd></div>
          <div className="flex justify-between font-semibold"><dt className="text-gray-400">Est. payout</dt><dd>{estimated_payout_xlm.toFixed(4)} XLM</dd></div>
        </dl>
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-gray-600 hover:bg-gray-800">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 font-semibold text-black">Confirm Bet</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
