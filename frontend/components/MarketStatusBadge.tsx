import { MarketStatus } from "@/lib/api";

/** Additional reason when a market is cancelled, producing a distinct badge. */
export type CancelReason = "Draw" | "NoContest" | "AdminCancelled";

export interface MarketStatusBadgeProps {
  status: MarketStatus;
  /** Optional reason for a Cancelled status, showing a more specific badge. */
  cancelReason?: CancelReason;
}

const COLORS: Record<MarketStatus, string> = {
  Open: "bg-green-700 text-green-100",
  Locked: "bg-yellow-700 text-yellow-100",
  Resolved: "bg-blue-700 text-blue-100",
  Disputed: "bg-red-700 text-red-100",
  Cancelled: "bg-gray-600 text-gray-100",
};

/** Label shown for each cancel reason, or null to keep the generic "Cancelled". */
const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  Draw: "Draw",
  NoContest: "No Contest",
  AdminCancelled: "Admin cancelled",
};

export function MarketStatusBadge({ status, cancelReason }: MarketStatusBadgeProps): JSX.Element {
  const label =
    status === "Cancelled" && cancelReason && CANCEL_REASON_LABELS[cancelReason]
      ? CANCEL_REASON_LABELS[cancelReason]
      : status;

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${COLORS[status]}`}>
      {status === "Cancelled" && cancelReason ? (
        <>
          {label}
          {cancelReason !== "AdminCancelled" && (
            <span className="ml-1 normal-case font-normal">(full refund)</span>
          )}
        </>
      ) : (
        label
      )}
    </span>
  );
}
