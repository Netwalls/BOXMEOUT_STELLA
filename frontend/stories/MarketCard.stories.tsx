import type { Meta, StoryObj } from "@storybook/react";
import MarketCard from "@/components/MarketCard";
import { baseMarket } from "./fixtures/marketFixtures";

const meta = {
  title: "Components/MarketCard",
  component: MarketCard,
  parameters: { layout: "centered" },
} satisfies Meta<typeof MarketCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = { args: { market: baseMarket } };
export const WithoutOdds: Story = { args: { market: baseMarket, showOdds: false } };
export const Resolved: Story = {
  args: { market: { ...baseMarket, status: "Resolved", outcome: "FighterA" } },
};
export const EmptyPool: Story = {
  args: { market: { ...baseMarket, poolA: "0", poolB: "0", totalPool: "0" } },
};
