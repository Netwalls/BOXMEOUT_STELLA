import type { Meta, StoryObj } from "@storybook/react";
import { DisputeModal } from "@/components/DisputeModal";
import { baseBet, baseMarket } from "./fixtures/marketFixtures";

const resolvedMarket = {
  ...baseMarket,
  status: "Resolved" as const,
  outcome: "FighterA" as const,
  resolvedAt: new Date().toISOString(),
};

const meta = {
  title: "Components/DisputeModal",
  component: DisputeModal,
  parameters: { layout: "fullscreen" },
  args: {
    market: resolvedMarket,
    userBets: [baseBet],
    isOpen: true,
    onDisputed: () => undefined,
    onClose: () => undefined,
  },
} satisfies Meta<typeof DisputeModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Closed: Story = { args: { isOpen: false } };
export const NoBets: Story = { args: { userBets: [] } };
