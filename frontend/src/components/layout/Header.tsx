'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { WalletButton } from './WalletButton';

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
const IS_MAINNET = NETWORK === 'mainnet';
const BANNER_KEY = 'boxmeout_mainnet_banner_dismissed';

export function Header(): JSX.Element {
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (IS_MAINNET) {
      setBannerDismissed(sessionStorage.getItem(BANNER_KEY) === '1');
    }
  }, []);

  const dismissBanner = () => {
    sessionStorage.setItem(BANNER_KEY, '1');
    setBannerDismissed(true);
  };

  return (
    <>
      {IS_MAINNET && !bannerDismissed && (
        <div className="bg-red-600 text-white text-sm text-center py-2 px-4 flex items-center justify-center gap-3">
          <span>⚠️ You are betting with real XLM on mainnet</span>
          <button onClick={dismissBanner} className="ml-auto text-white/80 hover:text-white font-bold">✕</button>
        </div>
      )}
      <header className="sticky top-0 z-40 bg-gray-950 border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
          <Link href="/" className="font-black text-amber-500 text-xl tracking-tight">BOXMEOUT</Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex gap-4 text-sm text-gray-300">
            <Link href="/" className="hover:text-white">Home</Link>
            <Link href="/portfolio" className="hover:text-white">Portfolio</Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/* Network badge */}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${IS_MAINNET ? 'bg-green-600 text-white' : 'bg-amber-500/20 text-amber-400'}`}>
              {IS_MAINNET ? 'MAINNET' : 'TESTNET'}
            </span>

            <WalletButton />

            {/* Mobile hamburger */}
            <button
              className="md:hidden text-gray-400 hover:text-white"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {menuOpen && (
          <nav className="md:hidden bg-gray-950 border-t border-gray-800 px-4 py-3 flex flex-col gap-3 text-sm text-gray-300">
            <Link href="/" onClick={() => setMenuOpen(false)} className="hover:text-white">Home</Link>
            <Link href="/portfolio" onClick={() => setMenuOpen(false)} className="hover:text-white">Portfolio</Link>
          </nav>
        )}
      </header>
    </>
  );
}
