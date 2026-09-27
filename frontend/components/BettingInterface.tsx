"use client";
import { useId, useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Bet, BetSide, Market } from "@/lib/api";
import { BetAmountInput } from "./BetAmountInput";
import { usePlaceBet } from "@/hooks/usePlaceBet";
import { useToast } from "@/components/ToastProvider";

export interface BettingInterfaceProps {
  market: Market;
  onBetPlaced: (bet: Bet) => void;
}

// ─── Shared form content ──────────────────────────────────────────────────────

interface BetFormBodyProps {
  market: Market;
  side: BetSide | null;
  setSide: (s: BetSide) => void;
  amount: string;
  setAmount: (v: string) => void;
  allDisabled: boolean;
  isLoading: boolean;
  marketClosed: boolean;
  onSubmit: () => void;
  headingId: string;
  sideGroupId: string;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800";

function BetFormBody({
  market,
  side,
  setSide,
  amount,
  setAmount,
  allDisabled,
  isLoading,
  marketClosed,
  onSubmit,
  headingId,
  sideGroupId,
}: BetFormBodyProps) {
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="text-base font-semibold text-white">
        Place Bet
      </h2>

      {/* Live status region */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {marketClosed && !isLoading && (
          <p className="text-sm text-yellow-400">
            Betting is {market.status.toLowerCase()}.
          </p>
        )}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <svg
              aria-hidden="true"
              focusable="false"
              className="animate-spin h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Confirming transaction...
          </div>
        )}
      </div>

      {/* Fighter selection */}
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
              side === "FighterA"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
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
              side === "FighterB"
                ? "bg-red-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
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
        min={1}
        max={10000}
        estimatedPayout={null}
        disabled={allDisabled}
      />

      <button
        type="button"
        onClick={onSubmit}
        disabled={allDisabled || !side || !amount}
        className={`w-full h-11 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-colors ${focusRing}`}
      >
        {isLoading ? "Processing…" : "Confirm Bet"}
      </button>
    </section>
  );
}

// ─── Focus trap hook ──────────────────────────────────────────────────────────

/** Traps focus inside the given container element while active. */
function useFocusTrap(containerRef: React.RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;

    // Focus the container itself (or first focusable child) when it opens
    const firstFocusable = container.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [active, containerRef]);
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BettingInterface({ market, onBetPlaced }: BettingInterfaceProps): JSX.Element {
  const headingId = useId();
  const sheetHeadingId = useId();
  const sideGroupId = useId();
  const sheetSideGroupId = useId();

  const [side, setSide] = useState<BetSide | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const { placeBet, isLoading } = usePlaceBet(market.id);
  const { addToast: showToast } = useToast();

  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef, sheetOpen);

  const marketClosed = market.status !== "Open";
  const allDisabled = marketClosed || isLoading;

  const handleSubmit = useCallback(async () => {
    if (!side || !amount || allDisabled) return;
    const xlmUnits = BigInt(Math.round(parseFloat(amount) * 1e7));
    showToast("Transaction submitted. Waiting for ledger confirmation...", "info");
    try {
      const bet = await placeBet(side, xlmUnits);
      showToast("Bet confirmed successfully!", "success");
      onBetPlaced(bet);
      setSide(null);
      setAmount("");
      setSheetOpen(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Transaction failed.", "error");
    }
  }, [side, amount, allDisabled, placeBet, onBetPlaced, showToast]);

  // Escape key closes the sheet
  useEffect(() => {
    if (!sheetOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSheetOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  // Lock body scroll while sheet is open
  useEffect(() => {
    if (sheetOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sheetOpen]);

  const formProps = {
    market,
    side,
    setSide,
    amount,
    setAmount,
    allDisabled,
    isLoading,
    marketClosed,
    onSubmit: handleSubmit,
  };

  return (
    <>
      {/* ── Desktop / above 640px: inline card ────────────────────────── */}
      <div className="hidden sm:block bg-gray-800 rounded-xl p-4 w-full">
        <BetFormBody
          {...formProps}
          headingId={headingId}
          sideGroupId={sideGroupId}
        />
      </div>

      {/* ── Mobile: sticky "Place Bet" trigger bar ─────────────────────── */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 px-4 pb-4 pt-3 bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          disabled={marketClosed}
          className={`w-full h-12 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-xl text-base transition-colors ${focusRing}`}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
        >
          {marketClosed ? `Betting ${market.status.toLowerCase()}` : "Place Bet"}
        </button>
      </div>

      {/* ── Mobile: bottom sheet ────────────────────────────────────────── */}
      <AnimatePresence>
        {sheetOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="sheet-backdrop"
              className="sm:hidden fixed inset-0 z-50 bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSheetOpen(false)}
              aria-hidden="true"
            />

            {/* Sheet panel */}
            <motion.div
              key="sheet-panel"
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={sheetHeadingId}
              className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-gray-900 rounded-t-2xl border-t border-gray-700 px-4 pt-4 pb-8 max-h-[90dvh] overflow-y-auto"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              {/* Drag handle (visual hint) */}
              <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-gray-600" aria-hidden="true" />

              {/* Close button */}
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close bet form"
                className={`absolute top-4 right-4 text-gray-400 hover:text-white transition-colors ${focusRing}`}
              >
                <X className="h-5 w-5" />
              </button>

              <BetFormBody
                {...formProps}
                headingId={sheetHeadingId}
                sideGroupId={sheetSideGroupId}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
