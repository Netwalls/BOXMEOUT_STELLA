import { handleWinningsClaimedEvent, handleRefundClaimedEvent, SorobanEvent } from "./indexer.service";
import * as betService from "./bet.service";

jest.mock("./bet.service");

const mockMarkBetClaimedByMarketAndBettor = betService.markBetClaimedByMarketAndBettor as jest.MockedFunction<typeof betService.markBetClaimedByMarketAndBettor>;

const makeEvent = (type: string, overrides: Record<string, unknown> = {}): SorobanEvent => ({
  type,
  contractId: "CA1",
  ledger: 100,
  ledgerClosedAt: "2026-01-01T00:00:00Z",
  txHash: "abc123",
  body: {
    market_id: "market-1",
    bettor: "GABC",
    payout: "5000000000",
    amount: "5000000000",
    ...overrides,
  },
});

describe("handleWinningsClaimedEvent", () => {
  beforeEach(() => {
    mockMarkBetClaimedByMarketAndBettor.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("decodes winnings_claimed event and marks bet claimed by (marketId, bettor)", async () => {
    const event = makeEvent("WinningsClaimed", { market_id: "MARKET_42", bettor: "GBETTOR1", payout: "2000000" });
    await handleWinningsClaimedEvent(event);

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledTimes(1);
    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledWith(
      "MARKET_42", "GBETTOR1", BigInt("2000000")
    );
  });

  it("matches the correct bet row via (marketId, bettor)", async () => {
    const event = makeEvent("WinningsClaimed", { market_id: "M99", bettor: "GDIFF" });
    await handleWinningsClaimedEvent(event);

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledWith(
      "M99", "GDIFF", expect.any(BigInt)
    );
  });

  it("is idempotent — calling twice invokes markBetClaimedByMarketAndBettor twice", async () => {
    const event = makeEvent("WinningsClaimed");
    await handleWinningsClaimedEvent(event);
    await handleWinningsClaimedEvent(event);

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledTimes(2);
  });
});

describe("handleRefundClaimedEvent", () => {
  beforeEach(() => {
    mockMarkBetClaimedByMarketAndBettor.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("decodes refund_claimed event and marks bet claimed by (marketId, bettor)", async () => {
    const event = makeEvent("RefundClaimed", { market_id: "MARKET_55", bettor: "GREFUND", amount: "1000000" });
    await handleRefundClaimedEvent(event);

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledTimes(1);
    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledWith(
      "MARKET_55", "GREFUND", BigInt("1000000")
    );
  });

  it("matches the correct bet row via (marketId, bettor)", async () => {
    const event = makeEvent("RefundClaimed", { market_id: "M88", bettor: "GOTHER" });
    await handleRefundClaimedEvent(event);

    expect(mockMarkBetClaimedByMarketAndBettor).toHaveBeenCalledWith(
      "M88", "GOTHER", expect.any(BigInt)
    );
  });
});
