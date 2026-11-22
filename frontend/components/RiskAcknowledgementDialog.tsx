'use client';
import { useEffect, useRef } from 'react';

export const RiskAcknowledgementDialog = ({ address, version, onAccept, onDecline }: any) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const key = `risk-ack-${address}-${version}`;
    try {
      const acked = localStorage.getItem(key);
      if (!acked) {
        dialogRef.current?.showModal();
      }
    } catch (e) {}
  }, [address, version]);

  const handleAccept = () => {
    const key = `risk-ack-${address}-${version}`;
    try {
      localStorage.setItem(key, 'true');
    } catch (e) {}
    dialogRef.current?.close();
    onAccept?.();
  };

  const handleDecline = () => {
    dialogRef.current?.close();
    onDecline?.();
  };

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/50 p-6 rounded-lg max-w-sm"
      onKeyDown={(e) => e.key === 'Escape' && handleDecline()}
    >
      <h2>Risk Acknowledgement</h2>
      <p>You can lose the full amount staked on any bet.</p>
      <p>By betting, you acknowledge:</p>
      <ul className="list-disc ml-5">
        <li>Markets may be resolved incorrectly</li>
        <li>Your stake can be fully lost</li>
        <li>Transactions are irreversible</li>
      </ul>
      <div className="mt-6 flex gap-4">
        <button onClick={handleDecline} className="flex-1">
          Decline
        </button>
        <button onClick={handleAccept} className="flex-1 bg-blue-600">
          Accept
        </button>
      </div>
      <p className="text-sm mt-4">
        Read <a href="/terms">Terms</a> and <a href="/risk">Risk</a> for details.
      </p>
    </dialog>
  );
};
