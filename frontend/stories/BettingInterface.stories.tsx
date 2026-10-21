import type { Meta, StoryObj } from "@storybook/react";
import { BettingInterface } from "@/components/BettingInterface";

const meta = {
  title: "Components/BettingInterface",
  component: BettingInterface,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof BettingInterface>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockMarket = {
  id: "market-123",
  contractAddress: "CA1",
  fighterA: {
    name: "Alice Fighter",
    record: "15-3",
    nationality: "USA",
    weightClass: "Middleweight",
  },
  fighterB: {
    name: "Bob Fighter",
    record: "12-5",
    nationality: "Canada",
    weightClass: "Middleweight",
  },
  scheduledAt: "2026-07-15T20:00:00Z",
  bettingEndsAt: "2026-07-14T20:00:00Z",
  status: "Open" as const,
  outcome: null,
  poolA: "5000000000",
  poolB: "3000000000",
  totalPool: "8000000000",
  oracleAddress: "ORA123",
  createdBy: "0xabc",
};

export const Open: Story = {
  args: {
    market: mockMarket,
    onBetPlaced: () => {},
  },
};

export const Locked: Story = {
  args: {
    market: { ...mockMarket, status: "Locked" as const },
    onBetPlaced: () => {},
  },
};

export const Resolved: Story = {
  args: {
    market: {
      ...mockMarket,
      status: "Resolved" as const,
      outcome: "FighterA" as const,
    },
    onBetPlaced: () => {},
  },
};
