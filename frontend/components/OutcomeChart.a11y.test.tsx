import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { OutcomeChart } from "./OutcomeChart";

expect.extend(toHaveNoViolations);

// Recharts uses ResizeObserver; stub it for jsdom
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("OutcomeChart accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <OutcomeChart poolA={BigInt(600)} poolB={BigInt(400)} labelA="Maya Chen" labelB="Rico Alvarez" />
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("summarises the pool split as text", () => {
    render(<OutcomeChart poolA={BigInt(600)} poolB={BigInt(400)} labelA="Maya Chen" labelB="Rico Alvarez" />);

    expect(screen.getByText("Outcome split: Maya Chen 60%, Rico Alvarez 40%")).toBeInTheDocument();
  });

  it("notes an empty pool in the summary", () => {
    render(<OutcomeChart poolA={BigInt(0)} poolB={BigInt(0)} labelA="Maya Chen" labelB="Rico Alvarez" />);

    expect(
      screen.getByText("Outcome split: Maya Chen 50%, Rico Alvarez 50% (no bets placed yet)")
    ).toBeInTheDocument();
  });
});
