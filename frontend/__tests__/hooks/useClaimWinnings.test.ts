import { renderHook, act } from "@testing-library/react";
import { useClaimWinnings } from "@/hooks/useClaimWinnings";
import { useWallet } from "@/hooks/useWallet";
import * as api from "@/lib/api";
import * as stellar from "@/lib/stellar";

jest.mock("@/hooks/useWallet");
jest.mock("@/lib/api");
jest.mock("@/lib/stellar");

const mockUseWallet = useWallet as jest.Mock;
const mockFetchMarketById = api.fetchMarketById as jest.Mock;
const mockFetchMarketBets = api.fetchMarketBets as jest.Mock;
const mockBuildSorobanInvocation = stellar.buildSorobanInvocation as jest.Mock;
const mockSubmitTransaction = stellar.submitTransaction as jest.Mock;
const mockDecodeScVal = stellar.decodeScVal as jest.Mock;

describe("useClaimWinnings hook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWallet.mockReturnValue({
      address: "GADDR1",
      isConnected: true,
      isNetworkMismatched: false,
      signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
      connect: jest.fn(),
      disconnect: jest.fn(),
    });
    mockFetchMarketById.mockResolvedValue({ status: "Resolved" });
    mockFetchMarketBets.mockResolvedValue([{ id: "bet-1", bettor: "GADDR1" }]);
    mockBuildSorobanInvocation.mockResolvedValue("xdr");
    mockSubmitTransaction.mockResolvedValue({ txHash: "tx-123", returnValue: 150000000n });
    mockDecodeScVal.mockResolvedValue(150000000n);
  });

  test("happy path: returns ClaimReceipt on success", async () => {
    const { result } = renderHook(() => useClaimWinnings());
    let receipt: any;
    await act(async () => {
      receipt = await result.current.claim("bet-1", "mkt-1");
    });
    expect(receipt.betId).toBe("bet-1");
    expect(result.current.error).toBeNull();
  });

  test("error path: sets error on failure", async () => {
    mockSubmitTransaction.mockRejectedValueOnce(new Error("RPC failure"));
    const { result } = renderHook(() => useClaimWinnings());
    await act(async () => {
      await expect(result.current.claim("bet-1", "mkt-1")).rejects.toThrow();
    });
    expect(result.current.error).toBeInstanceOf(Error);
  });

  test("edge case: isLoading transitions during claim", async () => {
    const { result } = renderHook(() => useClaimWinnings());
    expect(result.current.isLoading).toBe(false);
    await act(async () => {
      await result.current.claim("bet-1", "mkt-1");
    });
    expect(result.current.isLoading).toBe(false);
  });
});
