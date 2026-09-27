"use client";
import { PortfolioTable } from "@/components/PortfolioTable";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWallet } from "@/hooks/useWallet";
import { Bet } from "@/lib/api";

// ─── helpers ─────────────────────────────────────────────────────────────────

function xlm(stroops: string): string {
  return (Number(BigInt(stroops)) / 1e7).toFixed(2);
}

/** Net PnL = total won − total staked (can be negative). */
function netPnL(totalWinnings: string, totalStaked: string): number {
  return (Number(BigInt(totalWinnings)) - Number(BigInt(totalStaked))) / 1e7;
}

/**
 * Win rate = bets with a non-null payout / all completed bets.
 * A non-null payout means the bet was on the winning side.
 */
function winRate(bets: Bet[]): number {
  const completed = bets.filter((b) => b.payout !== null);
  if (completed.length === 0) return 0;
  const won = completed.filter((b) => BigInt(b.payout!) > BigInt(0));
  return won.length / completed.length;
}

// ─── CSV export ──────────────────────────────────────────────────────────────

function exportCSV(bets: Bet[]): void {
  const header = ["Bet ID", "Market ID", "Side", "Amount (XLM)", "Status", "Payout (XLM)", "Placed At"];
  const rows = bets.map((b) => [
    b.id,
    b.marketId,
    b.side,
    (Number(BigInt(b.amount)) / 1e7).toFixed(7),
    b.claimed ? "Claimed" : "Pending",
    b.payout ? (Number(BigInt(b.payout)) / 1e7).toFixed(7) : "",
    new Date(b.placedAt).toISOString(),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "boxmeout-positions.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

interface StatTileProps {
  label: string;
  value: string;
  valueClass?: string;
}

function StatTile({ label, value, valueClass = "text-white" }: StatTileProps) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { address, connect } = useWallet();
  const { bets, summary, isLoading } = usePortfolio(address);

  const handleExport = () => exportCSV(bets);

  if (!address) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-gray-400">
        <p className="text-4xl mb-4">👛</p>
        <p className="mb-6 text-lg">Connect your wallet to view your portfolio.</p>
        <WalletConnectButton onConnected={connect} />
      </div>
    );
  }

  // Derived stats from bets array
  const wr = winRate(bets);

  const pnl = summary ? netPnL(summary.totalWinnings, summary.totalStaked) : 0;
  const pnlLabel = pnl >= 0 ? `+${pnl.toFixed(2)} XLM` : `${pnl.toFixed(2)} XLM`;
  const pnlClass = pnl >= 0 ? "text-green-400" : "text-red-400";

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Page header with export */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">My Portfolio</h1>
        {!isLoading && bets.length > 0 && (
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-300 hover:border-gray-400 hover:text-white transition-colors"
            aria-label="Export positions as CSV"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        )}
      </div>

      {isLoading ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-xl p-4 animate-pulse h-24" />
            ))}
          </div>
          <LoadingSkeleton variant="row" count={5} />
        </>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatTile
                label="Total Staked"
                value={`${xlm(summary.totalStaked)} XLM`}
              />
              <StatTile
                label="Total Won"
                value={`${xlm(summary.totalWinnings)} XLM`}
              />
              <StatTile
                label="Net PnL"
                value={pnlLabel}
                valueClass={pnlClass}
              />
              <StatTile
                label="Win Rate"
                value={`${(wr * 100).toFixed(1)}%`}
                valueClass={wr >= 0.5 ? "text-green-400" : "text-gray-300"}
              />
            </div>
          )}

          <PortfolioTable bets={bets} markets={{}} />
        </>
      )}
    </div>
  );
}
