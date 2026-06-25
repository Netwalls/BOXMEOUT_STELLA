"use client";
import { useState } from "react";
import { Bet, BetSide, Market } from "@/lib/api";
import { BetAmountInput } from "./BetAmountInput";
import { usePlaceBet } from "@/hooks/usePlaceBet";
import { useToast } from "@/hooks/useToast";

export interface BettingInterfaceProps {
  market: Market;
  onBetPlaced: (bet: Bet) => void;
}

export function BettingInterface({ market, onBetPlaced }: BettingInterfaceProps): JSX.Element {
  const [side, setSide] = useState<BetSide | null>(null);
  const [amount, setAmount] = useState("");
  const { placeBet, isLoading } = usePlaceBet(market.id);
  const { showToast } = useToast();

  const marketClosed = market.status !== "Open";
  // All controls disabled while market is closed OR a tx is in-flight
  const allDisabled = marketClosed || isLoading;

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

  return (
    <div className="bg-gray-800 rounded-xl p-4 w-full space-y-4">
      <h2 className="text-base font-semibold text-white">Place Bet</h2>

      {marketClosed && !isLoading && (
        <p className="text-sm text-yellow-400">Betting is {market.status.toLowerCase()}.</p>
      )}

      {/* In-flight feedback */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-amber-400">
          {/* Spinner */}
          <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Confirming transaction...
        </div>
      )}

      {/* Fighter select */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setSide("FighterA")}
          disabled={allDisabled}
          className={`h-11 rounded-lg text-sm font-medium transition-colors ${
            side === "FighterA" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {market.fighterA.name}
        </button>
        <button
          onClick={() => setSide("FighterB")}
          disabled={allDisabled}
          className={`h-11 rounded-lg text-sm font-medium transition-colors ${
            side === "FighterB" ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {market.fighterB.name}
        </button>
      </div>

      <BetAmountInput
        value={amount}
        onChange={(v) => { if (!allDisabled) setAmount(v); }}
        min={1}
        max={10000}
        estimatedPayout={null}
        disabled={allDisabled}
      />

      <button
        onClick={handleSubmit}
        disabled={allDisabled || !side || !amount}
        className="w-full h-11 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-colors"
      >
        {isLoading ? "Processing…" : "Confirm Bet"}
      </button>
    </div>
  );
}
