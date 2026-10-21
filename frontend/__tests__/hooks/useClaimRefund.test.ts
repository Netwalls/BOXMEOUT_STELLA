import { renderHook, act, waitFor } from "@testing-library/react";
import { useClaimRefund } from "@/hooks/useClaimRefund";
import * as api from "@/lib/api";
import * as stellar from "@/lib/stellar";
import * as walletHook from "@/hooks/useWallet";

jest.mock("@/lib/api");
jest.mock("@/lib/stellar");
jest.mock("@/hooks/useWallet");

describe("useClaimRefund", () => {
  const mockAddress = "GBOXMEOUT1234567890STEL";
  const mockSignTransaction = jest.fn();
  const mockFetchMarketById = api.fetchMarketById as jest.Mock;
  const mockFetchMarketBets = api.fetchMarketBets as jest.Mock;
  const mockBuildSorobanInvocation = stellar.buildSorobanInvocation as jest.Mock;
  const mockSubmitTransaction = stellar.submitTransaction as jest.Mock;
  const mockDecodeScVal = stellar.decodeScVal as jest.Mock;
  const mockUseWallet = walletHook.useWallet as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWallet.mockReturnValue({
      address: mockAddress,
      signTransaction: mockSignTransaction,
      isNetworkMismatched: false,
    });
    mockFetchMarketById.mockResolvedValue({
      id: "market-1",
      status: "Cancelled",
      outcome: null,
    });
    mockFetchMarketBets.mockResolvedValue([
      { id: "bet-1", marketId: "market-1", amount: 100n },
    ]);
    mockBuildSorobanInvocation.mockResolvedValue("unsigned-xdr");
    mockSignTransaction.mockResolvedValue("signed-xdr");
    mockSubmitTransaction.mockResolvedValue({
      status: "SUCCESS",
      returnValue: "raw-scval",
    });
    mockDecodeScVal.mockResolvedValue(100n);
  });

  it("throws when wallet is not connected", async () => {
    mockUseWallet.mockReturnValue({
      address: null,
      signTransaction: mockSignTransaction,
      isNetworkMismatched: false,
    });
    const { result } = renderHook(() => useClaimRefund());

    await act(async () => {
      await expect(result.current.claimRefund("bet-1", "market-1")).rejects.toThrow(
        "Wallet not connected"
      );
    });
  });

  it("throws when network is mismatched", async () => {
    mockUseWallet.mockReturnValue({
      address: mockAddress,
      signTransaction: mockSignTransaction,
      isNetworkMismatched: true,
    });
    const { result } = renderHook(() => useClaimRefund());

    await act(async () => {
      await expect(result.current.claimRefund("bet-1", "market-1")).rejects.toThrow(
        "Wallet is connected to the wrong network"
      );
    });
  });

  it("throws when bet is not found", async () => {
    mockFetchMarketBets.mockResolvedValue([]);
    const { result } = renderHook(() => useClaimRefund());

    await act(async () => {
      await expect(result.current.claimRefund("nonexistent-bet", "market-1")).rejects.toThrow(
        "Bet not found"
      );
    });
  });

  it("throws when market is not in a refundable state", async () => {
    mockFetchMarketById.mockResolvedValue({
      id: "market-1",
      status: "Open",
      outcome: null,
    });
    const { result } = renderHook(() => useClaimRefund());

    await act(async () => {
      await expect(result.current.claimRefund("bet-1", "market-1")).rejects.toThrow(
        "Market is not in a refundable state"
      );
    });
  });

  it("successfully claims refund for Cancelled market", async () => {
    const { result } = renderHook(() => useClaimRefund());

    let receipt: any;
    await act(async () => {
      receipt = await result.current.claimRefund("bet-1", "market-1");
    });

    expect(receipt).toBeDefined();
    expect(receipt.betId).toBe("bet-1");
    expect(receipt.bettor).toBe(mockAddress);
    expect(receipt.payout).toBe(100n);
    expect(result.current.error).toBeNull();
    expect(mockBuildSorobanInvocation).toHaveBeenCalledWith({
      contractId: "market-1",
      method: "claim_refund",
      args: ["bet-1"],
      signerAddress: mockAddress,
    });
    expect(mockSignTransaction).toHaveBeenCalledWith("unsigned-xdr");
    expect(mockSubmitTransaction).toHaveBeenCalledWith("signed-xdr");
    expect(mockDecodeScVal).toHaveBeenCalledWith("raw-scval");
  });

  it("successfully claims refund for NoContest outcome market", async () => {
    mockFetchMarketById.mockResolvedValue({
      id: "market-1",
      status: "Resolved",
      outcome: "NoContest",
    });
    const { result } = renderHook(() => useClaimRefund());

    let receipt: any;
    await act(async () => {
      receipt = await result.current.claimRefund("bet-1", "market-1");
    });

    expect(receipt.payout).toBe(100n);
    expect(result.current.error).toBeNull();
  });

  it("handles contract execution errors, updates error state, and rethrows", async () => {
    mockSubmitTransaction.mockRejectedValue(new Error("HostError: Error(Contract, #102)"));
    const { result } = renderHook(() => useClaimRefund());

    await act(async () => {
      await expect(result.current.claimRefund("bet-1", "market-1")).rejects.toThrow(
        "HostError: Error(Contract, #102)"
      );
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toContain("HostError");
    expect(result.current.isLoading).toBe(false);
  });
});
