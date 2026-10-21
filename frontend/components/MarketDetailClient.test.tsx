import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarketDetailClient } from "./MarketDetailClient";
import { Market, Bet } from "@/lib/api";
import { stellarExpertContractUrl, truncateAddress } from "@/lib/stellar";

// Stub ResizeObserver for Recharts in jsdom
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mockAddToast = jest.fn();
jest.mock("@/components/ToastProvider", () => ({
  useToast: () => ({
    addToast: mockAddToast,
  }),
}));

jest.mock("@/hooks/useMarket", () => ({
  useMarket: () => ({ market: null, isLoading: false, error: null }),
}));

jest.mock("@/hooks/useMarketBets", () => ({
  useMarketBets: () => ({ bets: [], isLoading: false, error: null }),
}));

jest.mock("@/hooks/useMarketEvents", () => ({
  useMarketEvents: () => ({ poolA: null, poolB: null }),
}));

jest.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({
    address: "GBX...",
    isConnected: true,
    walletNotInstalled: false,
    networkPassphrase: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    signTransaction: jest.fn(),
  }),
}));

jest.mock("@/components/OutcomeChart", () => ({
  OutcomeChart: () => <div data-testid="outcome-chart-mock" />,
}));

jest.mock("@/components/MarketOddsChart", () => ({
  MarketOddsChart: () => <div data-testid="market-odds-chart-mock" />,
}));

const mockMarket: Market = {
  id: "market-contract-123",
  contractAddress: "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
  fighterA: { name: "Tyson Fury", record: "34-1-1", nationality: "UK", weightClass: "Heavyweight" },
  fighterB: { name: "Oleksandr Usyk", record: "22-0", nationality: "Ukraine", weightClass: "Heavyweight" },
  scheduledAt: "2026-12-25T20:00:00Z",
  bettingEndsAt: "2026-12-25T19:00:00Z",
  status: "Open",
  outcome: null,
  poolA: "1000000000",
  poolB: "1000000000",
  totalPool: "2000000000",
  oracleAddress: "GDQ2Z36EATKI3C626APARVCSMIFVYOSZD74O3BKUW2HBV6WWFKY3TRFU",
  createdBy: "GCREATOR",
};

describe("MarketDetailClient contract explorer & copy features", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders truncated contract address and explorer link", () => {
    render(
      <MarketDetailClient
        marketId={mockMarket.id}
        initialMarket={mockMarket}
        initialBets={[]}
        initialOddsHistory={[]}
      />
    );

    const expectedTruncated = truncateAddress(mockMarket.contractAddress);
    expect(screen.getByText(expectedTruncated)).toBeInTheDocument();

    const explorerLink = screen.getByRole("link", {
      name: /view contract on stellar expert/i,
    });
    expect(explorerLink).toBeInTheDocument();
    expect(explorerLink).toHaveAttribute(
      "href",
      stellarExpertContractUrl(mockMarket.contractAddress)
    );
    expect(explorerLink).toHaveAttribute("target", "_blank");
    expect(explorerLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("copies full contract address to clipboard and displays confirmation", async () => {
    const user = userEvent.setup();
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    });

    render(
      <MarketDetailClient
        marketId={mockMarket.id}
        initialMarket={mockMarket}
        initialBets={[]}
        initialOddsHistory={[]}
      />
    );

    const copyBtn = screen.getByRole("button", {
      name: /copy contract address to clipboard/i,
    });
    expect(copyBtn).toBeInTheDocument();

    await user.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(mockMarket.contractAddress);
    expect(mockAddToast).toHaveBeenCalledWith("Contract address copied to clipboard!", "success");

    // Accessible live status announcement
    expect(screen.getByText(/copied contract address to clipboard/i)).toBeInTheDocument();

    // Button label updates to indicate copied state
    expect(
      screen.getByRole("button", { name: /contract address copied/i })
    ).toBeInTheDocument();
  });

  it("falls back to market id when contractAddress is empty", () => {
    const marketWithoutContract: Market = {
      ...mockMarket,
      contractAddress: "",
    };

    render(
      <MarketDetailClient
        marketId={marketWithoutContract.id}
        initialMarket={marketWithoutContract}
        initialBets={[]}
        initialOddsHistory={[]}
      />
    );

    expect(screen.getByText(truncateAddress(marketWithoutContract.id))).toBeInTheDocument();
    const explorerLink = screen.getByRole("link", {
      name: /view contract on stellar expert/i,
    });
    expect(explorerLink).toHaveAttribute(
      "href",
      stellarExpertContractUrl(marketWithoutContract.id)
    );
  });
});
