import type { Meta, StoryObj } from "@storybook/react";
import { WalletConnectButton } from "@/components/WalletConnectButton";

const meta = {
  title: "Components/WalletConnectButton",
  component: WalletConnectButton,
  parameters: { layout: "centered" },
  args: { onConnected: () => undefined },
} satisfies Meta<typeof WalletConnectButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default state: no wallet connected. */
export const Disconnected: Story = {};
