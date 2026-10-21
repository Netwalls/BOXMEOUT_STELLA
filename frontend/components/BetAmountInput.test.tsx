import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BetAmountInput } from "./BetAmountInput";

describe("BetAmountInput", () => {
  it("renders input with XLM label", () => {
    render(
      <BetAmountInput
        value=""
        onChange={() => {}}
        min={1}
        max={10000}
        estimatedPayout={null}
      />
    );

    expect(screen.getByText(/Amount \(XLM\)/)).toBeInTheDocument();
  });

  it("shows error when value is below minimum", () => {
    render(
      <BetAmountInput
        value="0.5"
        onChange={() => {}}
        min={1}
        max={10000}
        estimatedPayout={null}
      />
    );

    expect(screen.getByText(/Enter an amount between 1 and 10000 XLM/)).toBeInTheDocument();
  });

  it("shows error when value is above maximum", () => {
    render(
      <BetAmountInput
        value="15000"
        onChange={() => {}}
        min={1}
        max={10000}
        estimatedPayout={null}
      />
    );

    expect(screen.getByText(/Enter an amount between 1 and 10000 XLM/)).toBeInTheDocument();
  });

  it("clears error when value returns to valid range", () => {
    const { rerender } = render(
      <BetAmountInput
        value="15000"
        onChange={() => {}}
        min={1}
        max={10000}
        estimatedPayout={null}
      />
    );

    expect(screen.getByText(/Enter an amount between 1 and 10000 XLM/)).toBeInTheDocument();

    rerender(
      <BetAmountInput
        value="500"
        onChange={() => {}}
        min={1}
        max={10000}
        estimatedPayout={null}
      />
    );

    expect(screen.queryByText(/Enter an amount between 1 and 10000 XLM/)).not.toBeInTheDocument();
  });

  it("displays estimated payout with 2 decimal places when provided", () => {
    render(
      <BetAmountInput
        value="100"
        onChange={() => {}}
        min={1}
        max={10000}
        estimatedPayout={150000000n} // 15 XLM in stroops
      />
    );

    expect(screen.getByText(/Est. payout:/)).toBeInTheDocument();
    expect(screen.getByText(/15\.00 XLM/)).toBeInTheDocument();
  });

  it("does not show payout estimate when null", () => {
    render(
      <BetAmountInput
        value="100"
        onChange={() => {}}
        min={1}
        max={10000}
        estimatedPayout={null}
      />
    );

    expect(screen.queryByText(/Est. payout/)).not.toBeInTheDocument();
  });

  it("does not show payout when there is an error", () => {
    render(
      <BetAmountInput
        value="15000"
        onChange={() => {}}
        min={1}
        max={10000}
        estimatedPayout={150000000n}
      />
    );

    expect(screen.queryByText(/Est. payout/)).not.toBeInTheDocument();
    expect(screen.getByText(/Enter an amount between 1 and 10000 XLM/)).toBeInTheDocument();
  });

  it("disables input when disabled prop is true", () => {
    render(
      <BetAmountInput
        value=""
        onChange={() => {}}
        min={1}
        max={10000}
        estimatedPayout={null}
        disabled={true}
      />
    );

    const input = screen.getByRole("spinbutton");
    expect(input).toBeDisabled();
  });

  it("calls onChange when input value changes", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <BetAmountInput
        value=""
        onChange={onChange}
        min={1}
        max={10000}
        estimatedPayout={null}
      />
    );

    const input = screen.getByRole("spinbutton");
    await user.type(input, "50");

    expect(onChange).toHaveBeenCalled();
  });

  it("matches the snapshot", () => {
    const { container } = render(
      <BetAmountInput
        value="50"
        onChange={() => {}}
        min={1}
        max={10000}
        estimatedPayout={50000000n}
      />
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
