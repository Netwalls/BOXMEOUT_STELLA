import { formatXlm, formatDateTime, formatRelative } from "./format";

describe("formatXlm (F-108)", () => {
  it("formats whole and fractional XLM with grouping and seven decimals trimmed to two", () => {
    expect(formatXlm(1234.5, "en-US")).toBe("1,234.50 XLM");
    expect(formatXlm("0.1", "en-US")).toBe("0.10 XLM");
  });

  it("uses the requested locale separators", () => {
    expect(formatXlm(1234.5, "de-DE")).toBe("1.234,50 XLM");
  });
});

describe("formatDateTime (F-108)", () => {
  const iso = "2026-07-09T20:00:00Z";

  it("renders the instant in the given zone with a zone label", () => {
    const text = formatDateTime(iso, { locale: "en-US", timeZone: "America/New_York" });

    expect(text).toContain("4:00 PM");
    expect(text).toMatch(/EDT|GMT-4/);
  });

  it("renders the same instant in UTC with a UTC label", () => {
    const text = formatDateTime(iso, { locale: "en-US", timeZone: "UTC" });

    expect(text).toContain("8:00 PM");
    expect(text).toMatch(/UTC|GMT/);
  });
});

describe("formatRelative (F-108)", () => {
  const now = new Date("2026-07-09T12:00:00Z");

  it("describes a future betting close in hours", () => {
    expect(formatRelative("2026-07-09T20:00:00Z", { now, locale: "en-US" })).toBe("in 8 hours");
  });

  it("describes a past close in minutes", () => {
    expect(formatRelative("2026-07-09T11:30:00Z", { now, locale: "en-US" })).toBe("30 minutes ago");
  });
});
