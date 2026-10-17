import type { Meta, StoryObj } from "@storybook/react";
import MarketCard from "../components/MarketCard";
import { BettingInterface } from "../components/BettingInterface";
import { ClaimButton } from "../components/ClaimButton";
import { CountdownTimer } from "../components/CountdownTimer";
import { CreateMarketForm } from "../components/CreateMarketForm";
import { DisputeModal } from "../components/DisputeModal";
import { FighterCard } from "../components/FighterCard";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { MarketOddsBar } from "../components/MarketOddsBar";
import { MarketStatusBadge } from "../components/MarketStatusBadge";
import { PortfolioTable } from "../components/PortfolioTable";
import { Toast } from "../components/Toast";
import { WalletConnectButton } from "../components/WalletConnectButton";
import type { Bet, Market } from "../lib/api";

const market: Market = {
  id: "market-1",
  contractAddress: "CA123",
  fighterA: {
    name: "Canelo Alvarez",
    record: "61-2-2",
    nationality: "Mexico",
    weightClass: "Super Middleweight",
  },
  fighterB: {
    name: "Terence Crawford",
    record: "41-0",
    nationality: "USA",
    weightClass: "Super Welterweight",
  },
  scheduledAt: "2026-09-12T20:00:00.000Z",
  bettingEndsAt: "2026-09-12T19:00:00.000Z",
  status: "Open",
  outcome: null,
  poolA: "1200",
  poolB: "900",
  totalPool: "2100",
  oracleAddress: "GAORACLE",
  createdBy: "GCREATOR",
};

const bet: Bet = {
  id: "bet-1",
  marketId: market.id,
  bettor: "GTEST",
  side: "FighterA",
  amount: "100",
  placedAt: "2026-06-24T12:00:00.000Z",
  claimed: false,
  payout: null,
};

const meta = {
  title: "Components/Library",
  parameters: { layout: "centered" },
} satisfies Meta<typeof MarketCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MarketCardPreview: Story = {
  render: () => <MarketCard market={market} showOdds />,
};

export const FighterCardPreview: Story = {
  render: () => <FighterCard fighter={market.fighterA} side="A" poolAmount={1200n} impliedOdds={57.1} />,
};

export const StatusBadgePreview: Story = {
  render: () => <MarketStatusBadge status="Open" />,
};

export const BettingInterfacePreview: Story = {
  render: () => <BettingInterface market={market} onBetPlaced={() => undefined} />,
};

export const ClaimButtonPreview: Story = {
  render: () => <ClaimButton bet={bet} market={market} onClaimed={() => undefined} />,
};

export const ToastPreview: Story = {
  render: () => <Toast toast={{ id: "toast-1", message: "Bet placed successfully", type: "success" }} onDismiss={() => undefined} />,
};

export const WalletConnectButtonPreview: Story = {
  render: () => <WalletConnectButton onConnected={() => undefined} />,
};

export const CountdownTimerPreview: Story = {
  render: () => <CountdownTimer targetTimestamp={Math.floor(Date.now() / 1000) + 3600} label="Betting closes in" />,
};

export const CreateMarketFormPreview: Story = {
  render: () => <CreateMarketForm onSubmit={async () => undefined} />,
};

export const DisputeModalPreview: Story = {
  render: () => <DisputeModal market={market} isOpen={true} onClose={() => undefined} onDisputed={() => undefined} />,
};

export const LoadingSkeletonPreview: Story = {
  render: () => <LoadingSkeleton variant="card" count={2} />,
};

export const MarketOddsBarPreview: Story = {
  render: () => <MarketOddsBar poolA={1200n} poolB={900n} fighterAName={market.fighterA.name} fighterBName={market.fighterB.name} />,
};

export const PortfolioTablePreview: Story = {
  render: () => <PortfolioTable bets={[bet]} markets={{ [market.id]: market }} />,
};
