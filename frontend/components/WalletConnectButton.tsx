"use client";
import { useState } from "react";

export interface WalletConnectButtonProps {
  onConnected: (address: string) => void;
}

function truncate(addr: string) {
  return `${addr.slice(0, 5)}…${addr.slice(-3)}`;
}

export function WalletConnectButton({ onConnected }: WalletConnectButtonProps): JSX.Element {
  const [address, setAddress] = useState<string | null>(null);

  async function connect() {
    // Freighter API integration point
    const addr = "GABCDEFGHIJKLMNOPQRSTUVWXYZ"; // placeholder
    setAddress(addr);
    onConnected(addr);
  }

  function disconnect() {
    setAddress(null);
  }

  return address ? (
    <button
      onClick={disconnect}
      className="h-11 px-4 bg-gray-700 hover:bg-gray-600 text-sm text-white rounded-lg transition-colors"
    >
      {truncate(address)}
    </button>
  ) : (
    <button
      onClick={connect}
      className="h-11 px-4 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg transition-colors"
    >
      Connect Wallet
    </button>
  );
}
