import { describe, it, expect } from "vitest";
import { NETWORK, getNetworkPassphrase, isNetworkMismatch } from "./stellar";

describe("network normalization", () => {
  it("exposes a single NETWORK constant", () => {
    expect(typeof NETWORK).toBe("string");
    expect(NETWORK.length).toBeGreaterThan(0);
  });

  it("compares network names case-insensitively", () => {
    expect(isNetworkMismatch("TESTNET")).toBe(false);
    expect(isNetworkMismatch("testnet")).toBe(false);
    expect(isNetworkMismatch("TestNet")).toBe(false);
  });

  it("flags a genuine mismatch", () => {
    expect(isNetworkMismatch("PUBLIC")).toBe(true);
    expect(isNetworkMismatch("futurenet")).toBe(true);
  });

  it("treats a missing wallet network as no mismatch", () => {
    expect(isNetworkMismatch(undefined)).toBe(false);
    expect(isNetworkMismatch(null)).toBe(false);
    expect(isNetworkMismatch("")).toBe(false);
  });

  it("derives the passphrase from the network name when not set", () => {
    expect(getNetworkPassphrase("testnet")).toBe(
      "Test SDF Network ; September 2015"
    );
    expect(getNetworkPassphrase("TESTNET")).toBe(
      "Test SDF Network ; September 2015"
    );
    expect(getNetworkPassphrase("public")).toBe(
      "Public Global Stellar Network ; September 2015"
    );
  });
});
