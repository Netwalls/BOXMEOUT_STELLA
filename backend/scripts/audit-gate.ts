/* eslint-disable no-console -- CLI script: console output is its interface */
/**
 * Dependency advisory gate (#1586, B-150).
 *
 * Runs `npm audit --omit=dev` and fails when:
 *   - a production advisory at or above the threshold (default: high) is not on
 *     the allowlist, or
 *   - an allowlist entry has expired (its `expires` date is before today).
 *
 * Allowlist entries (backend/audit-allowlist.json) each need a reason and an
 * expiry date. Expired entries fail the gate on purpose, so accepted risk is
 * re-reviewed. Entries that no longer match any advisory are reported as stale
 * but do not fail the run.
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/audit-gate.ts
 *   npx ts-node --transpile-only scripts/audit-gate.ts --level=critical
 */
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";

export type Severity = "info" | "low" | "moderate" | "high" | "critical";

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

export interface AllowlistEntry {
  /** GHSA id, e.g. GHSA-mrhx-c7xc-m3w5 */
  id: string;
  /** Affected package name, for the reviewer's benefit */
  package: string;
  /** Why the risk is accepted. Required, non-empty. */
  reason: string;
  /** Last day the acceptance holds, YYYY-MM-DD (inclusive). */
  expires: string;
}

export interface Allowlist {
  version: 1;
  entries: AllowlistEntry[];
}

export interface Advisory {
  id: string;
  package: string;
  severity: Severity;
  title: string;
  range: string;
}

export interface GateResult {
  threshold: Severity;
  advisories: Advisory[];
  blocking: Advisory[];
  allowlisted: Advisory[];
  expired: AllowlistEntry[];
  stale: AllowlistEntry[];
  passed: boolean;
}

/** Shape of the subset of `npm audit --json` output this gate reads. */
interface NpmAuditJson {
  vulnerabilities: Record<
    string,
    {
      severity: Severity;
      via: Array<string | { url?: string; name?: string; severity?: Severity; title?: string; range?: string }>;
    }
  >;
}

const GHSA_PATTERN = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Collects one Advisory per GHSA id from npm audit output (all severities). */
export function parseAdvisories(audit: NpmAuditJson): Advisory[] {
  const byId = new Map<string, Advisory>();
  for (const [pkg, vuln] of Object.entries(audit.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via === "string") continue; // pointer to another package in the chain
      const match = (via.url ?? "").match(GHSA_PATTERN);
      if (!match || byId.has(match[0])) continue;
      byId.set(match[0], {
        id: match[0],
        package: via.name ?? pkg,
        severity: via.severity ?? vuln.severity,
        title: via.title ?? "",
        range: via.range ?? "",
      });
    }
  }
  return [...byId.values()];
}

/** Parses YYYY-MM-DD as a UTC date at start of day. Throws when invalid. */
export function parseDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`expires must be YYYY-MM-DD, got "${value}"`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`expires is not a real calendar date: "${value}"`);
  }
  return date;
}

/** Validates the allowlist file shape. Throws with a message naming the bad entry. */
export function validateAllowlist(raw: unknown): Allowlist {
  const data = raw as Allowlist;
  if (!data || data.version !== 1 || !Array.isArray(data.entries)) {
    throw new Error('allowlist must be { "version": 1, "entries": [...] }');
  }
  data.entries.forEach((entry, i) => {
    if (!entry || typeof entry.id !== "string" || !GHSA_PATTERN.test(entry.id)) {
      throw new Error(`entries[${i}].id must be a GHSA id`);
    }
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      throw new Error(`entries[${i}] (${entry.id}) needs a non-empty reason`);
    }
    if (typeof entry.package !== "string" || entry.package === "") {
      throw new Error(`entries[${i}] (${entry.id}) needs a package`);
    }
    try {
      parseDate(entry.expires);
    } catch (err) {
      throw new Error(`entries[${i}] (${entry.id}): ${(err as Error).message}`);
    }
  });
  return data;
}

/**
 * Decides pass or fail from audit output and the allowlist.
 * `today` is passed in so the expiry rule is testable.
 */
export function evaluateAudit(
  audit: NpmAuditJson,
  allowlist: Allowlist,
  today: Date,
  threshold: Severity = "high"
): GateResult {
  const advisories = parseAdvisories(audit);
  const minRank = SEVERITY_RANK[threshold];
  const atOrAbove = advisories.filter((a) => SEVERITY_RANK[a.severity] >= minRank);

  const allowed = new Map(allowlist.entries.map((e) => [e.id, e]));
  const allowlisted = atOrAbove.filter((a) => allowed.has(a.id));
  const blocking = atOrAbove.filter((a) => !allowed.has(a.id));

  const expired = allowlist.entries.filter((e) => parseDate(e.expires) < today);
  const seen = new Set(advisories.map((a) => a.id));
  const stale = allowlist.entries.filter((e) => !seen.has(e.id));

  return {
    threshold,
    advisories,
    blocking,
    allowlisted,
    expired,
    stale,
    passed: blocking.length === 0 && expired.length === 0,
  };
}

function runNpmAudit(cwd: string): NpmAuditJson {
  let stdout: string;
  try {
    stdout = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    // npm audit exits non-zero when vulnerabilities exist; the JSON is still on stdout.
    stdout = (err as { stdout?: string }).stdout ?? "";
    if (!stdout) throw err;
  }
  return JSON.parse(stdout) as NpmAuditJson;
}

function main(): void {
  const levelArg = process.argv.find((a) => a.startsWith("--level="));
  const threshold = (levelArg?.split("=")[1] ?? "high") as Severity;
  if (!(threshold in SEVERITY_RANK)) {
    throw new Error(`unknown --level: ${threshold}`);
  }

  const backendDir = path.resolve(__dirname, "..");
  const allowlist = validateAllowlist(
    JSON.parse(readFileSync(path.join(backendDir, "audit-allowlist.json"), "utf8"))
  );
  const audit = runNpmAudit(backendDir);
  const result = evaluateAudit(audit, allowlist, new Date(), threshold);

  const line = (a: Advisory) => `  ${a.id}  ${a.severity.padEnd(8)} ${a.package}  ${a.title}`;
  console.log(`Advisories at or above ${threshold}: ${result.advisories.filter((a) => SEVERITY_RANK[a.severity] >= SEVERITY_RANK[threshold]).length}`);
  if (result.allowlisted.length) {
    console.log("Allowlisted (accepted until expiry):");
    result.allowlisted.forEach((a) => console.log(line(a)));
  }
  if (result.stale.length) {
    console.warn("Stale allowlist entries (no matching advisory; remove them):");
    result.stale.forEach((e) => console.warn(`  ${e.id}  ${e.package}`));
  }
  if (result.expired.length) {
    console.error("Expired allowlist entries (re-review or fix the dependency):");
    result.expired.forEach((e) => console.error(`  ${e.id}  ${e.package}  expired ${e.expires}`));
  }
  if (result.blocking.length) {
    console.error(`Unallowlisted advisories at or above ${threshold}:`);
    result.blocking.forEach((a) => console.error(line(a)));
  }

  if (!result.passed) {
    console.error("Dependency audit gate FAILED.");
    process.exit(1);
  }
  console.log("Dependency audit gate passed.");
}

if (require.main === module) {
  main();
}
