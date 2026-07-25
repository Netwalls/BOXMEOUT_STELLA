// ============================================================
// BOXMEOUT — useNetworkMismatch Hook (F-31)
// ============================================================

import { useEffect, useState } from 'react';
import { getConnectedNetwork } from '../services/wallet';

/**
 * Detects when the connected wallet's network differs from the app's configured network.
 * Wallet mutations should refuse to submit while mismatched.
 */
export function useNetworkMismatch(): {
  isMismatched: boolean;
  connectedNetwork: string | null;
  expectedNetwork: string;
} {
  const [isMismatched, setIsMismatched] = useState(false);
  const [connectedNetwork, setConnectedNetwork] = useState<string | null>(null);

  const expectedNetwork = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';

  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const network = await getConnectedNetwork();
        setConnectedNetwork(network);
        setIsMismatched(network !== expectedNetwork);
      } catch (e) {
        setIsMismatched(false);
      }
    };

    checkNetwork();
    const interval = setInterval(checkNetwork, 5000);
    return () => clearInterval(interval);
  }, [expectedNetwork]);

  return { isMismatched, connectedNetwork, expectedNetwork };
}
