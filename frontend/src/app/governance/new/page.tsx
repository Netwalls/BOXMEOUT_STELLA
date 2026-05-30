'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getConnectedAddress, createProposal } from '@/services/wallet';
import { TxStatusToast } from '@/components/ui/TxStatusToast';
import type { TxStatus, ProposalType } from '@/types';

// Mock data to satisfy "ILN contract" requirements within BOXMEOUT codebase
const MIN_ILN_REQUIRED = 10000;
const MOCK_APPROVED_TOKENS = [
  { address: 'CBZ...X1', name: 'USDC' },
  { address: 'CBX...Y2', name: 'EURC' },
  { address: 'CBY...Z3', name: 'AQUA' }
];

export default function NewProposalPage() {
  const router = useRouter();
  const connectedAddress = getConnectedAddress();

  const [txStatus, setTxStatus] = useState<TxStatus>({
    hash: null,
    status: 'idle',
    error: null,
  });

  const [proposalType, setProposalType] = useState<ProposalType>('fee_rate');
  const [balanceILN, setBalanceILN] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);

  // Mock current parameters
  const currentParams = {
    fee_rate: 30, // bps
    max_discount_rate: 500, // bps
  };

  // Dynamic form state
  const [feeRate, setFeeRate] = useState<string>('');
  const [addTokenAddress, setAddTokenAddress] = useState<string>('');
  const [removeTokenAddress, setRemoveTokenAddress] = useState<string>(MOCK_APPROVED_TOKENS[0]?.address || '');
  const [maxDiscountRate, setMaxDiscountRate] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  // Fetch mock balance on load
  useEffect(() => {
    if (!connectedAddress) return;
    const fetchBalance = async () => {
      setIsLoadingBalance(true);
      // Simulate network request for ILN balance
      await new Promise((r) => setTimeout(r, 500));
      // Mocking that user has enough balance
      setBalanceILN(15000); 
      setIsLoadingBalance(false);
    };
    fetchBalance();
  }, [connectedAddress]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (balanceILN < MIN_ILN_REQUIRED) {
      setTxStatus({ hash: null, status: 'error', error: 'Insufficient ILN balance to create proposal' });
      return;
    }

    if (!description.trim()) {
      setTxStatus({ hash: null, status: 'error', error: 'Description is required' });
      return;
    }

    let value: string | number;

    switch (proposalType) {
      case 'fee_rate':
        const fee = parseInt(feeRate, 10);
        if (isNaN(fee) || fee < 0 || fee > 1000) {
          setTxStatus({ hash: null, status: 'error', error: 'Fee rate must be between 0 and 1000 bps' });
          return;
        }
        value = fee;
        break;
      case 'add_token':
        if (!addTokenAddress || addTokenAddress.length < 56) {
          // Very rudimentary validation for Stellar address
          setTxStatus({ hash: null, status: 'error', error: 'Invalid token contract address' });
          return;
        }
        value = addTokenAddress;
        break;
      case 'remove_token':
        if (!removeTokenAddress) {
          setTxStatus({ hash: null, status: 'error', error: 'Please select a token to remove' });
          return;
        }
        value = removeTokenAddress;
        break;
      case 'max_discount_rate':
        const maxDiscount = parseInt(maxDiscountRate, 10);
        if (isNaN(maxDiscount) || maxDiscount < 0) {
          setTxStatus({ hash: null, status: 'error', error: 'Max discount rate must be a valid positive number' });
          return;
        }
        value = maxDiscount;
        break;
      default:
        return;
    }

    setTxStatus({ hash: null, status: 'signing', error: null });

    try {
      const hash = await createProposal({
        type: proposalType,
        value,
        description
      });

      setTxStatus({ hash, status: 'success', error: null });
      // Redirect to proposals list or similar after success
      setTimeout(() => router.push('/governance'), 2000);
    } catch (err: any) {
      setTxStatus({ hash: null, status: 'error', error: err.message });
    }
  };

  if (!connectedAddress) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Create Proposal</h1>
        <p className="text-gray-400">Connect your wallet to participate in governance.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">Create Governance Proposal</h1>
      
      {!isLoadingBalance && (
        <div className="mb-6 p-4 bg-gray-800 rounded-lg flex justify-between items-center border border-gray-700">
          <span className="text-sm font-medium text-gray-300">Your ILN Balance:</span>
          <span className={`font-mono font-bold ${balanceILN >= MIN_ILN_REQUIRED ? 'text-green-400' : 'text-red-400'}`}>
            {balanceILN.toLocaleString()} / {MIN_ILN_REQUIRED.toLocaleString()} Min Req.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">Proposal Type</label>
          <select 
            value={proposalType}
            onChange={(e) => setProposalType(e.target.value as ProposalType)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded"
          >
            <option value="fee_rate">Fee Rate</option>
            <option value="add_token">Add Token</option>
            <option value="remove_token">Remove Token</option>
            <option value="max_discount_rate">Max Discount Rate</option>
          </select>
        </div>

        <div className="p-4 bg-gray-900 rounded border border-gray-800">
          {proposalType === 'fee_rate' && (
            <div>
              <label className="block text-sm font-medium mb-1">
                New Fee Rate (bps) <span className="text-gray-500 font-normal ml-2">Current: {currentParams.fee_rate} bps</span>
              </label>
              <input 
                type="number" 
                min="0"
                max="1000"
                placeholder="e.g. 50 (for 0.5%)"
                value={feeRate}
                onChange={(e) => setFeeRate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded" 
              />
              <p className="text-xs text-gray-400 mt-2">Maximum fee rate is 1000 bps (10%).</p>
            </div>
          )}

          {proposalType === 'add_token' && (
            <div>
              <label className="block text-sm font-medium mb-1">Token Contract Address</label>
              <input 
                type="text" 
                placeholder="C..."
                value={addTokenAddress}
                onChange={(e) => setAddTokenAddress(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded" 
              />
              {addTokenAddress.length > 20 && (
                <div className="mt-2 text-sm text-blue-400">
                  Preview: Mock Token Name (would fetch from contract)
                </div>
              )}
            </div>
          )}

          {proposalType === 'remove_token' && (
            <div>
              <label className="block text-sm font-medium mb-1">Select Token to Remove</label>
              <select 
                value={removeTokenAddress}
                onChange={(e) => setRemoveTokenAddress(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded"
              >
                {MOCK_APPROVED_TOKENS.map(token => (
                  <option key={token.address} value={token.address}>
                    {token.name} ({token.address})
                  </option>
                ))}
              </select>
            </div>
          )}

          {proposalType === 'max_discount_rate' && (
            <div>
              <label className="block text-sm font-medium mb-1">
                New Max Discount Rate (bps) <span className="text-gray-500 font-normal ml-2">Current: {currentParams.max_discount_rate} bps</span>
              </label>
              <input 
                type="number" 
                min="0"
                placeholder="e.g. 500"
                value={maxDiscountRate}
                onChange={(e) => setMaxDiscountRate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded" 
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Proposal Description</label>
          <textarea 
            rows={4}
            placeholder="Explain the rationale behind this proposal..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded resize-none" 
          />
          <p className="text-xs text-gray-500 mt-1">This will be stored off-chain in the transaction memo/metadata.</p>
        </div>

        <button
          type="submit"
          disabled={['signing','broadcasting','confirming'].includes(txStatus.status) || isLoadingBalance || balanceILN < MIN_ILN_REQUIRED}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-semibold transition-colors"
        >
          {['signing','broadcasting','confirming'].includes(txStatus.status) ? 'Submitting...' : 'Submit Proposal'}
        </button>
      </form>

      <TxStatusToast txStatus={txStatus} onDismiss={() => setTxStatus({ hash: null, status: 'idle', error: null })} />
    </div>
  );
}
