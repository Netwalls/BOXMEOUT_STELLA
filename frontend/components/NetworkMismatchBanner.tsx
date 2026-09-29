"use client";

import { useWallet } from "@/hooks/useWallet";
import { NETWORK } from "@/lib/stellar";

export function NetworkMismatchBanner(): JSX.Element | null {
  const { isNetworkMismatched } = useWallet();

  if (!isNetworkMismatched) return null;

  return (
    <div
      role="alert"
      className="w-full bg-red-600 text-white text-sm font-medium px-4 py-2 text-center"
    >
      Your wallet is connected to the wrong network. Switch to {NETWORK} to continue betting.
    </div>
  );
}
