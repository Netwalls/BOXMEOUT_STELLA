"use client";

export interface BetAmountInputProps {
  value: string;
  onChange: (val: string) => void;
  min: number;
  max: number;
  estimatedPayout: bigint | null;
  disabled?: boolean;
}

export function BetAmountInput({ value, onChange, min, max, estimatedPayout, disabled }: BetAmountInputProps): JSX.Element {
  const num = parseFloat(value);
  const error = value && (isNaN(num) || num < min || num > max)
    ? `Enter an amount between ${min} and ${max} XLM`
    : null;

  return (
    <div className="space-y-1">
      <label className="block text-sm text-gray-400">Amount (XLM)</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        disabled={disabled}
        className="w-full bg-gray-700 text-white rounded-lg px-3 h-11 border border-gray-600 focus:border-amber-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        placeholder={`${min}–${max} XLM`}
      />
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {estimatedPayout !== null && !error && (
        <p className="text-xs text-gray-400">
          Est. payout: <span className="text-white">{(Number(estimatedPayout) / 1e7).toFixed(2)} XLM</span>
        </p>
      )}
    </div>
  );
}
