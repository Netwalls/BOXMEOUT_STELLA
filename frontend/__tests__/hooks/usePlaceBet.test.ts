import { renderHook, act, waitFor } from "@testing-library/react";
import { usePlaceBet } from "@/hooks/usePlaceBet";
import { useWallet } from "@/hooks/useWallet";
import * as stellar from "@/lib/stellar";

jest.mock("@/hooks/useWallet");
jest.mock("@/lib/stellar");

const mockUseWallet = useWallet as jest.Mock;
const mockBuildSorobanInvocation = stellar.buildSorobanInvocation as jest.Mock;
const mockSubmitTransaction = stellar.submitTransaction as jest.Mock;

describe("usePlaceBet hook", () => {
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
    mockBuildSorobanInvocation.mockResolvedValue("xdr");
    mockSubmitTransaction.mockResolvedValue({ txHash: "tx-123" });
  });

  test("happy path: returns confirmed Bet on success", async () => {
    const { result } = renderHook(() => usePlaceBet("mkt-1"));
    let bet: any;
    await act(async () => {
      bet = await result.current.placeBet("FighterA", BigInt(100_000_000));
    });
    expect(bet.id).toBe("tx-123");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("error path: sets error state on failure", async () => {
    mockSubmitTransaction.mockRejectedValueOnce(new Error("Simulation failed"));
    const { result } = renderHook(() => usePlaceBet("mkt-1"));
    await act(async () => {
      await expect(result.current.placeBet("FighterA", BigInt(100_000_000))).rejects.toThrow();
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.isLoading).toBe(false);
  });

  test("edge case: isLoading transitions during placeBet", async () => {
    let resolveTx!: (val: any) => void;
    mockSubmitTransaction.mockReturnValue(new Promise((res) => { resolveTx = res; }));
    const { result } = renderHook(() => usePlaceBet("mkt-1"));
    act(() => {
      result.current.placeBet("FighterA", BigInt(100_000_000)).catch(() => {});
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    await act(async () => {
      resolveTx({ txHash: "tx-123" });
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});
