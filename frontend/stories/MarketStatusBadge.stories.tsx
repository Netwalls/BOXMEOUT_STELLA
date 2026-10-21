import type { Meta, StoryObj } from "@storybook/react";
import { MarketStatusBadge } from "@/components/MarketStatusBadge";

const meta = {
  title: "Components/MarketStatusBadge",
  component: MarketStatusBadge,
  parameters: { layout: "centered" },
} satisfies Meta<typeof MarketStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = { args: { status: "Open" } };
export const Locked: Story = { args: { status: "Locked" } };
export const Resolved: Story = { args: { status: "Resolved" } };
export const Disputed: Story = { args: { status: "Disputed" } };
export const Cancelled: Story = { args: { status: "Cancelled" } };
