import { Keypair, scValToNative } from "@stellar/stellar-sdk";
import { address, bytes, i128, str, sym, u32, u64 } from "../../lib/stellar";

describe("typed ScVal helpers", () => {
  it("i128 keeps amounts above Number.MAX_SAFE_INTEGER exact", async () => {
    const amount = BigInt(Number.MAX_SAFE_INTEGER) * 1000n + 7n;

    expect(scValToNative(await i128(amount))).toBe(amount);
  });

  it("i128 keeps the largest signed 128-bit value exact", async () => {
    const max = 2n ** 127n - 1n;

    expect(scValToNative(await i128(max))).toBe(max);
  });

  it("u64 round-trips a bigint", async () => {
    expect(scValToNative(await u64(1_700_000_000n))).toBe(1_700_000_000n);
  });

  it("u32 round-trips a number", async () => {
    expect(scValToNative(await u32(42))).toBe(42);
  });

  it("address encodes a strkey account", async () => {
    const account = Keypair.random().publicKey();

    expect(scValToNative(await address(account))).toBe(account);
  });

  it("bytes encodes a hex string", async () => {
    expect(Buffer.from(scValToNative(await bytes("0aff")))).toEqual(Buffer.from([0x0a, 0xff]));
  });

  it("bytes rejects odd-length or non-hex input", async () => {
    await expect(bytes("abc")).rejects.toThrow(TypeError);
    await expect(bytes("zz")).rejects.toThrow(TypeError);
  });

  it("sym and str keep the text they were given", async () => {
    expect(scValToNative(await sym("FighterA"))).toBe("FighterA");
    expect(scValToNative(await str("20-0"))).toBe("20-0");
  });

  it("a numeric string is never coerced into a number", async () => {
    expect(scValToNative(await str("12345678901234567890"))).toBe("12345678901234567890");
  });
});
