"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { Bet, BetSide, Market } from "@/lib/api";
import { BetAmountInput } from "./BetAmountInput";
import { TransactionStatusModal, TransactionStatus } from "./TransactionStatusModal";
import { usePlaceBet } from "@/hooks/usePlaceBet";

const MIN_AMOUNT_XLM = 1;
const MAX_AMOUNT_XLM = 10000;

/** Protocol fee applied to each bet, expressed as a fraction of the stake. */
const PROTOCOL_FEE_RATE = 0.02;
/** Base network fee for a Soroban bet transaction, in XLM. */
const BASE_NETWORK_FEE_XLM = 0.00001;
/** Additional resource fee per unit of stake, in XLM. */
const RESOURCE_FEE_PER_XLM = 0.000002;
/** Debounce delay before refreshing the fee estimate, in milliseconds. */
const ESTIMATE_DEBOUNCE_MS = 400;

export interface BetFormProps {
  market: Market;
  onBetPlaced?: (bet: Bet) => void;
}

interface FeeEstimate {
  networkFeeXlm: number;
  protocolFeeXlm: number;
  payoutXlm: number;
}

/**
 * Simulates the bet transaction and derives the network fee, protocol fee and
 * resulting payout for a given stake. In production this would call the
 * Soroban `simulateTransaction` RPC; the shape mirrors that response.
 */
function simulateBet(amountXlm: number): FeeEstimate {
  const networkFeeXlm = BASE_NETWORK_FEE_XLM + amountXlm * RESOURCE_FEE_PER_XLM;
  const protocolFeeXlm = amountXlm * PROTOCOL_FEE_RATE;
  const payoutXlm = amountXlm - protocolFeeXlm;
  return { networkFeeXlm, protocolFeeXlm, payoutXlm };
}

/** Amount input + side toggle wired to usePlaceBet, with modal transaction feedback. */
export function BetForm({ market, onBetPlaced }: BetFormProps): JSX.Element {
  const headingId = useId();
  const sideGroupId = useId();
  const [side, setSide] = useState<BetSide | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [txStatus, setTxStatus] = useState<TransactionStatus | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<FeeEstimate | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  const { placeBet, isLoading } = usePlaceBet(market.id);

  const isLocked = market.status !== "Open";
  const numericAmount = parseFloat(amount);
  const isAmountValid =
    amount.trim() !== "" &&
    !isNaN(numericAmount) &&
    numericAmount > 0 &&
    numericAmount >= MIN_AMOUNT_XLM &&
    numericAmount <= MAX_AMOUNT_XLM;

  const allDisabled = isLocked || isLoading;
  const canSubmit = !allDisabled && !!side && isAmountValid;

  // Refresh the fee/resource estimate when the amount changes, debounced.
  useEffect(() => {
    if (!isAmountValid) {
      setEstimate(null);
      setIsEstimating(false);
      return;
    }

    setIsEstimating(true);
    const timer = setTimeout(() => {
      setEstimate(simulateBet(numericAmount));
      setIsEstimating(false);
    }, ESTIMATE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [numericAmount, isAmountValid]);

  const formatted = useMemo(
    () => ({
      networkFee: estimate ? estimate.networkFeeXlm.toFixed(7) : null,
      protocolFee: estimate ? estimate.protocolFeeXlm.toFixed(7) : null,
      payout: estimate ? estimate.payoutXlm.toFixed(7) : null,
    }),
    [estimate]
  );

  async function handleSubmit() {
    if (!canSubmit || !side) return;

    const stroops = BigInt(Math.round(numericAmount * 1e7));
    setTxStatus("pending");
    setTxError(null);
    setTxHash(null);

    try {
      const bet = await placeBet(side, stroops);
      setTxStatus("success");
      setTxHash(bet.id);
      onBetPlaced?.(bet);
      setSide(null);
      setAmount("");
    } catch (e) {
      setTxStatus("error");
      setTxError(e instanceof Error ? e.message : "Transaction failed.");
    }
  }

  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800";

  return (
    <section aria-labelledby={headingId} className="bg-gray-800 rounded-xl p-4 w-full space-y-4">
      <h2 id={headingId} className="text-base font-semibold text-white">
        Place Bet
      </h2>

      {isLocked && (
        <p role="status" className="text-sm text-yellow-400">
          Betting is {market.status.toLowerCase()}.
        </p>
      )}

      <div role="group" aria-labelledby={sideGroupId} className="space-y-2">
        <span id={sideGroupId} className="block text-sm text-gray-400">
          Pick a side
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
        onChange={(v) => {
          if (!allDisabled) setAmount(v);
        }}
        min={MIN_AMOUNT_XLM}
        max={MAX_AMOUNT_XLM}
        estimatedPayout={estimate ? estimate.payoutXlm : null}
        disabled={allDisabled}
      />

      {isAmountValid && (
        <dl
          aria-live="polite"
          className="rounded-lg bg-gray-900/60 p-3 text-sm space-y-1"
        >
          <div className="flex items-center justify-between">
            <dt className="text-gray-400">Network fee</dt>
            <dd className="text-gray-200 tabular-nums">
              {isEstimating || !formatted.networkFee
                ? "Estimating…"
                : `${formatted.networkFee} XLM`}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-400">Protocol fee</dt>
            <dd className="text-gray-200 tabular-nums">
              {isEstimating || !formatted.protocolFee
                ? "Estimating…"
                : `${formatted.protocolFee} XLM`}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-400">Estimated payout</dt>
            <dd className="text-amber-400 font-medium tabular-nums">
              {isEstimating || !formatted.payout
                ? "Estimating…"
                : `${formatted.payout} XLM`}
            </dd>
          </div>
        </dl>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full h-11 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-colors ${focusRing}`}
      >
        {isLoading ? "Processing…" : "Confirm Bet"}
      </button>

      {txStatus && (
        <TransactionStatusModal
          isOpen
          status={txStatus}
          txHash={txHash}
          errorMessage={txError}
          onClose={() => setTxStatus(null)}
        />
      )}
    </section>
  );
}
