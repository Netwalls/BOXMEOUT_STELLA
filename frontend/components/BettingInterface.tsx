"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { Bet, BetSide, Market } from "@/lib/api";
import { BetAmountInput } from "./BetAmountInput";
import { usePlaceBet } from "@/hooks/usePlaceBet";
import { useToast } from "@/components/ToastProvider";

export interface BettingInterfaceProps {
  market: Market;
  onBetPlaced: (bet: Bet) => void;
}

// Protocol fee applied on top of the staked amount, expressed in basis points.
const PROTOCOL_FEE_BPS = 200; // 2%
// Flat network fee estimate (in XLM) for a Soroban bet transaction.
const NETWORK_FEE_XLM = 0.01;
// Debounce window for refreshing the fee/payout estimate as the amount changes.
const ESTIMATE_DEBOUNCE_MS = 400;

function formatXlm(value: number): string {
  return value.toFixed(7).replace(/0+$/, "").replace(/\.$/, "");
}

export function BettingInterface({ market, onBetPlaced }: BettingInterfaceProps): JSX.Element {
  const headingId: string = useId();
  const sideGroupId: string = useId();
  const [side, setSide] = useState<BetSide | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [debouncedAmount, setDebouncedAmount] = useState<string>("");
  const { placeBet, isLoading } = usePlaceBet(market.id);
  const { addToast: showToast } = useToast();

  const marketClosed = market.status !== "Open";
  // All controls disabled while market is closed OR a tx is in-flight
  const allDisabled = marketClosed || isLoading;

  // Debounce the amount so the estimate only refreshes once typing settles.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedAmount(amount), ESTIMATE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [amount]);

  const estimate = useMemo(() => {
    const parsed = parseFloat(debouncedAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    const stake = parsed;
    const protocolFee = (stake * PROTOCOL_FEE_BPS) / 10000;
    const networkFee = NETWORK_FEE_XLM;
    const total = stake + protocolFee + networkFee;
    // Payout estimate: stake returned plus winnings, minus protocol fee.
    const payout = stake * 2 - protocolFee;
    return { stake, protocolFee, networkFee, total, payout };
  }, [debouncedAmount]);

  async function handleSubmit() {
    if (!side || !amount || allDisabled) return;
    const xlmUnits = BigInt(Math.round(parseFloat(amount) * 1e7));
    showToast("Transaction submitted. Waiting for ledger confirmation...", "info");
    try {
      const bet = await placeBet(side, xlmUnits);
      showToast("Bet confirmed successfully!", "success");
      onBetPlaced(bet);
      setSide(null);
      setAmount("");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Transaction failed.", "error");
    }
  }

  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800";

  return (
    <section aria-labelledby={headingId} className="bg-gray-800 rounded-xl p-4 w-full space-y-4">
      <h2 id={headingId} className="text-base font-semibold text-white">Place Bet</h2>

      {/* Status region is always mounted so its updates are announced, not just inserted */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {marketClosed && !isLoading && (
          <p className="text-sm text-yellow-400">Betting is {market.status.toLowerCase()}.</p>
        )}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <svg aria-hidden="true" focusable="false" className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Confirming transaction...
          </div>
        )}
      </div>

      {/* Fighter select: native buttons with aria-pressed rather than an ARIA
          radiogroup, which would also require roving tabindex and arrow keys */}
      <div role="group" aria-labelledby={sideGroupId} className="space-y-2">
        <span id={sideGroupId} className="block text-sm text-gray-400">
          Pick a fighter
        </span>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setSide("FighterA")}
            disabled={allDisabled}
            aria-pressed={side === "FighterA"}
            aria-label={`Bet on ${market.fighterA.name}`}
            className={`h-11 rounded-lg text-sm font-medium transition-colors ${
              side === "FighterA" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            } ${focusRing} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {market.fighterA.name}
          </button>
          <button
            type="button"
            onClick={() => setSide("FighterB")}
            disabled={allDisabled}
            aria-pressed={side === "FighterB"}
            aria-label={`Bet on ${market.fighterB.name}`}
            className={`h-11 rounded-lg text-sm font-medium transition-colors ${
              side === "FighterB" ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            } ${focusRing} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {market.fighterB.name}
          </button>
        </div>
      </div>

      <BetAmountInput
        value={amount}
        onChange={(v) => { if (!allDisabled) setAmount(v); }}
        min={1}
        max={10000}
        estimatedPayout={estimate ? estimate.payout : null}
        disabled={allDisabled}
      />

      {/* Fee and resource estimate shown before signing */}
      <div
        aria-live="polite"
        className="rounded-lg bg-gray-900/60 p-3 text-sm text-gray-300 space-y-1"
      >
        <div className="flex justify-between">
          <span>Network fee</span>
          <span className="text-white">
            {estimate ? `${formatXlm(estimate.networkFee)} XLM` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Protocol fee ({(PROTOCOL_FEE_BPS / 100).toFixed(2)}%)</span>
          <span className="text-white">
            {estimate ? `${formatXlm(estimate.protocolFee)} XLM` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Estimated payout</span>
          <span className="text-white">
            {estimate ? `${formatXlm(estimate.payout)} XLM` : "—"}
          </span>
        </div>
        <div className="flex justify-between border-t border-gray-700 pt-1 font-medium">
          <span>Total cost</span>
          <span className="text-amber-400">
            {estimate ? `${formatXlm(estimate.total)} XLM` : "—"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={allDisabled || !side || !amount}
        className={`w-full h-11 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-colors ${focusRing}`}
      >
        {isLoading ? "Processing…" : "Confirm Bet"}
      </button>
    </section>
  );
}
