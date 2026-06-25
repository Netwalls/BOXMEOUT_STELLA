"use client";

export const STATUS_TABS = ["All", "Open", "Locked", "Resolved"] as const;
export type StatusTab = (typeof STATUS_TABS)[number];

export interface MarketFilterBarProps {
  statusTab: StatusTab;
  weightClass: string;
  weightClasses: string[];
  onStatusChange: (status: StatusTab) => void;
  onWeightClassChange: (weightClass: string) => void;
}

export function MarketFilterBar({
  statusTab,
  weightClass,
  weightClasses,
  onStatusChange,
  onWeightClassChange,
}: MarketFilterBarProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => onStatusChange(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              statusTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <select
        value={weightClass}
        onChange={(e) => onWeightClassChange(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">All Weight Classes</option>
        {weightClasses.map((wc) => (
          <option key={wc} value={wc}>
            {wc}
          </option>
        ))}
      </select>
    </div>
  );
}
