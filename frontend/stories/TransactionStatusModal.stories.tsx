import type { Meta, StoryObj } from "@storybook/react";
import { TransactionStatusModal } from "@/components/TransactionStatusModal";

const meta = {
  title: "Components/TransactionStatusModal",
  component: TransactionStatusModal,
  parameters: { layout: "fullscreen" },
  args: { isOpen: true, onClose: () => undefined, status: "pending" },
} satisfies Meta<typeof TransactionStatusModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};
export const Success: Story = {
  args: { status: "success", txHash: "a1b2c3d4e5f6", title: "Bet placed" },
};
export const Error: Story = {
  args: { status: "error", errorMessage: "User rejected the request" },
};
export const Closed: Story = { args: { isOpen: false } };
