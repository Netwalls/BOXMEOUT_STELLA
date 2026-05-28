'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getConnectedAddress, voteProposal, executeProposal } from '@/services/wallet';
import { TxStatusToast } from '@/components/ui/TxStatusToast';
import type { Proposal, TxStatus, VoteType } from '@/types';

// Using the same mock data for consistency
const MOCK_PROPOSALS: Record<string, Proposal> = {
  'prop_1': {
    id: 'prop_1', type: 'fee_rate', value: 40, description: 'Increase the fee rate to 40 bps to support the treasury.', status: 'Active', proposer: 'CBX...4A', votesFor: 50000, votesAgainst: 15000, votesAbstain: 5000, createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), expiresAt: new Date(Date.now() + 86400000 * 5).toISOString(),
  },
  'prop_2': {
    id: 'prop_2', type: 'add_token', value: 'CBZ...X1', description: 'Add USDC to the approved token list for market settlements.', status: 'Passed', proposer: 'CCM...9Z', votesFor: 120000, votesAgainst: 10000, votesAbstain: 0, createdAt: new Date(Date.now() - 86400000 * 10).toISOString(), expiresAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  'prop_3': {
    id: 'prop_3', type: 'max_discount_rate', value: 600, description: 'Change the maximum discount rate to 600 bps.', status: 'Executed', proposer: 'CDM...8B', votesFor: 80000, votesAgainst: 20000, votesAbstain: 2000, createdAt: new Date(Date.now() - 86400000 * 20).toISOString(), expiresAt: new Date(Date.now() - 86400000 * 13).toISOString(),
  },
};

