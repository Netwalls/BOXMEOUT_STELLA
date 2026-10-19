import { submitTransaction, TransactionTimeoutError } from "@/lib/stellar";

const mockSendTransaction = jest.fn();
const mockGetTransaction = jest.fn();

jest.mock("@stellar/stellar-sdk", () => ({
  SorobanRpc: {
    Server: jest.fn(() => ({
      sendTransaction: (...args: unknown[]) => mockSendTransaction(...args),
      getTransaction: (...args: unknown[]) => mockGetTransaction(...args),
    })),
  },
  TransactionBuilder: {
    fromXDR: jest.fn(() => ({ hash: () => Buffer.from("ab".repeat(32), "hex") })),
  },
}));

const HASH = "ab".repeat(32);
const SUCCESS = { status: "SUCCESS", ledger: 42, returnValue: "ok" };

describe("submitTransaction", () => {
  beforeEach(() => {
    mockSendTransaction.mockReset();
    mockGetTransaction.mockReset();
    // Run backoff sleeps immediately so the tests stay fast.
    jest.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as typeof setTimeout);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("re-sends the transaction when the RPC answers TRY_AGAIN_LATER", async () => {
    mockSendTransaction
      .mockResolvedValueOnce({ status: "TRY_AGAIN_LATER", hash: HASH })
      .mockResolvedValueOnce({ status: "TRY_AGAIN_LATER", hash: HASH })
      .mockResolvedValueOnce({ status: "PENDING", hash: HASH });
    mockGetTransaction.mockResolvedValueOnce(SUCCESS);

    const result = await submitTransaction("xdr");

    expect(mockSendTransaction).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ txHash: HASH, ledger: 42, returnValue: "ok" });
  });

  it("polls by hash without failing when the RPC answers DUPLICATE", async () => {
    mockSendTransaction.mockResolvedValueOnce({ status: "DUPLICATE", hash: HASH });
    mockGetTransaction.mockResolvedValueOnce(SUCCESS);
    const onStatus = jest.fn();

    const result = await submitTransaction("xdr", onStatus);

    expect(result.txHash).toBe(HASH);
    expect(mockGetTransaction).toHaveBeenCalledTimes(1);
    expect(onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("decodes the result code from errorResult when the RPC answers ERROR", async () => {
    mockSendTransaction.mockResolvedValueOnce({
      status: "ERROR",
      hash: HASH,
      errorResult: { result: () => ({ switch: () => ({ name: "txBAD_SEQ" }) }) },
    });
    const onStatus = jest.fn();

    await expect(submitTransaction("xdr", onStatus)).rejects.toThrow("txBAD_SEQ");
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", txHash: HASH })
    );
    expect(mockGetTransaction).not.toHaveBeenCalled();
  });

  it("tolerates transient getTransaction errors until the transaction confirms", async () => {
    mockSendTransaction.mockResolvedValueOnce({ status: "PENDING", hash: HASH });
    mockGetTransaction
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockRejectedValueOnce(new Error("503 Service Unavailable"))
      .mockResolvedValueOnce(SUCCESS);

    const result = await submitTransaction("xdr");

    expect(mockGetTransaction).toHaveBeenCalledTimes(3);
    expect(result.ledger).toBe(42);
  });

  it("times out instead of aborting when every poll fails", async () => {
    mockSendTransaction.mockResolvedValueOnce({ status: "PENDING", hash: HASH });
    mockGetTransaction.mockRejectedValue(new Error("network down"));

    // Each Date.now() call advances the clock by 10s, so the 30s window closes quickly.
    let now = 0;
    jest.spyOn(Date, "now").mockImplementation(() => (now += 10_000));

    await expect(submitTransaction("xdr")).rejects.toBeInstanceOf(TransactionTimeoutError);
    expect(mockGetTransaction).toHaveBeenCalled();
  });
});
