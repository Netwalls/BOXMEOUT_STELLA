import { MarketStatus } from "@/lib/api";

export interface MarketStatusBadgeProps {
  status: MarketStatus;
}

const COLORS: Record<MarketStatus, string> = {
  Open: "bg-green-700 text-green-100",
  Locked: "bg-yellow-700 text-yellow-100",
  Resolved: "bg-blue-700 text-blue-100",
  Disputed: "bg-red-700 text-red-100",
  Cancelled: "bg-gray-600 text-gray-100",
};

export function MarketStatusBadge({ status }: MarketStatusBadgeProps): JSX.Element {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${COLORS[status]}`}>
      {status}
    </span>
  );
}
