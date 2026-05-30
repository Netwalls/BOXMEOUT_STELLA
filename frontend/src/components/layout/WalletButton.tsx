// ============================================================
// BOXMEOUT — WalletButton Component
// ============================================================

'use client';

import { useState, useRef, useEffect } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { stellarExplorerUrl } from '../../services/wallet';

export function WalletButton(): JSX.Element {
  const { address, balance, isConnected, isConnecting, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!isConnected) {
    return (
      <button
        onClick={connect}
        disabled={isConnecting}
        className="min-h-[44px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 font-semibold text-black text-sm disabled:opacity-50"
      >
        {isConnecting ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Connecting…
          </span>
        ) : (
          'Connect Wallet'
        )}
      </button>
    );
  }

  const short = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="min-h-[44px] px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-white flex items-center gap-2"
      >
        <span className="font-mono">{short}</span>
        {balance != null && <span className="text-gray-400 text-xs">{balance.toFixed(2)} XLM</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
          <button
            onClick={handleCopy}
            className="w-full min-h-[44px] px-4 text-left text-sm text-gray-300 hover:bg-gray-800"
          >
            {copied ? 'Copied!' : 'Copy Address'}
          </button>
          <a
            href={stellarExplorerUrl('account', address ?? '')}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center min-h-[44px] px-4 text-sm text-gray-300 hover:bg-gray-800"
          >
            View on Explorer
          </a>
          <button
            onClick={() => { disconnect(); setOpen(false); }}
            className="w-full min-h-[44px] px-4 text-left text-sm text-red-400 hover:bg-gray-800"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
