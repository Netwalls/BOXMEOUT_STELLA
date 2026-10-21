import type { Meta, StoryObj } from "@storybook/react";
import { MarketOddsBar } from "@/components/MarketOddsBar";

const meta = {
  title: "Components/MarketOddsBar",
  component: MarketOddsBar,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof MarketOddsBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Even: Story = {
  args: {
    poolA: 5000000000n,
    poolB: 5000000000n,
    fighterAName: "Alice",
    fighterBName: "Bob",
  },
};

export const SkewedA: Story = {
  args: {
    poolA: 8000000000n,
    poolB: 2000000000n,
    fighterAName: "Alice",
    fighterBName: "Bob",
  },
};

export const SkewedB: Story = {
  args: {
    poolA: 2000000000n,
    poolB: 8000000000n,
    fighterAName: "Alice",
    fighterBName: "Bob",
  },
};

export const Empty: Story = {
  args: {
    poolA: 0n,
    poolB: 0n,
    fighterAName: "Alice",
    fighterBName: "Bob",
  },
};

export const AllOnA: Story = {
  args: {
    poolA: 10000000000n,
    poolB: 0n,
    fighterAName: "Alice",
    fighterBName: "Bob",
  },
};
