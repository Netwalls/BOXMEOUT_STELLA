import { renderHook, act } from "@testing-library/react";
import { useClaimWinnings } from "@/hooks/useClaimWinnings";
import type { ClaimReceipt } from "@/components/ClaimButton";
import { useWallet } from "@/hooks/useWallet";
import * as stellar from "@/lib/stellar";
import * as api from "@/lib/api";

jest.mock("@/hooks/useWallet");
jest.mock("@/lib/stellar");
jest.mock("@/lib/api");

const mockUseWallet = useWallet as jest.Mock;
const mockBuildSorobanInvocation = stellar.buildSorobanInvocation as jest.Mock;
const mockSubmitTransaction = stellar.submitTransaction as jest.Mock;
const mockDecodeScVal = stellar.decodeScVal as jest.Mock;
const mockFetchMarketById = api.fetchMarketById as jest.Mock;
const mockFetchMarketBets = api.fetchMarketBets as jest.Mock;

describe("useClaimWinnings", () => {
  const mockAddress = "GADDR1234567890ABCDEF";

  const mockMarket = {
    id: "market-1",
    contractAddress: "market-1",
    fighterA: {
      name: "Fighter A",
      record: "10-0",
      nationality: "USA",
      weightClass: "Heavyweight",
    },
    fighterB: {
      name: "Fighter B",
      record: "9-1",
      nationality: "Canada",
      weightClass: "Heavyweight",
    },
    scheduledAt: "2024-01-01T00:00:00Z",
    bettingEndsAt: "2024-01-01T00:00:00Z",
    status: "Resolved" as const,
    outcome: "FighterA" as const,
    poolA: "5000000000",
    poolB: "5000000000",
    totalPool: "10000000000",
    oracleAddress: "GORACLE",
    createdBy: "GCREATOR",
  };

  const mockBet = {
    id: "bet-1",
    marketId: "market-1",
    bettor: mockAddress,
    side: "FighterA" as const,
    amount: "1000000",
    placedAt: "2024-01-01T00:00:00Z",
    claimed: false,
    payout: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWallet.mockReturnValue({
      address: mockAddress,
      isConnected: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
    });
  });

  it("throws error when wallet not connected", async () => {
    mockUseWallet.mockReturnValueOnce({
      address: null,
      isConnected: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signTransaction: jest.fn(),
    });

    const { result } = renderHook(() => useClaimWinnings());

    await expect(
      act(async () => {
        await result.current.claim("bet-1", "market-1");
      })
    ).rejects.toThrow("Wallet not connected");
  });

  it("throws error when wallet network is mismatched", async () => {
    mockUseWallet.mockReturnValueOnce({
      address: mockAddress,
      isConnected: true,
      isNetworkMismatched: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signTransaction: jest.fn(),
    });

    const { result } = renderHook(() => useClaimWinnings());

    await expect(
      act(async () => {
        await result.current.claim("bet-1", "market-1");
      })
    ).rejects.toThrow("Wallet is connected to the wrong network");

    expect(mockFetchMarketById).not.toHaveBeenCalled();
  });

  it("calls claim_winnings for Resolved markets", async () => {
    mockFetchMarketById.mockResolvedValueOnce(mockMarket);
    mockFetchMarketBets.mockResolvedValueOnce([mockBet]);
    mockBuildSorobanInvocation.mockResolvedValueOnce("xdr-string");
    mockSubmitTransaction.mockResolvedValueOnce({
      txHash: "tx-hash-123",
      ledger: 12345,
      returnValue: 1500000n,
    });
    mockDecodeScVal.mockReturnValueOnce(1500000n);

    const { result } = renderHook(() => useClaimWinnings());

    await act(async () => {
      await result.current.claim("bet-1", "market-1");
    });

    expect(mockBuildSorobanInvocation).toHaveBeenCalledWith({
      contractId: "market-1",
      method: "claim_winnings",
      args: ["bet-1"],
      signerAddress: mockAddress,
    });
  });

  it("calls claim_refund for Cancelled markets", async () => {
    const cancelledMarket = { ...mockMarket, status: "Cancelled" as const };
    mockFetchMarketById.mockResolvedValueOnce(cancelledMarket);
    mockFetchMarketBets.mockResolvedValueOnce([mockBet]);
    mockBuildSorobanInvocation.mockResolvedValueOnce("xdr-string");
    mockSubmitTransaction.mockResolvedValueOnce({
      txHash: "tx-hash-123",
      ledger: 12345,
      returnValue: 1000000n,
    });
    mockDecodeScVal.mockReturnValueOnce(1000000n);

    const { result } = renderHook(() => useClaimWinnings());

    await act(async () => {
      await result.current.claim("bet-1", "market-1");
    });

    expect(mockBuildSorobanInvocation).toHaveBeenCalledWith({
      contractId: "market-1",
      method: "claim_refund",
      args: ["bet-1"],
      signerAddress: mockAddress,
    });
  });

  it("throws error for non-claimable market status", async () => {
    const lockedMarket = { ...mockMarket, status: "Locked" as const };
    mockFetchMarketById.mockResolvedValueOnce(lockedMarket);
    mockFetchMarketBets.mockResolvedValueOnce([mockBet]);

    const { result } = renderHook(() => useClaimWinnings());

    await expect(
      act(async () => {
        await result.current.claim("bet-1", "market-1");
      })
    ).rejects.toThrow("Market is not in a claimable state");
  });

  it("throws error if bet not found", async () => {
    mockFetchMarketById.mockResolvedValueOnce(mockMarket);
    mockFetchMarketBets.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useClaimWinnings());

    await expect(
      act(async () => {
        await result.current.claim("bet-1", "market-1");
      })
    ).rejects.toThrow("Bet not found");
  });

  it("signs transaction with wallet", async () => {
    const mockSignTransaction = jest.fn().mockResolvedValueOnce("signed-xdr");
    mockUseWallet.mockReturnValueOnce({
      address: mockAddress,
      isConnected: true,
      connect: jest.fn(),
      disconnect: jest.fn(),
      signTransaction: mockSignTransaction,
    });

    mockFetchMarketById.mockResolvedValueOnce(mockMarket);
    mockFetchMarketBets.mockResolvedValueOnce([mockBet]);
    mockBuildSorobanInvocation.mockResolvedValueOnce("xdr-string");
    mockSubmitTransaction.mockResolvedValueOnce({
      txHash: "tx-hash-123",
      ledger: 12345,
      returnValue: 1500000n,
    });
    mockDecodeScVal.mockReturnValueOnce(1500000n);

    const { result } = renderHook(() => useClaimWinnings());

    await act(async () => {
      await result.current.claim("bet-1", "market-1");
    });

    expect(mockSignTransaction).toHaveBeenCalledWith("xdr-string");
  });

  it("returns ClaimReceipt with payout on success", async () => {
    mockFetchMarketById.mockResolvedValueOnce(mockMarket);
    mockFetchMarketBets.mockResolvedValueOnce([mockBet]);
    mockBuildSorobanInvocation.mockResolvedValueOnce("xdr-string");
    mockSubmitTransaction.mockResolvedValueOnce({
      txHash: "tx-hash-123",
      ledger: 12345,
      returnValue: 1500000n,
    });
    mockDecodeScVal.mockReturnValueOnce(1500000n);

    const { result } = renderHook(() => useClaimWinnings());

    let receipt: any;
    await act(async () => {
      receipt = await result.current.claim("bet-1", "market-1");
    });

    expect(receipt).toMatchObject({
      betId: "bet-1",
      bettor: mockAddress,
      payout: 1500000n,
    });
    expect(receipt.claimedAt).toBeDefined();
  });

  it("initializes with null error", () => {
    const { result } = renderHook(() => useClaimWinnings());

    expect(result.current.error).toBeNull();
  });

  it("sets isLoading false after transaction completes", async () => {
    mockFetchMarketById.mockResolvedValueOnce(mockMarket);
    mockFetchMarketBets.mockResolvedValueOnce([mockBet]);
    mockBuildSorobanInvocation.mockResolvedValueOnce("xdr-string");
    mockSubmitTransaction.mockResolvedValueOnce({
      txHash: "tx-hash-123",
      ledger: 12345,
      returnValue: 1500000n,
    });
    mockDecodeScVal.mockReturnValueOnce(1500000n);

    const { result } = renderHook(() => useClaimWinnings());

    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      await result.current.claim("bet-1", "market-1");
    });

    expect(result.current.isLoading).toBe(false);
  });
});
