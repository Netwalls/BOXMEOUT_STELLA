import { Market } from "@/lib/api";
import { CountdownTimer } from "@/components/CountdownTimer";
import { getDisputeWindowEndsAtMs, getResolutionStage, ResolutionStage } from "@/lib/resolution";

export type TimelineStepState = "done" | "current" | "upcoming";

export interface TimelineStep {
  id: "locked" | "resolved" | "dispute-window" | "finalized";
  label: string;
  state: TimelineStepState;
}

const STEP_ORDER: TimelineStep["id"][] = ["locked", "resolved", "dispute-window", "finalized"];

const STEP_LABELS: Record<TimelineStep["id"], string> = {
  locked: "Locked",
  resolved: "Resolved",
  "dispute-window": "Dispute window",
  finalized: "Finalized",
};

/**
 * Which timeline steps are done, current or upcoming for a lifecycle stage.
 * Cancelled markets have no winnings timeline, so they return no steps.
 */
export function getTimelineSteps(stage: ResolutionStage): TimelineStep[] {
  if (stage === "cancelled") return [];

  // Index of the step that is current; everything before it is done
  const currentIndex: Record<Exclude<ResolutionStage, "cancelled">, number> = {
    open: -1,
    locked: 0,
    "dispute-window": 2,
    disputed: 2,
    finalized: 4,
  };
  const current = currentIndex[stage];

  return STEP_ORDER.map((id, index) => {
    let state: TimelineStepState = "upcoming";
    if (index < current) state = "done";
    else if (index === current) state = "current";
    const label = stage === "disputed" && id === "dispute-window" ? "Disputed" : STEP_LABELS[id];
    return { id, label, state };
  });
}

const STEP_CLASSES: Record<TimelineStepState, string> = {
  done: "bg-green-600 border-green-600 text-white",
  current: "bg-amber-500 border-amber-500 text-black",
  upcoming: "bg-transparent border-gray-600 text-gray-500",
};

export interface ResolutionTimelineProps {
  market: Market;
  now?: number;
}

export function ResolutionTimeline({ market, now }: ResolutionTimelineProps): JSX.Element {
  const stage = getResolutionStage(market, now ?? Date.now());
  const steps = getTimelineSteps(stage);

  if (stage === "cancelled") {
    return (
      <p className="rounded-xl bg-gray-800 p-4 text-sm text-gray-300">
        This market was cancelled. Bets can be refunded from your portfolio.
      </p>
    );
  }

  return (
    <section aria-labelledby="resolution-timeline-heading" className="rounded-xl bg-gray-800 p-4">
      <h2 id="resolution-timeline-heading" className="mb-3 text-sm font-semibold text-gray-300">
        Resolution
      </h2>

      <ol aria-label="Resolution timeline" className="space-y-3">
        {steps.map((step) => (
          <li
            key={step.id}
            aria-current={step.state === "current" ? "step" : undefined}
            className="flex items-center gap-3 text-sm"
          >
            <span
              aria-hidden="true"
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${STEP_CLASSES[step.state]}`}
            >
              {step.state === "done" ? "✓" : ""}
            </span>
            <span className={step.state === "upcoming" ? "text-gray-500" : "text-white"}>
              {step.label}
            </span>
            <span className="sr-only">
              {step.state === "done" ? "(complete)" : step.state === "current" ? "(in progress)" : "(upcoming)"}
            </span>
          </li>
        ))}
      </ol>

      {stage === "dispute-window" && (
        <div className="mt-4">
          <CountdownTimer
            targetTimestamp={Math.floor(getDisputeWindowEndsAtMs(market) / 1000)}
            label="Winnings become claimable in"
            expiredLabel="Finalized"
          />
        </div>
      )}

      {stage === "disputed" && (
        <p role="status" className="mt-4 rounded-lg border border-red-700 bg-red-900/30 p-3 text-sm text-red-200">
          This result is disputed. An admin decision is pending, and winnings stay locked until it is final.
        </p>
      )}
    </section>
  );
}
