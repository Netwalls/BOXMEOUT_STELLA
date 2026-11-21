import type { Meta, StoryObj } from "@storybook/react";
import { ClaimButton } from "@/components/ClaimButton";
import { baseBet, baseMarket } from "./fixtures/marketFixtures";

const meta = {
  title: "Components/ClaimButton",
  component: ClaimButton,
  parameters: { layout: "centered" },
  args: { onClaimed: () => undefined },
} satisfies Meta<typeof ClaimButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WinningsClaimable: Story = {
  args: {
    bet: baseBet,
    market: { ...baseMarket, status: "Resolved", outcome: "FighterA" },
  },
};
export const MarketStillOpen: Story = {
  args: { bet: baseBet, market: baseMarket },
};
export const AlreadyClaimed: Story = {
  args: {
    bet: { ...baseBet, claimed: true },
    market: { ...baseMarket, status: "Resolved", outcome: "FighterA" },
  },
};
export const UnknownMarket: Story = {
  args: { bet: baseBet, market: undefined },
};
