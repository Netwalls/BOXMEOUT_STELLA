import {
  evaluateAudit,
  parseAdvisories,
  parseDate,
  validateAllowlist,
  type Allowlist,
} from "../scripts/audit-gate";

const HIGH_ID = "GHSA-aaaa-bbbb-cccc";
const CRIT_ID = "GHSA-dddd-eeee-ffff";
const MOD_ID = "GHSA-gggg-hhhh-iiii";

function audit(entries: Array<{ pkg: string; id: string; severity: string }>) {
  const vulnerabilities: Record<string, { severity: string; via: unknown[] }> = {};
  for (const e of entries) {
    vulnerabilities[e.pkg] = {
      severity: e.severity,
      via: [
        {
          url: `https://github.com/advisories/${e.id}`,
          name: e.pkg,
          severity: e.severity,
          title: `${e.pkg} advisory`,
          range: "<1.0.0",
        },
      ],
    };
  }
  return { vulnerabilities } as never;
}

const TODAY = new Date("2026-11-19T00:00:00Z");
const entry = (id: string, expires = "2026-12-19") => ({
  id,
  package: "pkg",
  reason: "accepted for test",
  expires,
});
const list = (...entries: ReturnType<typeof entry>[]): Allowlist => ({ version: 1, entries });

describe("parseAdvisories", () => {
  it("returns one advisory per GHSA id and skips string pointers", () => {
    const data = {
      vulnerabilities: {
        a: { severity: "high", via: ["b", { url: `https://github.com/advisories/${HIGH_ID}`, name: "a", severity: "high" }] },
        b: { severity: "high", via: [{ url: `https://github.com/advisories/${HIGH_ID}`, name: "b", severity: "high" }] },
      },
    } as never;
    const found = parseAdvisories(data);
    expect(found.map((f) => f.id)).toEqual([HIGH_ID]);
  });
});

describe("evaluateAudit", () => {
  it("passes when every high advisory is allowlisted and unexpired", () => {
    const result = evaluateAudit(audit([{ pkg: "a", id: HIGH_ID, severity: "high" }]), list(entry(HIGH_ID)), TODAY);
    expect(result.passed).toBe(true);
    expect(result.allowlisted).toHaveLength(1);
    expect(result.blocking).toHaveLength(0);
  });

  it("blocks a high advisory that is not allowlisted", () => {
    const result = evaluateAudit(audit([{ pkg: "a", id: HIGH_ID, severity: "high" }]), list(), TODAY);
    expect(result.passed).toBe(false);
    expect(result.blocking.map((a) => a.id)).toEqual([HIGH_ID]);
  });

  it("treats critical as at or above high", () => {
    const result = evaluateAudit(audit([{ pkg: "a", id: CRIT_ID, severity: "critical" }]), list(), TODAY);
    expect(result.passed).toBe(false);
  });

  it("ignores moderate advisories at the default high threshold", () => {
    const result = evaluateAudit(audit([{ pkg: "a", id: MOD_ID, severity: "moderate" }]), list(), TODAY);
    expect(result.passed).toBe(true);
    expect(result.advisories).toHaveLength(1);
  });

  it("gates moderate advisories when the threshold is lowered", () => {
    const result = evaluateAudit(audit([{ pkg: "a", id: MOD_ID, severity: "moderate" }]), list(), TODAY, "moderate");
    expect(result.passed).toBe(false);
  });

  it("fails on an expired allowlist entry even when the advisory still exists", () => {
    const result = evaluateAudit(
      audit([{ pkg: "a", id: HIGH_ID, severity: "high" }]),
      list(entry(HIGH_ID, "2026-11-18")),
      TODAY
    );
    expect(result.expired.map((e) => e.id)).toEqual([HIGH_ID]);
    expect(result.passed).toBe(false);
  });

  it("accepts an entry that expires today (expiry is inclusive)", () => {
    const result = evaluateAudit(
      audit([{ pkg: "a", id: HIGH_ID, severity: "high" }]),
      list(entry(HIGH_ID, "2026-11-19")),
      TODAY
    );
    expect(result.passed).toBe(true);
  });

  it("reports stale entries without failing the run", () => {
    const result = evaluateAudit(audit([]), list(entry(HIGH_ID)), TODAY);
    expect(result.stale.map((e) => e.id)).toEqual([HIGH_ID]);
    expect(result.passed).toBe(true);
  });
});

describe("validateAllowlist", () => {
  const valid = { version: 1, entries: [entry(HIGH_ID)] };

  it("accepts a well-formed allowlist", () => {
    expect(validateAllowlist(valid)).toEqual(valid);
  });

  it("rejects an entry with no reason", () => {
    expect(() => validateAllowlist({ version: 1, entries: [{ ...entry(HIGH_ID), reason: " " }] })).toThrow(/reason/);
  });

  it("rejects an entry with no expiry", () => {
    const { expires: _omit, ...noExpiry } = entry(HIGH_ID);
    expect(() => validateAllowlist({ version: 1, entries: [noExpiry] })).toThrow(/YYYY-MM-DD/);
  });

  it("rejects a date that is not a real calendar day", () => {
    expect(() => validateAllowlist({ version: 1, entries: [entry(HIGH_ID, "2026-02-30")] })).toThrow(/calendar/);
  });

  it("rejects an id that is not a GHSA id", () => {
    expect(() => validateAllowlist({ version: 1, entries: [entry("CVE-2026-1")] })).toThrow(/GHSA/);
  });

  it("rejects an unknown schema version", () => {
    expect(() => validateAllowlist({ version: 2, entries: [] })).toThrow(/version/);
  });
});

describe("parseDate", () => {
  it("parses a valid YYYY-MM-DD as UTC midnight", () => {
    expect(parseDate("2026-12-19").toISOString()).toBe("2026-12-19T00:00:00.000Z");
  });
});
