"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { WalletConnectButton } from "./WalletConnectButton";
import { useTheme } from "@/hooks/useTheme";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/create", label: "Create" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [, setWalletAddress] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  const handleWalletConnected = useCallback((address: string) => {
    setWalletAddress(address);
  }, []);

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold text-amber-400">
          BOXMEOUT
        </Link>

        {/* Desktop nav links */}
        <ul className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-gray-300 hover:text-white transition-colors"
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="w-9 h-9 flex items-center justify-center rounded-md text-gray-300 hover:text-white hover:bg-gray-800"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </li>
        </ul>

        {/* Desktop: WalletConnectButton slot */}
        <div className="hidden md:flex items-center">
          <WalletConnectButton onConnected={handleWalletConnected} />
        </div>

        {/* Hamburger button — mobile only */}
        <button
          className="md:hidden flex items-center justify-center w-11 h-11 text-gray-300 hover:text-white"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          {open ? (
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div
          id="mobile-menu"
          className="md:hidden border-t border-gray-800 bg-gray-900 px-4 pb-4"
        >
          <ul>
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="flex items-center min-h-[44px] text-gray-300 hover:text-white transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          {/* WalletConnectButton slot — mobile */}
          <div className="mt-3">
            <WalletConnectButton onConnected={handleWalletConnected} />
          </div>
        </div>
      )}
    </nav>
  );
}
