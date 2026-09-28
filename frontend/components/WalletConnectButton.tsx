"use client";

import { useEffect, useState } from "react";
import { useWallet } from "../hooks/useWallet";
import { NETWORK } from "../lib/stellar";

const FREIGHTER_INSTALL_URL = "https://www.freighter.app/";

export interface WalletConnectButtonProps {
  onConnected: (address: string) => void;
}

export function WalletConnectButton({ onConnected }: WalletConnectButtonProps): JSX.Element {
  const {
    address,
    isConnected,
    walletNotInstalled,
    isWrongNetwork,
    networkName,
    connect,
    disconnect,
  } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (address) {
      onConnected(address);
    }
  }, [address, onConnected]);

  async function handleConnect() {
    setIsConnecting(true);
    try {
      await connect();
    } finally {
      setIsConnecting(false);
    }
  }

  // ── State: Freighter not installed ──────────────────────────────────────────
  if (walletNotInstalled) {
    return (
      <a
        href={FREIGHTER_INSTALL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Install Freighter
      </a>
    );
  }

  // ── State: Connected but wrong network ──────────────────────────────────────
  if (isConnected && isWrongNetwork) {
    return (
      <div className="flex flex-col items-end gap-1">
        {/* Warning banner */}
        <div
          role="alert"
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-900/80 border border-red-600 text-red-300 text-xs font-medium"
        >
          <svg className="w-3.5 h-3.5 shrink-0 text-red-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          Wrong network{networkName ? ` (${networkName})` : ""}. Switch to {NETWORK}.
        </div>
        {/* Still show truncated address + disconnect option */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 border border-red-600"
          >
            <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
            {address ? `${address.slice(0, 5)}...${address.slice(-4)}` : "Connected"}
          </button>
          {showDropdown && (
            <div className="absolute right-0 mt-1 w-40 bg-gray-900 border border-gray-700 rounded-md shadow-lg z-10">
              <button
                onClick={() => { disconnect(); setShowDropdown(false); }}
                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── State: Connected, correct network ───────────────────────────────────────
  if (isConnected && address) {
    const truncated = `${address.slice(0, 5)}...${address.slice(-4)}`;
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gray-800 text-white text-sm font-medium hover:bg-gray-700"
        >
          <span className="w-2 h-2 rounded-full bg-green-400" aria-hidden="true" />
          {truncated}
        </button>
        {showDropdown && (
          <div className="absolute right-0 mt-1 w-36 bg-gray-900 border border-gray-700 rounded-md shadow-lg z-10">
            <button
              onClick={() => { disconnect(); setShowDropdown(false); }}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── State: Connecting (loading) ─────────────────────────────────────────────
  if (isConnecting) {
    return (
      <button
        disabled
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium opacity-75 cursor-not-allowed"
      >
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        Connecting...
      </button>
    );
  }

  // ── State: Not connected ─────────────────────────────────────────────────────
  return (
    <button
      onClick={handleConnect}
      className="inline-flex items-center px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
    >
      Connect Wallet
    </button>
  );
}
