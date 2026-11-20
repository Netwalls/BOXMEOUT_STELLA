"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import type { DependencyCheck } from "@/lib/api";
import { deriveOverallState, probeStatus, STATUS_POLL_INTERVAL_MS } from "@/lib/status";
import type { OverallState, StatusSnapshot } from "@/lib/status";
import { useVisibilityInterval } from "@/hooks/useVisibilityInterval";
import {
  API_BASE_URL,
  MARKET_CONTRACT_ID,
  MARKET_FACTORY_CONTRACT_ID,
  SOROBAN_RPC_URL,
  STELLAR_NETWORK,
} from "@/lib/config";

const STATE_COPY: Record<OverallState, { label: string; Icon: typeof CheckCircle2; className: string }> = {
  loading: { label: "Checking status", Icon: Loader2, className: "text-gray-300" },
  healthy: { label: "All systems operational", Icon: CheckCircle2, className: "text-green-400" },
  degraded: { label: "Degraded: some dependencies are failing", Icon: AlertTriangle, className: "text-yellow-400" },
  unreachable: { label: "Unreachable: the API did not respond", Icon: XCircle, className: "text-red-400" },
};

function CheckRow({ name, check }: { name: string; check: DependencyCheck }) {
  const ok = check.status === "ok";
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <li className="flex items-start justify-between gap-3 py-2 border-b border-gray-700 last:border-0">
      <span className="capitalize text-gray-200">{name}</span>
      <span className={`flex items-center gap-1 text-sm ${ok ? "text-green-400" : "text-red-400"}`}>
        <Icon aria-hidden="true" className="h-4 w-4" />
        <span>{ok ? "OK" : "Failing"}</span>
        {check.error && <span className="sr-only">: {check.error}</span>}
      </span>
    </li>
  );
}

export default function StatusPage() {
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);

  const refresh = useCallback(() => {
    probeStatus().then(setSnapshot);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useVisibilityInterval(refresh, STATUS_POLL_INTERVAL_MS);

  const state = deriveOverallState(snapshot);
  const { label, Icon, className } = STATE_COPY[state];
  const checks = snapshot?.readiness?.checks ?? {};
  const checkNames = Object.keys(checks);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-white">System status</h1>

      <section aria-labelledby="overall-heading" className="bg-gray-800 rounded-xl p-4">
        <h2 id="overall-heading" className="sr-only">Overall status</h2>
        {/* The visible label doubles as the polite live region, so state changes are announced. */}
        <p role="status" aria-live="polite" className={`flex items-center gap-2 text-lg font-semibold ${className}`}>
          <Icon aria-hidden="true" className={`h-5 w-5 ${state === "loading" ? "animate-spin" : ""}`} />
          <span>{label}</span>
        </p>
      </section>

      <section aria-labelledby="api-heading" className="bg-gray-800 rounded-xl p-4">
        <h2 id="api-heading" className="text-base font-semibold text-white mb-2">API and dependencies</h2>
        {snapshot === null && <p className="text-sm text-gray-400">Waiting for the first check…</p>}
        {snapshot !== null && !snapshot.apiReachable && (
          <p className="text-sm text-red-400">The API health endpoint did not respond.</p>
        )}
        {snapshot !== null && snapshot.apiReachable && snapshot.readiness === null && (
          <p className="text-sm text-yellow-400">
            The API is reachable but the readiness check failed
            {snapshot.readinessError ? `: ${snapshot.readinessError}` : "."}
          </p>
        )}
        {checkNames.length > 0 && (
          <ul className="mt-2">
            {checkNames.map((name) => (
              <CheckRow key={name} name={name} check={checks[name]} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="config-heading" className="bg-gray-800 rounded-xl p-4">
        <h2 id="config-heading" className="text-base font-semibold text-white mb-2">Configuration</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-400">Network</dt>
          <dd className="text-gray-200 break-all">{STELLAR_NETWORK}</dd>
          <dt className="text-gray-400">API base URL</dt>
          <dd className="text-gray-200 break-all">{API_BASE_URL}</dd>
          <dt className="text-gray-400">Soroban RPC</dt>
          <dd className="text-gray-200 break-all">{SOROBAN_RPC_URL}</dd>
          <dt className="text-gray-400">Market factory contract</dt>
          <dd className="text-gray-200 break-all">{MARKET_FACTORY_CONTRACT_ID ?? "Not configured"}</dd>
          <dt className="text-gray-400">Market contract</dt>
          <dd className="text-gray-200 break-all">{MARKET_CONTRACT_ID ?? "Not configured"}</dd>
        </dl>
      </section>
    </main>
  );
}
