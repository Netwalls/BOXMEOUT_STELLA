import { fetchApiHealth, fetchReadiness } from "@/lib/api";
import type { ReadinessReport } from "@/lib/api";

/** How often the page re-probes while the tab is visible. */
export const STATUS_POLL_INTERVAL_MS = 30_000;

export type OverallState = "loading" | "healthy" | "degraded" | "unreachable";

export interface StatusSnapshot {
  apiReachable: boolean;
  readiness: ReadinessReport | null;
  readinessError: string | null;
}

/** Maps probe results to a single overall state. Exported for unit tests. */
export function deriveOverallState(snapshot: StatusSnapshot | null): OverallState {
  if (snapshot === null) return "loading";
  if (!snapshot.apiReachable) return "unreachable";
  if (snapshot.readiness === null || snapshot.readiness.status !== "ok") return "degraded";
  return "healthy";
}

/**
 * Runs both probes in parallel. Each probe has its own timeout, so the snapshot
 * always settles even when the API is hung.
 */
export async function probeStatus(): Promise<StatusSnapshot> {
  const [health, ready] = await Promise.allSettled([fetchApiHealth(), fetchReadiness()]);
  const apiReachable = health.status === "fulfilled";
  if (ready.status === "fulfilled") {
    return { apiReachable, readiness: ready.value, readinessError: null };
  }
  const reason = ready.reason instanceof Error ? ready.reason.message : String(ready.reason);
  return { apiReachable, readiness: null, readinessError: reason };
}
