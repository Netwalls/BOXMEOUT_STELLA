"use client";
import { useEffect, useId, useState } from "react";

export interface BetAmountInputProps {
  value: string;
  onChange: (val: string) => void;
  min: number;
  max: number;
  estimatedPayout: bigint | null;
  disabled?: boolean;
  /** Connected account's public key; when set, the XLM balance is fetched from Horizon. */
  account?: string | null;
  /** Horizon base URL. Defaults to the public testnet endpoint. */
  horizonUrl?: string;
}

// Base fee (100 stroops) plus a small reserve kept for the account's minimum balance.
const FEE_RESERVE_XLM = 1;
const DEFAULT_HORIZON_URL = "https://horizon-testnet.stellar.org";

function formatXlm(amount: number): string {
  return amount.toFixed(7).replace(/\.?0+$/, "");
}

export function BetAmountInput({ value, onChange, min, max, estimatedPayout, disabled, account, horizonUrl }: BetAmountInputProps): JSX.Element {
  const inputId: string = useId();
  const errorId: string = `${inputId}-error`;
  const payoutId: string = `${inputId}-payout`;
  const balanceId: string = `${inputId}-balance`;

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) {
      setBalance(null);
      setBalanceError(null);
      return;
    }
    let cancelled = false;
    const base = horizonUrl || DEFAULT_HORIZON_URL;
    fetch(`${base}/accounts/${account}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Horizon responded ${res.status}`);
        return res.json();
      })
      .then((data: { balances?: Array<{ asset_type: string; balance: string }> }) => {
        if (cancelled) return;
        const native = data.balances?.find((b) => b.asset_type === "native");
        setBalance(native ? parseFloat(native.balance) : 0);
        setBalanceError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setBalance(null);
        setBalanceError("Could not fetch XLM balance");
      });
    return () => {
      cancelled = true;
    };
  }, [account, horizonUrl]);

  const spendable = balance !== null ? Math.max(balance - FEE_RESERVE_XLM, 0) : null;

  const num = parseFloat(value);
  const rangeError = value && (isNaN(num) || num < min || num > max)
    ? `Enter an amount between ${min} and ${max} XLM`
    : null;
  const balanceErrorMsg = !rangeError && value && spendable !== null && num > spendable
    ? `Amount plus fee reserve exceeds your balance of ${formatXlm(balance as number)} XLM`
    : null;
  const error = rangeError || balanceErrorMsg;

  const showPayout = estimatedPayout !== null && !error;
  // Only reference IDs that are actually rendered, or axe flags a dangling target
  const describedBy = [error ? errorId : null, showPayout ? payoutId : null, spendable !== null ? balanceId : null]
    .filter(Boolean)
    .join(" ");

  const handleMax = () => {
    if (spendable === null) return;
    onChange(formatXlm(spendable));
  };

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm text-gray-400">
        Amount (XLM)
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          step="any"
          inputMode="decimal"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="w-full bg-gray-700 text-white rounded-lg px-3 h-11 border border-gray-600 focus:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder={`${min}–${max} XLM`}
        />
        <button
          type="button"
          onClick={handleMax}
          disabled={disabled || spendable === null}
          className="shrink-0 h-11 px-3 rounded-lg bg-gray-600 text-white text-sm hover:bg-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Max
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-red-400 text-xs">
          {error}
        </p>
      )}
      {!error && balanceError && (
        <p role="alert" className="text-red-400 text-xs">
          {balanceError}
        </p>
      )}
      {spendable !== null && (
        <p id={balanceId} className="text-xs text-gray-400">
          Spendable: <span className="text-white">{formatXlm(spendable)} XLM</span>
        </p>
      )}
      {showPayout && (
        <p id={payoutId} className="text-xs text-gray-400">
          Est. payout: <span className="text-white">{(Number(estimatedPayout) / 1e7).toFixed(2)} XLM</span>
        </p>
      )}
    </div>
  );
}
