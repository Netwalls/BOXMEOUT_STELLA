import type { Meta, StoryObj } from "@storybook/react";
import { BetRow } from "@/components/BetRow";
import { baseBet, baseMarket } from "./fixtures/marketFixtures";

const meta = {
  title: "Components/BetRow",
  component: BetRow,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BetRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = { args: { bet: baseBet, market: baseMarket } };
export const Claimable: Story = {
  args: {
    bet: baseBet,
    market: { ...baseMarket, status: "Resolved", outcome: "FighterA" },
  },
};
export const Lost: Story = {
  args: {
    bet: baseBet,
    market: { ...baseMarket, status: "Resolved", outcome: "FighterB" },
  },
};
export const UnknownMarket: Story = { args: { bet: baseBet, market: undefined } };
