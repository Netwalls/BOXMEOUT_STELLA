'use client';

import { useEffect, useMemo } from 'react';
import type { Bet, Market } from '../../types';
import { useWallet } from '../../hooks/useWallet';
import { useClaimWinnings } from '../../hooks/useClaimWinnings';
import { TransactionStatus } from '../ui/TransactionStatus';
import { stellarExplorerUrl } from '../../services/wallet';

function formatXlm(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} XLM`;
}

type ClaimWinningsPanelProps = {
  market: Market;
  /** All bets for this market; used to find the current wallet's bet and whether it is claimable. */
  allBets: Bet[];
};

function getMyBets(allBets: Bet[], walletAddress: string | null | undefined): Bet[] {
  if (!walletAddress) return [];
  // Backend Bet.tx_hash is a transaction hash; we can't reliably map to wallet address.
  // So we fall back to `address` only if it exists.
  return allBets.filter((b) => (b as any).address === walletAddress);
}

export function ClaimWinningsPanel({ market, allBets }: ClaimWinningsPanelProps): JSX.Element {
  const { address } = useWallet();
  const { claimWinnings, txStatus, reset } = useClaimWinnings();

  const myBets = useMemo(() => getMyBets(allBets, address), [allBets, address]);
  // Prefer the latest bet from this wallet.
  const myBet =
    myBets
      .slice()
      .sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime())[0] ?? null;

  const marketResolved = market.status === 'resolved';
  const alreadyClaimed = myBet?.claimed === true;
  const myPayout = myBet?.payout != null ? Number(myBet.payout) : null;
  const bettorLost = myBet != null && (myBet.payout == null || myPayout === null || myPayout <= 0);
  const canClaim =
    Boolean(address) &&
    marketResolved &&
    myBet != null &&
    !alreadyClaimed &&
    !bettorLost &&
    txStatus.status === 'idle';

  const projectedPayout = useMemo(() => {
    if (!myBet || myBet.claimed) return null;
    if (myBet.payout == null) return null;
    const payoutNum = Number(myBet.payout);
    return payoutNum > 0 ? payoutNum : null;
  }, [myBet]);

  const success = txStatus.status === 'success';
  const isPending = ['signing', 'broadcasting', 'confirming'].includes(txStatus.status);

  // Reset error/success if market changes away from resolved.
  useEffect(() => {
    if (!marketResolved) reset();
  }, [marketResolved, reset]);

  return (
    <section className="bg-gray-900 rounded-xl p-6 space-y-4 text-white border border-gray-800">
      <div>
        <h2 className="text-lg font-bold">Claim winnings</h2>
        <p className="text-sm text-gray-400 mt-1">
          Collect your projected payout after the market resolves.
        </p>
      </div>

      {/* Disabled states + projected payout */}
      <div className="bg-gray-800 rounded-lg px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-gray-400">Projected payout</p>
            <p className="text-base font-semibold mt-1">{formatXlm(projectedPayout ?? null)}</p>
          </div>
          <div className="text-right">
            {alreadyClaimed && (
              <p className="text-xs text-green-400 font-semibold">Already claimed</p>
            )}
            {!alreadyClaimed && !marketResolved && (
              <p className="text-xs text-amber-400 font-semibold">Market not resolved</p>
            )}
            {!alreadyClaimed && marketResolved && bettorLost && (
              <p className="text-xs text-gray-400 font-semibold">Bettor lost</p>
            )}
            {!alreadyClaimed && marketResolved && myBet == null && (
              <p className="text-xs text-gray-400 font-semibold">No bet found</p>
            )}
          </div>
        </div>

        <div className="text-xs text-gray-500">
          {marketResolved
            ? alreadyClaimed
              ? 'You have already claimed your winnings for this market.'
              : bettorLost
                ? 'Your bet does not have claimable winnings.'
                : 'Ready to claim your projected payout.'
            : 'Claiming is disabled until the market is resolved.'}
        </div>
      </div>

      {/* Button + tx status */}
      <div className="space-y-2">
        {!success ? (
          <button
            disabled={!canClaim}
            onClick={() => claimWinnings(market.market_id)}
            className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 font-semibold text-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Claiming…' : 'Claim winnings'}
          </button>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-green-400 font-semibold">Claimed!</p>
            {txStatus.hash && (
              <a
                href={stellarExplorerUrl('tx', txStatus.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 underline text-xs font-semibold break-all"
              >
                View TX ↗
              </a>
            )}
          </div>
        )}

        {/* TransactionStatus during/after claim (single place) */}
        {txStatus.status !== 'idle' && <TransactionStatus txStatus={txStatus} onDismiss={reset} />}
      </div>
    </section>
  );
}
