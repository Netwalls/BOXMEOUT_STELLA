import type { Meta, StoryObj } from "@storybook/react";
import { BetAmountInput } from "@/components/BetAmountInput";

const meta = {
  title: "Components/BetAmountInput",
  component: BetAmountInput,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof BetAmountInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    value: "",
    onChange: () => {},
    min: 1,
    max: 10000,
    estimatedPayout: null,
    disabled: false,
  },
};

export const WithValue: Story = {
  args: {
    value: "50",
    onChange: () => {},
    min: 1,
    max: 10000,
    estimatedPayout: 75000000n,
    disabled: false,
  },
};

export const WithError: Story = {
  args: {
    value: "15000",
    onChange: () => {},
    min: 1,
    max: 10000,
    estimatedPayout: null,
    disabled: false,
  },
};

export const Disabled: Story = {
  args: {
    value: "100",
    onChange: () => {},
    min: 1,
    max: 10000,
    estimatedPayout: 150000000n,
    disabled: true,
  },
};
