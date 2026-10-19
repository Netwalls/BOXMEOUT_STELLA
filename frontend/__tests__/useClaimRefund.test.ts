import { renderHook, act } from "@testing-library/react";
import { useClaimRefund } from "@/hooks/useClaimRefund";
import { useWallet } from "@/hooks/useWallet";
import * as stellar from "@/lib/stellar";
import * as api from "@/lib/api";

jest.mock("@/hooks/useWallet", () => ({ useWallet: jest.fn() }));
jest.mock("@/lib/stellar");
jest.mock("@/lib/api", () => ({ fetchMarketById: jest.fn(), fetchMarketBets: jest.fn() }));

const mockUseWallet = useWallet as jest.Mock;
const mockBuildSorobanInvocation = stellar.buildSorobanInvocation as jest.Mock;
const mockFetchMarketById = api.fetchMarketById as jest.Mock;
const mockFetchMarketBets = api.fetchMarketBets as jest.Mock;

const ADDRESS = "GBETTOR";
const CONTRACT_ADDRESS = "CMARKETCONTRACTADDRESS";

beforeEach(() => {
  jest.clearAllMocks();
  mockUseWallet.mockReturnValue({
    address: ADDRESS,
    isNetworkMismatched: false,
    signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
  });
  mockFetchMarketById.mockResolvedValue({
    id: "market-1",
    contractAddress: CONTRACT_ADDRESS,
    status: "Cancelled",
    outcome: null,
  });
  mockFetchMarketBets.mockResolvedValue([{ id: "bet-1" }]);
  mockBuildSorobanInvocation.mockResolvedValue("unsigned-xdr");
  (stellar.submitTransaction as jest.Mock).mockResolvedValue({ txHash: "h", ledger: 1, returnValue: null });
  (stellar.decodeScVal as jest.Mock).mockResolvedValue(50n);
});

it("builds claim_refund against the market contract address", async () => {
  const { result } = renderHook(() => useClaimRefund());

  await act(async () => {
    await result.current.claimRefund("bet-1", "market-1");
  });

  expect(mockBuildSorobanInvocation).toHaveBeenCalledWith({
    contractId: CONTRACT_ADDRESS,
    method: "claim_refund",
    args: ["bet-1"],
    signerAddress: ADDRESS,
  });
});
