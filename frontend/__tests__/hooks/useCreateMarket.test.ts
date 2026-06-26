import { renderHook, act, waitFor } from "@testing-library/react";
import { useCreateMarket } from "@/hooks/useCreateMarket";
import type { CreateMarketFormData } from "@/components/CreateMarketForm";
import * as stellar from "@/lib/stellar";
import { useWallet } from "@/hooks/useWallet";

jest.mock("@/lib/stellar");
jest.mock("@/hooks/useWallet");

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
});

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
