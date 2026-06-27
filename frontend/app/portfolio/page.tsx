"use client";
import { PortfolioTable } from "@/components/PortfolioTable";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWallet } from "@/hooks/useWallet";

export default function PortfolioPage(): JSX.Element {
  const { address, connect } = useWallet();
  const { bets, summary, isLoading } = usePortfolio(address);

  if (!address) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-4xl mb-4">👛</p>
        <p className="mb-6 text-lg">Connect your wallet to view your portfolio.</p>
        <WalletConnectButton onConnected={connect} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">My Portfolio</h1>

      {isLoading ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-xl p-4 animate-pulse h-24" />
            ))}
          </div>
          <LoadingSkeleton variant="table" count={5} />
        </>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-xs text-gray-400 uppercase tracking-wider">Total Staked</p>
                <p className="text-xl font-bold text-white mt-1">
                  {(Number(BigInt(summary.totalStaked)) / 1e7).toFixed(2)} XLM
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-xs text-gray-400 uppercase tracking-wider">Total Winnings</p>
                <p className="text-xl font-bold text-white mt-1">
                  {(Number(BigInt(summary.totalWinnings)) / 1e7).toFixed(2)} XLM
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-xs text-gray-400 uppercase tracking-wider">Pending Claims</p>
                <p className="text-xl font-bold text-white mt-1">
                  {(Number(BigInt(summary.pendingClaims)) / 1e7).toFixed(2)} XLM
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-xs text-gray-400 uppercase tracking-wider">ROI</p>
                <p className={`text-xl font-bold mt-1 ${summary.roi >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {(summary.roi * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          )}

          <PortfolioTable bets={bets} markets={{}} />
        </>
      )}
    </div>
  );
}
