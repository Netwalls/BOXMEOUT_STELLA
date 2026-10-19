jest.mock("@/lib/config", () => ({ API_BASE_URL: "http://api.test" }));

import { renderHook, act, waitFor } from "@testing-library/react";
import { useCreateMarket } from "@/hooks/useCreateMarket";
import type { CreateMarketFormData } from "@/components/CreateMarketForm";
import * as stellar from "@/lib/stellar";
import { useWallet } from "@/hooks/useWallet";
import { createMarketMeta, fetchMarketById, ApiError } from "@/lib/api";

jest.mock("@/lib/stellar");
jest.mock("@/hooks/useWallet");
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  createMarketMeta: jest.fn(),
  fetchMarketById: jest.fn(),
}));

const FORM_DATA: CreateMarketFormData = {
  fighterAName: "Ali",
  fighterARecord: "20-0",
  fighterANationality: "USA",
  fighterAWeightClass: "HW",
  fighterBName: "Foreman",
  fighterBRecord: "18-2",
  fighterBNationality: "USA",
  fighterBWeightClass: "HW",
  scheduledAt: "2026-07-01T20:00:00Z",
  bettingEndsAt: "2026-07-01T19:00:00Z",
  oracleAddress: "GORACLE",
};

beforeEach(() => {
  jest.clearAllMocks();
  (useWallet as jest.Mock).mockReturnValue({
    address: "GUSER123",
    signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
  });
  (stellar.buildSorobanInvocation as jest.Mock).mockResolvedValue("unsigned-xdr");
  (stellar.submitTransaction as jest.Mock).mockResolvedValue({
    txHash: "hash123",
    ledger: 100,
    returnValue: { type: "Bytes", value: "mkt-new-hex" },
  });
  (stellar.decodeScVal as jest.Mock).mockReturnValue("mkt-new-hex");
  (createMarketMeta as jest.Mock).mockResolvedValue({ success: true });
  (fetchMarketById as jest.Mock).mockResolvedValue({ id: "mkt-new-hex" });
});

const indexerNotReady = () => new ApiError(404, "Market not found");

test("happy path: returns new market_id on success", async () => {
  (stellar.buildSorobanInvocation as jest.Mock).mockResolvedValue("unsigned-xdr");
  (stellar.submitTransaction as jest.Mock).mockResolvedValue({
    txHash: "hash123",
    ledger: 100,
    returnValue: { type: "Bytes", value: "mkt-new-hex" },
  });
  (stellar.decodeScVal as jest.Mock).mockReturnValue("mkt-new-hex");

  const { result } = renderHook(() => useCreateMarket());
  let id: string | undefined;

  await act(async () => {
    id = await result.current.createMarket(FORM_DATA);
  });

  expect(id).toBe("mkt-new-hex");
  expect(result.current.error).toBeNull();
  expect(result.current.isLoading).toBe(false);
});

test("error path: sets error on submission failure", async () => {
  const testError = new Error("Submission failed");
  (stellar.buildSorobanInvocation as jest.Mock).mockRejectedValue(testError);

  const { result } = renderHook(() => useCreateMarket());

  await act(async () => {
    await expect(result.current.createMarket(FORM_DATA)).rejects.toThrow("Submission failed");
  });

  expect(result.current.error).toEqual(testError);
  expect(result.current.isLoading).toBe(false);
});

test("edge case: isLoading is true during request, false after completion", async () => {
  let resolve!: (v: unknown) => void;
  (stellar.buildSorobanInvocation as jest.Mock).mockReturnValue(
    new Promise((res) => {
      resolve = res;
    })
  );

  const { result } = renderHook(() => useCreateMarket());

  act(() => {
    result.current.createMarket(FORM_DATA).catch(() => {});
  });

  await waitFor(() => expect(result.current.isLoading).toBe(true));

  await act(async () => {
    (stellar.submitTransaction as jest.Mock).mockResolvedValue({
      txHash: "hash123",
      ledger: 100,
      returnValue: "mkt-123",
    });
    (stellar.decodeScVal as jest.Mock).mockReturnValue("mkt-123");
    resolve("unsigned-xdr");
  });

  await waitFor(() => expect(result.current.isLoading).toBe(false));
});

