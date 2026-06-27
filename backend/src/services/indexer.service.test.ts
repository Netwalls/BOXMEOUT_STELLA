import { handleWinnersClaimedEvent, SorobanEvent } from "./indexer.service";
import * as betService from "./bet.service";

jest.mock("./bet.service");

const mockMarkBetClaimed = betService.markBetClaimed as jest.MockedFunction<typeof betService.markBetClaimed>;

const makeEvent = (type: string, overrides: Record<string, unknown> = {}): SorobanEvent => ({
  type,
  contractId: "CA1",
  ledger: 100,
  ledgerClosedAt: "2026-01-01T00:00:00Z",
  txHash: "abc123",
  body: {
    bet_id: "bet-42",
    bettor: "GABC",
    payout: "5000000000",
    ...overrides,
  },
});

describe("handleWinnersClaimedEvent", () => {
  beforeEach(() => {
    mockMarkBetClaimed.mockResolvedValue({} as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("marks the bet as claimed with the correct payout for WinningsClaimed", async () => {
    await handleWinnersClaimedEvent(makeEvent("WinningsClaimed"));

    expect(mockMarkBetClaimed).toHaveBeenCalledTimes(1);
    expect(mockMarkBetClaimed).toHaveBeenCalledWith("bet-42", BigInt("5000000000"));
  });

  it("marks the bet as claimed with the correct payout for RefundClaimed", async () => {
    await handleWinnersClaimedEvent(makeEvent("RefundClaimed", { payout: "1000000000" }));

    expect(mockMarkBetClaimed).toHaveBeenCalledTimes(1);
    expect(mockMarkBetClaimed).toHaveBeenCalledWith("bet-42", BigInt("1000000000"));
  });

  it("is idempotent — calling twice invokes markBetClaimed twice (upsert is in the service)", async () => {
    const event = makeEvent("WinningsClaimed");
    await handleWinnersClaimedEvent(event);
    await handleWinnersClaimedEvent(event);

    expect(mockMarkBetClaimed).toHaveBeenCalledTimes(2);
    expect(mockMarkBetClaimed).toHaveBeenNthCalledWith(1, "bet-42", BigInt("5000000000"));
    expect(mockMarkBetClaimed).toHaveBeenNthCalledWith(2, "bet-42", BigInt("5000000000"));
  });
});
