/**
 * #1553 — StrKey validation after moving off the SDK's removed StrKey helpers.
 */
import { Address } from "@stellar/stellar-sdk";
import { isValidContractAddress, isValidStellarPublicKey } from "@/lib/strkey";

const CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const ACCOUNT = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

/** Flips the final character so the CRC no longer matches. */
const withBadChecksum = (key: string) => key.slice(0, -1) + (key.endsWith("A") ? "B" : "A");

describe("isValidContractAddress", () => {
  it("accepts a well-formed C... contract address", () => {
    expect(isValidContractAddress(CONTRACT)).toBe(true);
  });

  it("agrees with the SDK's own parser for the same input", () => {
    expect(() => Address.fromString(CONTRACT)).not.toThrow();
  });

  it("rejects an account address", () => {
    expect(isValidContractAddress(ACCOUNT)).toBe(false);
  });

  it("rejects a contract address with a bad checksum", () => {
    expect(isValidContractAddress(withBadChecksum(CONTRACT))).toBe(false);
  });

  it("rejects placeholders and wrong lengths", () => {
    expect(isValidContractAddress("CONTRACT")).toBe(false);
    expect(isValidContractAddress(CONTRACT.slice(0, -1))).toBe(false);
  });
});

describe("isValidStellarPublicKey", () => {
  it("accepts a well-formed G... account address", () => {
    expect(isValidStellarPublicKey(ACCOUNT)).toBe(true);
  });

  it("rejects a contract address", () => {
    expect(isValidStellarPublicKey(CONTRACT)).toBe(false);
  });

  it("rejects an account address with a bad checksum", () => {
    expect(isValidStellarPublicKey(withBadChecksum(ACCOUNT))).toBe(false);
  });
});
