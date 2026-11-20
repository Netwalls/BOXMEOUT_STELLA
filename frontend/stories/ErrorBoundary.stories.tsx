import type { Meta, StoryObj } from "@storybook/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function Broken(): JSX.Element {
  throw new Error("Story: simulated render failure");
}

const meta = {
  title: "Components/ErrorBoundary",
  component: ErrorBoundary,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
  args: { children: <p>Content renders normally.</p> },
};
export const ErrorState: Story = {
  args: { children: <Broken /> },
};
