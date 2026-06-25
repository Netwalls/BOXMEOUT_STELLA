"use client";
import { useState } from "react";
import { Bet, Market } from "@/lib/api";

export interface PortfolioTableProps {
  bets: Bet[];
  markets: Record<string, Market>;
}

type SortKey = "fight" | "side" | "amount" | "status" | "payout";

export function PortfolioTable({ bets, markets }: PortfolioTableProps): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>("fight");
  const [asc, setAsc] = useState(true);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc((a) => !a);
    else { setSortKey(key); setAsc(true); }
  }

  if (bets.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-4xl mb-3">📋</p>
        <p>No bets yet. Head to a market to place your first bet!</p>
      </div>
    );
  }

  const sorted = [...bets].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "fight") {
      const mA = markets[a.marketId];
      const mB = markets[b.marketId];
      cmp = (mA ? `${mA.fighterA.name} vs ${mA.fighterB.name}` : a.marketId)
        .localeCompare(mB ? `${mB.fighterA.name} vs ${mB.fighterB.name}` : b.marketId);
    } else if (sortKey === "side") {
      cmp = a.side.localeCompare(b.side);
    } else if (sortKey === "amount") {
      cmp = Number(BigInt(a.amount) - BigInt(b.amount));
    } else if (sortKey === "status") {
      cmp = String(a.claimed).localeCompare(String(b.claimed));
    } else if (sortKey === "payout") {
      cmp = Number(BigInt(a.payout ?? "0") - BigInt(b.payout ?? "0"));
    }
    return asc ? cmp : -cmp;
  });

  function Th({ label, sk }: { label: string; sk: SortKey }) {
    return (
      <th
        onClick={() => toggleSort(sk)}
        className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-white"
      >
        {label}{sortKey === sk ? (asc ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  return (
    /* overflow-x-auto scoped to this container — prevents page-level horizontal scroll */
    <div className="overflow-x-auto rounded-xl border border-gray-700">
      <table className="min-w-full text-sm text-left">
        <thead className="bg-gray-800">
          <tr>
            <Th label="Fight" sk="fight" />
            <Th label="Side" sk="side" />
            <Th label="Amount" sk="amount" />
            <Th label="Status" sk="status" />
            <Th label="Payout" sk="payout" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {sorted.map((bet) => {
            const m = markets[bet.marketId];
            const fight = m ? `${m.fighterA.name} vs ${m.fighterB.name}` : bet.marketId;
            const xlm = (Number(BigInt(bet.amount)) / 1e7).toFixed(2);
            const payout = bet.payout ? (Number(BigInt(bet.payout)) / 1e7).toFixed(2) : "—";
            return (
              <tr key={bet.id} className="bg-gray-900 hover:bg-gray-800">
                <td className="px-4 py-3 text-white whitespace-nowrap">{fight}</td>
                <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{bet.side}</td>
                <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{xlm} XLM</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${bet.claimed ? "bg-green-800 text-green-200" : "bg-gray-700 text-gray-300"}`}>
                    {bet.claimed ? "Claimed" : "Pending"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{payout}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
