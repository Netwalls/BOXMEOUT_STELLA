'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getConnectedAddress, createMarket } from '@/services/wallet';
import { TxStatusToast } from '@/components/ui/TxStatusToast';
import type { TxStatus } from '@/types';

const ADMIN_ADDRESSES = (
  process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ?? ''
).split(',').map(a => a.trim()).filter(Boolean);

const WEIGHT_CLASSES = [
  'Heavyweight',
  'Cruiserweight',
  'Light Heavyweight',
  'Super Middleweight',
  'Middleweight',
  'Super Welterweight',
  'Welterweight',
  'Super Lightweight',
  'Lightweight',
  'Super Featherweight',
  'Featherweight',
  'Super Bantamweight',
  'Bantamweight',
  'Super Flyweight',
  'Flyweight',
];

export default function CreateMarketPage() {
  const router = useRouter();
  const [txStatus, setTxStatus] = useState<TxStatus>({
    hash: null,
    status: 'idle',
    error: null,
  });

  const connectedAddress = getConnectedAddress();
  const isAdmin = connectedAddress && ADMIN_ADDRESSES.includes(connectedAddress);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const matchId = data.get('matchId') as string;
    const fighterA = data.get('fighterA') as string;
    const fighterB = data.get('fighterB') as string;
    const weightClass = data.get('weightClass') as string;
    const venue = data.get('venue') as string;
    const titleFight = data.get('titleFight') === 'on';
    const scheduledAt = data.get('scheduledAt') as string;
    const minBet = parseFloat(data.get('minBet') as string);
    const maxBet = parseFloat(data.get('maxBet') as string);
    const feePct = parseFloat(data.get('feePct') as string);
    const lockBefore = parseInt(data.get('lockBefore') as string, 10);

    if (!matchId || !fighterA || !fighterB || !weightClass || !venue || !scheduledAt) {
      setTxStatus({ hash: null, status: 'error', error: 'All fields required' });
      return;
    }
    if (minBet <= 0 || maxBet <= 0 || maxBet < minBet) {
      setTxStatus({ hash: null, status: 'error', error: 'Invalid bet limits' });
      return;
    }
    if (feePct < 0 || feePct > 10) {
      setTxStatus({ hash: null, status: 'error', error: 'Fee must be 0–10%' });
      return;
    }

    setTxStatus({ hash: null, status: 'signing', error: null });

    try {
      const hash = await createMarket({
        matchId,
        fighterA,
        fighterB,
        weightClass,
        venue,
        titleFight,
        scheduledAt: new Date(scheduledAt).toISOString(),
        minBetXlm: minBet,
        maxBetXlm: maxBet,
        feeBps: Math.round(feePct * 100),
        lockBeforeMinutes: lockBefore,
      });

      setTxStatus({ hash, status: 'success', error: null });
      setTimeout(() => router.push(`/markets/${matchId}`), 2000);
    } catch (err: any) {
      setTxStatus({ hash: null, status: 'error', error: err.message });
    }
  };

  if (!connectedAddress) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Create Market</h1>
        <p className="text-gray-400">Connect your wallet to continue</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
        <p className="text-gray-400">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Create Boxing Market</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Match ID</label>
          <input name="matchId" type="text" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Fighter A</label>
            <input name="fighterA" type="text" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Fighter B</label>
            <input name="fighterB" type="text" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Weight Class</label>
          <select name="weightClass" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded">
            {WEIGHT_CLASSES.map(wc => <option key={wc} value={wc}>{wc}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Venue</label>
          <input name="venue" type="text" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <input name="titleFight" type="checkbox" className="w-4 h-4" />
          <label className="text-sm font-medium">Title Fight</label>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Scheduled At</label>
          <input name="scheduledAt" type="datetime-local" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Min Bet (XLM)</label>
            <input name="minBet" type="number" step="0.01" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Bet (XLM)</label>
            <input name="maxBet" type="number" step="0.01" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Fee % (0–10)</label>
            <input name="feePct" type="number" step="0.1" min="0" max="10" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Lock Before (minutes)</label>
            <input name="lockBefore" type="number" min="0" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded" />
          </div>
        </div>
        <button
          type="submit"
          disabled={['signing','broadcasting','confirming'].includes(txStatus.status)}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-semibold"
        >
          {['signing','broadcasting','confirming'].includes(txStatus.status) ? 'Creating...' : 'Create Market'}
        </button>
      </form>
      <TxStatusToast txStatus={txStatus} onDismiss={() => setTxStatus({ hash: null, status: 'idle', error: null })} />
    </div>
  );
}
