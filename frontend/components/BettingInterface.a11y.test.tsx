import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { BettingInterface } from "./BettingInterface";
import { Market, MarketStatus } from "@/lib/api";

expect.extend(toHaveNoViolations);

const placeBet = jest.fn();
const showToast = jest.fn();
let isLoading: boolean = false;

jest.mock("@/hooks/usePlaceBet", () => ({
  usePlaceBet: () => ({ placeBet, isLoading, error: null }),
}));

jest.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toasts: [], showToast, dismissToast: jest.fn() }),
}));

const buildMarket = (status: MarketStatus): Market => ({
  id: "market-123",
  contractAddress: "CA1",
  fighterA: { name: "Maya Chen", record: "19-1", nationality: "USA", weightClass: "Lightweight" },
  fighterB: { name: "Rico Alvarez", record: "20-2", nationality: "Mexico", weightClass: "Lightweight" },
  scheduledAt: "2026-07-10T20:00:00Z",
  bettingEndsAt: "2026-07-09T20:00:00Z",
  status,
  outcome: null,
  poolA: "1200",
  poolB: "900",
  totalPool: "2100",
  oracleAddress: "ORA",
  createdBy: "GCREATOR",
});

describe("BettingInterface accessibility", () => {
  beforeEach(() => {
    isLoading = false;
    jest.clearAllMocks();
  });

  it("has no axe violations in its default state", async () => {
    const { container } = render(<BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations while a transaction is in flight", async () => {
    isLoading = true;
    const { container } = render(<BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations when the amount is invalid", async () => {
    const user = userEvent.setup();
    const { container } = render(<BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />);

    await user.type(screen.getByLabelText(/amount \(xlm\)/i), "99999");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations when the market is closed", async () => {
    const { container } = render(<BettingInterface market={buildMarket("Locked")} onBetPlaced={jest.fn()} />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("labels the amount input via its own label element", () => {
    render(<BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />);

    expect(screen.getByLabelText(/amount \(xlm\)/i)).toHaveAttribute("type", "number");
  });

  it("exposes fighter selection as a labelled group of toggle buttons", async () => {
    const user = userEvent.setup();
    render(<BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />);

    const fighterA = screen.getByRole("button", { name: /bet on maya chen/i });
    expect(fighterA).toHaveAttribute("aria-pressed", "false");

    await user.click(fighterA);

    expect(fighterA).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: /pick a fighter/i })).toBeInTheDocument();
  });

  it("announces in-flight transaction status through a live region", () => {
    isLoading = true;
    render(<BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent(/confirming transaction/i);
  });

  it("reaches every control by keyboard in DOM order", async () => {
    const user = userEvent.setup();
    render(<BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />);

    await user.tab();
    expect(screen.getByRole("button", { name: /bet on maya chen/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /bet on rico alvarez/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/amount \(xlm\)/i)).toHaveFocus();
  });

  it("selects a fighter with the keyboard", async () => {
    const user = userEvent.setup();
    render(<BettingInterface market={buildMarket("Open")} onBetPlaced={jest.fn()} />);

    await user.tab();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: /bet on maya chen/i })).toHaveAttribute("aria-pressed", "true");
  });
});
