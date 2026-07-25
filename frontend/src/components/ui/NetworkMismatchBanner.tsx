'use client';

import { useNetworkMismatch } from '../../hooks/useNetworkMismatch';

/**
 * Displays a persistent banner when the wallet's network doesn't match the app's configured network.
 * Should be placed at app-level so all mutation hooks can check for mismatches.
 */
export function NetworkMismatchBanner(): JSX.Element | null {
  const { isMismatched, connectedNetwork, expectedNetwork } = useNetworkMismatch();

  if (!isMismatched) return null;

  return (
    <div className="bg-yellow-900/30 border-b border-yellow-700/50 text-yellow-200 py-3 px-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="text-lg">⚠️</span>
        <div className="text-sm">
          <p className="font-semibold">Network Mismatch</p>
          <p className="text-yellow-300/80">
            Your wallet is connected to <span className="font-mono">{connectedNetwork}</span>, but this app is configured for{' '}
            <span className="font-mono">{expectedNetwork}</span>. Betting actions are blocked.
          </p>
        </div>
      </div>
    </div>
  );
}