test("error path: throws when wallet not connected", async () => {
  (useWallet as jest.Mock).mockReturnValue({
    address: null,
    signTransaction: jest.fn(),
  });

  const { result } = renderHook(() => useCreateMarket());

  await act(async () => {
    await expect(result.current.createMarket(FORM_DATA)).rejects.toThrow("Wallet not connected");
  });
});

test("error path: throws when wallet network is mismatched", async () => {
  (useWallet as jest.Mock).mockReturnValue({
    address: "GUSER123",
    isNetworkMismatched: true,
    signTransaction: jest.fn(),
  });

  const { result } = renderHook(() => useCreateMarket());

  await act(async () => {
    await expect(result.current.createMarket(FORM_DATA)).rejects.toThrow(
      "Wallet is connected to the wrong network"
    );
  });

  expect(stellar.buildSorobanInvocation).not.toHaveBeenCalled();
});

// ─── reconciliation with the backend (#1432) ────────────────────────────────

test("reconcile: submits tx hash and fighter metadata before resolving", async () => {
  const { result } = renderHook(() => useCreateMarket());

  let id: string | undefined;
  await act(async () => {
    id = await result.current.createMarket(FORM_DATA);
  });

  expect(id).toBe("mkt-new-hex");
  expect(createMarketMeta).toHaveBeenCalledWith(
    expect.objectContaining({
      txHash: "hash123",
      fighterAName: "Ali",
      fighterBRecord: "18-2",
      oracleAddress: "GORACLE",
    }),
  );
  expect(fetchMarketById).toHaveBeenCalledWith("mkt-new-hex");
});

test("reconcile: retries metadata submission with backoff before succeeding", async () => {
  jest.useFakeTimers();
  try {
    (createMarketMeta as jest.Mock)
      .mockRejectedValueOnce(new ApiError(500, "down"))
      .mockRejectedValueOnce(new ApiError(500, "down"))
      .mockResolvedValue({ success: true });

    const { result } = renderHook(() => useCreateMarket());
    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current.createMarket(FORM_DATA);
      await jest.runAllTimersAsync();
    });

    await expect(pending).resolves.toBe("mkt-new-hex");
    expect(createMarketMeta).toHaveBeenCalledTimes(3);
  } finally {
    jest.useRealTimers();
  }
});

test("reconcile: waits for the indexer, flagging the wait, then resolves", async () => {
  jest.useFakeTimers();
  try {
    (fetchMarketById as jest.Mock)
      .mockRejectedValueOnce(indexerNotReady())
      .mockRejectedValueOnce(indexerNotReady())
      .mockResolvedValue({ id: "mkt-new-hex" });

    const { result } = renderHook(() => useCreateMarket());
    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current.createMarket(FORM_DATA);
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isWaitingForIndexer).toBe(true);

    await act(async () => {
      await jest.runAllTimersAsync();
    });
    await expect(pending).resolves.toBe("mkt-new-hex");
    expect(fetchMarketById).toHaveBeenCalledTimes(3);
    expect(result.current.isWaitingForIndexer).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

test("reconcile failure: surfaces an error when metadata never saves", async () => {
  jest.useFakeTimers();
  try {
    (createMarketMeta as jest.Mock).mockRejectedValue(new ApiError(500, "down"));

    const { result } = renderHook(() => useCreateMarket());
    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current.createMarket(FORM_DATA).catch((e: unknown) => e as Error);
      await jest.runAllTimersAsync();
    });

    await expect(pending).resolves.toMatchObject({ message: "down" });
    expect(createMarketMeta).toHaveBeenCalledTimes(3);
    expect(fetchMarketById).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test("reconcile failure: rejects and sets error when the indexer never publishes the market", async () => {
  jest.useFakeTimers();
  try {
    (fetchMarketById as jest.Mock).mockRejectedValue(indexerNotReady());

    const { result } = renderHook(() => useCreateMarket());
    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current.createMarket(FORM_DATA).catch((e: unknown) => e as Error);
      await jest.runAllTimersAsync();
    });

    await expect(pending).resolves.toMatchObject({ status: 404 });
    expect(fetchMarketById).toHaveBeenCalledTimes(10);
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.isWaitingForIndexer).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

