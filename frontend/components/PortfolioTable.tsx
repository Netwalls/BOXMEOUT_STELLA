"use client";
import { useState } from "react";
import Link from "next/link";
import { Bet, Market } from "@/lib/api";
import { ClaimButton } from "./ClaimButton";
import type { ClaimReceipt } from "./ClaimButton";
import { useToast } from "@/components/ToastProvider";

export interface PortfolioTableProps {
  bets: Bet[];
  markets: Record<string, Market>;
  /** Called after any individual claim succeeds so the parent can refresh data. */
  onClaimSuccess?: () => void;
}

// ─── Filter ───────────────────────────────────────────────────────────────────

type FilterTab = "All" | "Open" | "Won" | "Lost" | "Refundable";

const FILTER_TABS: FilterTab[] = ["All", "Open", "Won", "Lost", "Refundable"];

function getBetFilter(tab: FilterTab): (bet: Bet, market: Market | undefined) => boolean {
  switch (tab) {
    case "Open":
      return (_bet, market) =>
        market?.status === "Open" || market?.status === "Locked";
    case "Won":
      return (bet, market) =>
        market?.status === "Resolved" && market?.outcome === bet.side;
    case "Lost":
      return (bet, market) =>
        market?.status === "Resolved" && market?.outcome !== bet.side;
    case "Refundable":
      return (bet, market) =>
        !bet.claimed &&
        (market?.status === "Cancelled" || market?.outcome === "NoContest");
    default:
      return () => true;
  }
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

type SortKey = "fight" | "side" | "amount" | "status" | "payout" | "date";

function sortBets(
  bets: Bet[],
  markets: Record<string, Market>,
  sortKey: SortKey,
  asc: boolean
): Bet[] {
  return [...bets].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "fight": {
        const mA = markets[a.marketId];
        const mB = markets[b.marketId];
        cmp = (mA ? `${mA.fighterA.name} vs ${mA.fighterB.name}` : a.marketId).localeCompare(
          mB ? `${mB.fighterA.name} vs ${mB.fighterB.name}` : b.marketId
        );
        break;
      }
      case "side":
        cmp = a.side.localeCompare(b.side);
        break;
      case "amount":
        cmp = Number(BigInt(a.amount) - BigInt(b.amount));
        break;
      case "status":
        cmp = String(a.claimed).localeCompare(String(b.claimed));
        break;
      case "payout":
        cmp = Number(BigInt(a.payout ?? "0") - BigInt(b.payout ?? "0"));
        break;
      case "date":
        cmp = new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime();
        break;
    }
    return asc ? cmp : -cmp;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PortfolioTable({
  bets,
  markets,
  onClaimSuccess,
}: PortfolioTableProps): JSX.Element {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [asc, setAsc] = useState(false); // newest first by default
  const { addToast: showToast } = useToast();

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setAsc((a) => !a);
    } else {
      setSortKey(key);
      setAsc(true);
    }
  }

  function handleClaimed(receipt: ClaimReceipt) {
    showToast("Bet claimed successfully!", "success");
    onClaimSuccess?.();
  }

  if (bets.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-4xl mb-3">📋</p>
        <p className="mb-6">No bets yet. Head to a market to place your first bet!</p>
        <Link
          href="/"
          className="inline-flex items-center px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors"
        >
          Browse markets
        </Link>
      </div>
    );
  }

  // Apply filter
  const filterFn = getBetFilter(activeFilter);
  const filtered = bets.filter((bet) => filterFn(bet, markets[bet.marketId]));

  // Apply sort
  const sorted = sortBets(filtered, markets, sortKey, asc);

  function Th({
    label,
    sk,
    align = "left",
  }: {
    label: string;
    sk: SortKey;
    align?: "left" | "right";
  }) {
    const active = sortKey === sk;
    return (
      <th
        onClick={() => toggleSort(sk)}
        className={`px-4 py-3 text-${align} text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-white transition-colors`}
      >
        {label}
        {active ? (asc ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter bets">
        {FILTER_TABS.map((tab) => {
          const count = bets.filter((bet) =>
            getBetFilter(tab)(bet, markets[bet.marketId])
          ).length;
          const isActive = activeFilter === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveFilter(tab)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-amber-500 text-black"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
              }`}
            >
              {tab}
              {tab !== "All" && (
                <span
                  className={`ml-1.5 text-[10px] ${isActive ? "text-black/70" : "text-gray-500"}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="text-center py-10 text-gray-500 rounded-xl border border-gray-700">
          <p>No bets match the &ldquo;{activeFilter}&rdquo; filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-800">
              <tr>
                <Th label="Fight" sk="fight" />
                <Th label="Side" sk="side" />
                <Th label="Stake" sk="amount" />
                <Th label="Date" sk="date" />
                <Th label="Status" sk="status" />
                <Th label="Payout" sk="payout" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {sorted.map((bet) => {
                const m = markets[bet.marketId];
                const fight = m
                  ? `${m.fighterA.name} vs ${m.fighterB.name}`
                  : bet.marketId;
                const xlm = (Number(BigInt(bet.amount)) / 1e7).toFixed(2);
                const payout = bet.payout
                  ? (Number(BigInt(bet.payout)) / 1e7).toFixed(2)
                  : "—";
                const placedDate = new Date(bet.placedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });

                return (
                  <tr key={bet.id} className="bg-gray-900 hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-3 text-white whitespace-nowrap">{fight}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{bet.side}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{xlm} XLM</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {placedDate}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          bet.claimed
                            ? "bg-green-800 text-green-200"
                            : "bg-gray-700 text-gray-300"
                        }`}
                      >
                        {bet.claimed ? "Claimed" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{payout}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ClaimButton
                        bet={bet}
                        market={m}
                        onClaimed={handleClaimed}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
