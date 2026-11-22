'use client';
import { useState, useRef } from 'react';

const GLOSSARY = {
  'pool': 'The combined amount bet on all outcomes. Odds are determined by the ratio of bets on each side.',
  'odds': 'Your potential return ratio based on the current pool split and your bet amount.',
  'payout': 'Your total return if your side wins, including your original stake plus winnings.',
  'protocol-fee': 'A small fee taken from winnings to support the protocol.',
  'dispute-window': 'The period after resolution when bettors can challenge the outcome if they disagree.',
  'no-contest': 'A market outcome where no clear winner was determined and all bets are refunded.',
};

export const Term = ({ id }: { id: keyof typeof GLOSSARY }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <span className="inline-relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        aria-describedby={open ? `term-${id}` : undefined}
        className="underline cursor-help"
      >
        {id.replace('-', ' ')}
      </button>
      {open && (
        <div
          id={`term-${id}`}
          className="absolute bg-gray-900 text-white p-2 rounded text-sm max-w-xs"
          role="tooltip"
        >
          {GLOSSARY[id]}
        </div>
      )}
    </span>
  );
};
