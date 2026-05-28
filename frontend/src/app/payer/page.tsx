'use client';

import { useState, useEffect } from 'react';
import { getConnectedAddress, markPaid } from '@/services/wallet';
import { TxStatusToast } from '@/components/ui/TxStatusToast';
import type { Invoice, TxStatus } from '@/types';

// Mock data to simulate the ILN invoices within this app
const MOCK_INVOICES: Invoice[] = [
  {
    id: 'INV-1001',
    freelancer: 'GB...XYZ',
    payer: '', // Will be dynamically set to the connected user
    amount: 1500,
    dueDate: new Date(Date.now() + 86400000 * 5).toISOString(), // 5 days from now
    status: 'Funded'
  },
  {
    id: 'INV-1002',
    freelancer: 'GA...123',
    payer: '', // Will be set to connected user
    amount: 3200,
    dueDate: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago (overdue)
    status: 'Funded'
  },
  {
    id: 'INV-1003',
    freelancer: 'GD...789',
    payer: '',
    amount: 500,
    dueDate: new Date(Date.now() + 86400000 * 15).toISOString(), // 15 days from now
    status: 'Pending' // Should not show up
  },
  {
    id: 'INV-1004',
    freelancer: 'GC...456',
    payer: 'SOME_OTHER_USER', // Not the connected user
    amount: 1000,
    dueDate: new Date(Date.now() + 86400000 * 1).toISOString(),
    status: 'Funded'
  }
];

export default function PayerDashboard() {
  const connectedAddress = getConnectedAddress();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  
  const [txStatus, setTxStatus] = useState<TxStatus>({
    hash: null,
    status: 'idle',
    error: null,
  });

  useEffect(() => {
    if (connectedAddress) {
      // Setup mock data where the first two are assigned to the current user
      const hydratedMocks = MOCK_INVOICES.map((inv, idx) => {
        if (idx < 3) return { ...inv, payer: connectedAddress };
        return inv;
      });

      // Filter: only show invoices where payer == connected address AND status == 'Funded'
      const filtered = hydratedMocks.filter(
        inv => inv.payer === connectedAddress && inv.status === 'Funded'
      );
      setInvoices(filtered);
    } else {
      setInvoices([]);
    }
  }, [connectedAddress]);

  const handleSettleConfirm = async () => {
    if (!selectedInvoice) return;
    
    setTxStatus({ hash: null, status: 'signing', error: null });
    
    try {
      const hash = await markPaid(selectedInvoice.id);
      
      setTxStatus({ hash, status: 'success', error: null });
      
      // Remove the settled invoice from the list (or we could change its status to Paid, 
      // but the requirement is to show Funded invoices, so it disappears or changes badge)
      // We will change its status in the state so the user sees it update, and then maybe fade it out
      setInvoices(prev => prev.map(inv => 
        inv.id === selectedInvoice.id ? { ...inv, status: 'Paid' } : inv
      ));

      setTimeout(() => {
        setSelectedInvoice(null);
        // Optionally remove from list after a delay
        setInvoices(prev => prev.filter(inv => inv.id !== selectedInvoice.id));
      }, 3000);

    } catch (err: any) {
      setTxStatus({ hash: null, status: 'error', error: err.message });
      setSelectedInvoice(null);
    }
  };

  if (!connectedAddress) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center mt-12">
        <h1 className="text-3xl font-bold mb-4">Payer Dashboard</h1>
        <p className="text-gray-400">Connect your wallet to view and settle your assigned invoices.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Payer Dashboard</h1>
        <p className="text-gray-400 mt-2">Manage and settle your outstanding invoices.</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
        {invoices.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            You have no pending invoices to settle.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-800/50 text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-6 py-4 font-medium">Invoice ID</th>
                  <th className="px-6 py-4 font-medium">Freelancer</th>
                  <th className="px-6 py-4 font-medium">Amount Owed</th>
                  <th className="px-6 py-4 font-medium">Due Date</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {invoices.map((inv) => {
                  const ms = new Date(inv.dueDate).getTime() - Date.now();
                  const daysRemaining = Math.ceil(ms / (1000 * 60 * 60 * 24));
                  const isOverdue = daysRemaining < 0;
                  const isPaid = inv.status === 'Paid';

                  return (
                    <tr 
                      key={inv.id} 
                      className={`hover:bg-gray-800/30 transition-colors ${isOverdue && !isPaid ? 'bg-red-900/10 border-l-2 border-red-500' : 'border-l-2 border-transparent'}`}
                    >
                      <td className="px-6 py-4 font-mono font-medium text-gray-200">
                        {inv.id}
                      </td>
                      <td className="px-6 py-4 font-mono text-gray-400">
                        {inv.freelancer}
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-200">
                        {inv.amount.toLocaleString()} USDC
                      </td>
                      <td className="px-6 py-4">
                        <div className={isOverdue && !isPaid ? 'text-red-400' : 'text-gray-300'}>
                          {new Date(inv.dueDate).toLocaleDateString()}
                        </div>
                        {!isPaid && (
                          <div className={`text-xs mt-1 font-medium ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
                            {isOverdue 
                              ? `Overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? 's' : ''}` 
                              : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border
                          ${isPaid ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}
                        `}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          disabled={isPaid}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-medium transition-colors"
                        >
                          {isPaid ? 'Settled' : 'Settle'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Settle Confirm Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-2">Confirm Settlement</h3>
              <p className="text-gray-300 mb-6">
                You are about to send <span className="font-bold text-white">{selectedInvoice.amount.toLocaleString()} USDC</span> to settle invoice <span className="font-mono text-white">#{selectedInvoice.id}</span>.
              </p>
              
              <div className="bg-gray-800 p-4 rounded-lg mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Freelancer</span>
                  <span className="font-mono">{selectedInvoice.freelancer}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Network Fee</span>
                  <span className="text-gray-300">~0.00001 XLM</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedInvoice(null)}
                  disabled={['signing','broadcasting','confirming'].includes(txStatus.status)}
                  className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSettleConfirm}
                  disabled={['signing','broadcasting','confirming'].includes(txStatus.status)}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded font-medium transition-colors flex justify-center items-center gap-2"
                >
                  {['signing','broadcasting','confirming'].includes(txStatus.status) ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Settling...
                    </>
                  ) : (
                    'Confirm & Pay'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TxStatusToast txStatus={txStatus} onDismiss={() => setTxStatus({ hash: null, status: 'idle', error: null })} />
    </div>
  );
}
