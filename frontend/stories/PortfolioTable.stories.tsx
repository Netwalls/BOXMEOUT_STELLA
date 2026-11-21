import type { Meta, StoryObj } from "@storybook/react";
import { PortfolioTable } from "@/components/PortfolioTable";
import { baseBet, baseMarket } from "./fixtures/marketFixtures";

const meta = {
  title: "Components/PortfolioTable",
  component: PortfolioTable,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PortfolioTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const markets = { [baseMarket.id]: baseMarket };

export const WithBets: Story = { args: { bets: [baseBet], markets } };
export const Empty: Story = { args: { bets: [], markets: {} } };
export const LostBet: Story = {
  args: {
    bets: [{ ...baseBet, side: "FighterB" }],
    markets: { [baseMarket.id]: { ...baseMarket, status: "Resolved", outcome: "FighterA" } },
  },
};
