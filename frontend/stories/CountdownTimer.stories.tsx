import type { Meta, StoryObj } from "@storybook/react";
import { CountdownTimer } from "@/components/CountdownTimer";

const meta = {
  title: "Components/CountdownTimer",
  component: CountdownTimer,
  parameters: { layout: "centered" },
} satisfies Meta<typeof CountdownTimer>;

export default meta;
type Story = StoryObj<typeof meta>;

const inOneHour = Date.now() + 60 * 60 * 1000;

export const Running: Story = {
  args: { targetTimestamp: inOneHour, label: "Betting closes in" },
};
export const Expired: Story = {
  args: { targetTimestamp: Date.now() - 1000, label: "Betting closes in" },
};
export const CustomExpiredLabel: Story = {
  args: { targetTimestamp: Date.now() - 1000, label: "Dispute window", expiredLabel: "Closed" },
};
