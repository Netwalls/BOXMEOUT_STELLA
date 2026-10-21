import { InvalidAmountError, stroopsToXlm, xlmToStroops } from "../../lib/stellar";

const MAX_I128 = 2n ** 127n - 1n;

describe("stroopsToXlm", () => {
  it("renders 0 stroops as 0", () => {
    expect(stroopsToXlm(0n)).toBe("0");
  });

  it("renders a single stroop exactly", () => {
    expect(stroopsToXlm(1n)).toBe("0.0000001");
  });

  it("renders the largest i128 value without float error", () => {
    expect(stroopsToXlm(MAX_I128)).toBe("17014118346046923173168730371588.4105727");
  });

  it("drops trailing zeros in the fraction", () => {
    expect(stroopsToXlm(15_000_000n)).toBe("1.5");
    expect(stroopsToXlm(10_000_000n)).toBe("1");
  });

  it("renders negative amounts with a sign", () => {
    expect(stroopsToXlm(-15_000_000n)).toBe("-1.5");
  });
});

describe("xlmToStroops", () => {
  it("converts 0 to 0", () => {
    expect(xlmToStroops("0")).toBe(0n);
  });

  it("converts one stroop", () => {
    expect(xlmToStroops("0.0000001")).toBe(1n);
  });

  it("accepts trailing zeros beyond 7 decimals", () => {
    expect(xlmToStroops("1.00000000")).toBe(10_000_000n);
    expect(xlmToStroops("2.5000000000")).toBe(25_000_000n);
  });

  it("converts the largest i128 value exactly", () => {
    expect(xlmToStroops("17014118346046923173168730371588.4105727")).toBe(MAX_I128);
  });

  it("round-trips through stroopsToXlm", () => {
    expect(xlmToStroops(stroopsToXlm(123_456_789n))).toBe(123_456_789n);
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["-1", "negative"],
    ["-0.5", "negative"],
    ["abc", "non-numeric"],
    ["1e3", "non-numeric"],
    ["1,5", "non-numeric"],
    ["0.00000001", "over-precision"],
    ["17014118346046923173168730371588.4105728", "out-of-range"],
  ])("rejects %j with reason %s", (input, reason) => {
    try {
      xlmToStroops(input);
      throw new Error("expected xlmToStroops to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAmountError);
      expect((error as InvalidAmountError).reason).toBe(reason);
    }
  });
});
