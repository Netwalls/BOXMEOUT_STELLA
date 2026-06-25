"use client";

import { useEffect } from "react";
import { useWallet } from "../hooks/useWallet";

const FREIGHTER_INSTALL_URL = "https://www.freighter.app/";

export interface WalletConnectButtonProps {
  onConnected: (address: string) => void;
}

export function WalletConnectButton({ onConnected }: WalletConnectButtonProps): JSX.Element {
  const { address, isConnected, walletNotInstalled, connect, disconnect } = useWallet();

  useEffect(() => {
    if (address) {
      onConnected(address);
    }
  }, [address, onConnected]);

  if (walletNotInstalled) {
    return (
      <a
        href={FREIGHTER_INSTALL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
      >
        Install Freighter
      </a>
    );
  }

  if (isConnected && address) {
    return (
      <button
        onClick={disconnect}
        className="inline-flex items-center px-4 py-2 rounded-md bg-gray-800 text-white text-sm font-medium hover:bg-gray-700"
      >
        {address.slice(0, 5)}…{address.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      className="inline-flex items-center px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
    >
      Connect Wallet
    </button>
  );
}