export default function ProposalDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const connectedAddress = getConnectedAddress();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [votingPower, setVotingPower] = useState<number>(0);
  const [hasVoted, setHasVoted] = useState<boolean>(false);
  
  const [txStatus, setTxStatus] = useState<TxStatus>({
    hash: null, status: 'idle', error: null,
  });

  useEffect(() => {
    // Mock fetch proposal
    const data = MOCK_PROPOSALS[params.id];
    if (data) {
      setProposal(data);
    }

    if (connectedAddress) {
      // Mock fetch voting power
      setVotingPower(15000);
      // Mock checking if already voted
      setHasVoted(false);
    }
  }, [params.id, connectedAddress]);

  if (!proposal) {
    return <div className="p-8 text-center text-gray-400">Loading proposal...</div>;
  }

  const handleVote = async (vote: VoteType) => {
    if (!connectedAddress) return;
    setTxStatus({ hash: null, status: 'signing', error: null });
    try {
      const hash = await voteProposal(proposal.id, vote);
      setTxStatus({ hash, status: 'success', error: null });
      setHasVoted(true);
      
      // Optimistically update votes (mocking real-time updates)
      setProposal(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          votesFor: vote === 'for' ? prev.votesFor + votingPower : prev.votesFor,
          votesAgainst: vote === 'against' ? prev.votesAgainst + votingPower : prev.votesAgainst,
          votesAbstain: vote === 'abstain' ? prev.votesAbstain + votingPower : prev.votesAbstain,
        };
      });
    } catch (err: any) {
      setTxStatus({ hash: null, status: 'error', error: err.message });
    }
  };

  const handleExecute = async () => {
    setTxStatus({ hash: null, status: 'signing', error: null });
    try {
      const hash = await executeProposal(proposal.id);
      setTxStatus({ hash, status: 'success', error: null });
      setProposal(prev => prev ? { ...prev, status: 'Executed' } : prev);
    } catch (err: any) {
      setTxStatus({ hash: null, status: 'error', error: err.message });
    }
  };

  const totalVotes = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;
  const pctFor = totalVotes > 0 ? (proposal.votesFor / totalVotes) * 100 : 0;
  const pctAgainst = totalVotes > 0 ? (proposal.votesAgainst / totalVotes) * 100 : 0;
  const pctAbstain = totalVotes > 0 ? (proposal.votesAbstain / totalVotes) * 100 : 0;

  const formatType = (type: string) => type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return (
    <div className="max-w-4xl mx-auto p-8">
      <Link href="/governance" className="text-blue-500 hover:text-blue-400 mb-6 inline-block text-sm font-medium">
        ← Back to Proposals
      </Link>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-8">
        <div className="p-6 border-b border-gray-800">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-800 text-gray-300">
                  {proposal.id}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border
                  ${proposal.status === 'Active' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                    proposal.status === 'Passed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                    proposal.status === 'Failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                    'bg-purple-500/10 text-purple-400 border-purple-500/20'}
                `}>
                  {proposal.status}
                </span>
              </div>
              <h1 className="text-2xl font-bold">{formatType(proposal.type)}</h1>
            </div>
            
            {proposal.status === 'Passed' && (
              <button 
                onClick={handleExecute}
                disabled={['signing','broadcasting','confirming'].includes(txStatus.status)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded font-medium transition-colors"
              >
                Execute Proposal
              </button>
            )}
          </div>

          <div className="bg-gray-800/50 p-4 rounded-lg mb-6 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-400 mb-1">Proposed Change</h3>
            <p className="text-lg font-mono text-gray-200">
              Set <span className="text-blue-400">{proposal.type}</span> to <span className="text-green-400">{proposal.value}</span>
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">Description</h3>
            <p className="text-gray-300 leading-relaxed">{proposal.description}</p>
          </div>
        </div>

        {/* Voting Section */}
        <div className="p-6 bg-gray-900/50">
          <div className="grid md:grid-cols-2 gap-8">
            
            {/* Vote Results */}
            <div>
              <h3 className="text-lg font-bold mb-4">Current Results</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-green-400">For</span>
                    <span className="text-gray-400">{proposal.votesFor.toLocaleString()} ({pctFor.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${pctFor}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-red-400">Against</span>
                    <span className="text-gray-400">{proposal.votesAgainst.toLocaleString()} ({pctAgainst.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500" style={{ width: `${pctAgainst}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-400">Abstain</span>
                    <span className="text-gray-400">{proposal.votesAbstain.toLocaleString()} ({pctAbstain.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-500" style={{ width: `${pctAbstain}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Voting Action */}
            <div className="p-5 border border-gray-800 rounded-xl bg-gray-900">
              <h3 className="text-lg font-bold mb-4">Cast Your Vote</h3>
              
              {!connectedAddress ? (
                <div className="text-center p-4">
                  <p className="text-sm text-gray-400">Connect wallet to vote.</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-6 text-sm">
                    <span className="text-gray-400">Your Voting Power:</span>
                    <span className="font-mono font-medium">{votingPower.toLocaleString()} ILN</span>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => handleVote('for')}
                      disabled={proposal.status !== 'Active' || hasVoted || ['signing','broadcasting','confirming'].includes(txStatus.status)}
                      className="w-full py-2.5 bg-green-500/10 text-green-400 border border-green-500/50 hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed rounded font-medium transition-colors"
                    >
                      Vote For
                    </button>
                    <button
                      onClick={() => handleVote('against')}
                      disabled={proposal.status !== 'Active' || hasVoted || ['signing','broadcasting','confirming'].includes(txStatus.status)}
                      className="w-full py-2.5 bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed rounded font-medium transition-colors"
                    >
                      Vote Against
                    </button>
                    <button
                      onClick={() => handleVote('abstain')}
                      disabled={proposal.status !== 'Active' || hasVoted || ['signing','broadcasting','confirming'].includes(txStatus.status)}
                      className="w-full py-2.5 bg-gray-500/10 text-gray-400 border border-gray-500/50 hover:bg-gray-500/20 disabled:opacity-50 disabled:cursor-not-allowed rounded font-medium transition-colors"
                    >
                      Abstain
                    </button>
                  </div>

                  {hasVoted && (
                    <p className="text-center text-sm text-green-400 mt-4">
                      Your vote has been recorded!
                    </p>
                  )}
                  {proposal.status !== 'Active' && !hasVoted && (
                    <p className="text-center text-sm text-gray-500 mt-4">
                      Voting has ended for this proposal.
                    </p>
                  )}
                </>
              )}
            </div>
            
          </div>
        </div>
      </div>

      <TxStatusToast txStatus={txStatus} onDismiss={() => setTxStatus({ hash: null, status: 'idle', error: null })} />
    </div>
  );
}
