import type { Meta, StoryObj } from "@storybook/react";
import { FighterCard } from "@/components/FighterCard";

const meta = {
  title: "Components/FighterCard",
  component: FighterCard,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof FighterCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SideA: Story = {
  args: {
    fighter: {
      name: "Lina Torres",
      record: "18-2",
      nationality: "USA",
      weightClass: "Featherweight",
    },
    side: "A",
    poolAmount: 500000000n,
    impliedOdds: 72.5,
  },
};

export const SideB: Story = {
  args: {
    fighter: {
      name: "Rico Alvarez",
      record: "20-2",
      nationality: "Mexico",
      weightClass: "Featherweight",
    },
    side: "B",
    poolAmount: 250000000n,
    impliedOdds: 27.5,
  },
};

export const ZeroPool: Story = {
  args: {
    fighter: {
      name: "Maya Chen",
      record: "15-1",
      nationality: "USA",
      weightClass: "Lightweight",
    },
    side: "A",
    poolAmount: 0n,
    impliedOdds: 50.0,
  },
};

export const HighOdds: Story = {
  args: {
    fighter: {
      name: "James King",
      record: "25-1",
      nationality: "USA",
      weightClass: "Heavyweight",
    },
    side: "A",
    poolAmount: 1000000000n,
    impliedOdds: 95.3,
  },
};
