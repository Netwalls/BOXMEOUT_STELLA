'use client';

import { useEffect } from 'react';
import type { TxStatus } from '../../types';
import { stellarExplorerUrl } from '../../services/wallet';

interface TxStatusToastProps {
  txStatus: TxStatus;
  onDismiss: () => void;
}

export function TxStatusToast({ txStatus, onDismiss }: TxStatusToastProps): JSX.Element {
  useEffect(() => {
    if (txStatus.status !== 'success') return;
    const id = setTimeout(onDismiss, 6000);
    return () => clearTimeout(id);
  }, [txStatus.status, onDismiss]);

  if (txStatus.status === 'idle') return <></>;

  const isPending = ['signing', 'broadcasting', 'confirming'].includes(txStatus.status);
  const pendingLabel = txStatus.status === 'signing'
    ? 'Waiting for signature…'
    : txStatus.status === 'broadcasting'
    ? 'Broadcasting…'
    : 'Confirming on Stellar…';

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full bg-gray-900 text-white rounded-xl shadow-xl p-4 flex items-start gap-3">
      {isPending && (
        <>
          <span className="animate-spin text-xl">⏳</span>
          <p className="text-sm">{pendingLabel}</p>
        </>
      )}
      {txStatus.status === 'success' && (
        <>
          <span className="text-green-400 text-xl">✓</span>
          <div className="flex-1 text-sm">
            <p className="font-semibold">Bet placed!</p>
            {txStatus.hash && (
              <a
                href={stellarExplorerUrl('tx', txStatus.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 underline break-all"
              >
                {txStatus.hash.slice(0, 12)}…
              </a>
            )}
          </div>
          <button onClick={onDismiss} className="text-gray-400 hover:text-white">✕</button>
        </>
      )}
      {txStatus.status === 'error' && (
        <>
          <span className="text-red-400 text-xl">✕</span>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-red-400">Transaction failed</p>
            <p className="text-gray-300">{txStatus.error}</p>
            <p className="text-gray-500 text-xs mt-1">Please try again.</p>
          </div>
          <button onClick={onDismiss} className="text-gray-400 hover:text-white">✕</button>
        </>
      )}
    </div>
  );
}
