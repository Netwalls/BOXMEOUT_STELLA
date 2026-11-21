// B-142 (#1578): fighter normalisation helpers.
// Written only; not executed as part of this change.

import { fighterSlug, toFighterInput } from "../market.service";

describe("fighterSlug", () => {
  it("lowercases and collapses non-alphanumerics to single dashes", () => {
    expect(fighterSlug("  Floyd  'Money' Mayweather Jr. ")).toBe("floyd-money-mayweather-jr");
  });

  it("returns an empty string when nothing alphanumeric remains", () => {
    expect(fighterSlug(" ' ' ")).toBe("");
  });
});

describe("toFighterInput", () => {
  it("reads weightClass from the current key", () => {
    expect(toFighterInput({ name: "A", weightClass: "Welter", record: "20-0" })).toEqual({
      name: "A",
      record: "20-0",
      nationality: "",
      weightClass: "Welter",
    });
  });

  it("falls back to the legacy weight key", () => {
    expect(toFighterInput({ name: "A", weight: "Middle" }).weightClass).toBe("Middle");
  });

  it("throws when name or weight class is missing", () => {
    expect(() => toFighterInput({ name: "A" })).toThrow("fighter requires a name and a weight class");
    expect(() => toFighterInput({ weightClass: "Welter" })).toThrow();
  });
});
