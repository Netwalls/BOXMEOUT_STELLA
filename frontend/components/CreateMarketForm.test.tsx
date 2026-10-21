import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateMarketForm, formatUtcPreview, type CreateMarketFormData } from "./CreateMarketForm";

// Real valid Ed25519 Stellar public key
const VALID_ORACLE = "GDQ2Z36EATKI3C626APARVCSMIFVYOSZD74O3BKUW2HBV6WWFKY3TRFU";
const INVALID_ORACLE_CHECKSUM = "GDQ2Z36EATKI3C626APARVCSMIFVYOSZD74O3BKUW2HBV6WWFKY3TRFA"; // invalid checksum
const NOT_AN_ADDRESS = "GNOTANADDRESS";

function getFutureDate(daysAhead: number, hours: number = 20): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hours, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function getPastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 16);
}

describe("CreateMarketForm validation", () => {
  it("formatUtcPreview converts datetime-local strings to ISO UTC format", () => {
    expect(formatUtcPreview("")).toBeNull();
    expect(formatUtcPreview("invalid-date")).toBeNull();
    const preview = formatUtcPreview("2026-12-01T15:30");
    expect(preview).toMatch(/^2026-12-01T\d{2}:30:00Z$/);
  });

  it("renders with Submit disabled initially", () => {
    render(<CreateMarketForm onSubmit={jest.fn()} />);
    const submitBtn = screen.getByRole("button", { name: /create market/i });
    expect(submitBtn).toBeDisabled();
  });

  it("validates StrKey oracle address rejecting malformed keys and checksum failures", async () => {
    const user = userEvent.setup();
    render(<CreateMarketForm onSubmit={jest.fn()} />);

    const oracleInput = screen.getByPlaceholderText("G...");

    // Malformed G address
    await user.type(oracleInput, NOT_AN_ADDRESS);
    expect(screen.getByText("Must be a valid G... Stellar address")).toBeInTheDocument();

    // Valid length but invalid base32 checksum
    await user.clear(oracleInput);
    await user.type(oracleInput, INVALID_ORACLE_CHECKSUM);
    expect(screen.getByText("Must be a valid G... Stellar address")).toBeInTheDocument();

    // Valid StrKey
    await user.clear(oracleInput);
    await user.type(oracleInput, VALID_ORACLE);
    expect(screen.queryByText("Must be a valid G... Stellar address")).not.toBeInTheDocument();
  });

  it("enforces future-time and datetime ordering checks with inline errors", async () => {
    const user = userEvent.setup();
    render(<CreateMarketForm onSubmit={jest.fn()} />);

    const fightDateInput = screen.getByLabelText(/fight date \/ time/i);
    const bettingCloseInput = screen.getByLabelText(/betting closes at/i);

    // Scheduled fight date in the past
    await user.type(fightDateInput, getPastDate(1));
    expect(screen.getByText("Must be in the future")).toBeInTheDocument();

    // Valid future fight date
    await user.clear(fightDateInput);
    await user.type(fightDateInput, getFutureDate(5, 22));
    expect(screen.queryByText("Must be in the future")).not.toBeInTheDocument();

    // Betting close date in the past
    await user.type(bettingCloseInput, getPastDate(1));
    expect(screen.getByText("Must be in the future")).toBeInTheDocument();

    // Betting close date in the future but AFTER scheduled fight time
    await user.clear(bettingCloseInput);
    await user.type(bettingCloseInput, getFutureDate(6, 12));
    expect(screen.getByText("Must be before fight time")).toBeInTheDocument();

    // Valid betting close date (before fight time and in the future)
    await user.clear(bettingCloseInput);
    await user.type(bettingCloseInput, getFutureDate(5, 18));
    expect(screen.queryByText("Must be before fight time")).not.toBeInTheDocument();
  });

  it("displays live UTC preview text when valid datetime-local is entered", async () => {
    const user = userEvent.setup();
    render(<CreateMarketForm onSubmit={jest.fn()} />);

    const fightDateInput = screen.getByLabelText(/fight date \/ time/i);
    await user.type(fightDateInput, "2026-12-25T18:00");

    const expectedUtc = formatUtcPreview("2026-12-25T18:00")!;
    expect(screen.getByText(/UTC:/)).toBeInTheDocument();
    expect(screen.getByText(expectedUtc)).toBeInTheDocument();
  });

  it("enables Submit button only when all fields are valid and triggers onSubmit with form data", async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn().mockResolvedValue(undefined);
    render(<CreateMarketForm onSubmit={handleSubmit} />);

    const submitBtn = screen.getByRole("button", { name: /create market/i });
    expect(submitBtn).toBeDisabled();

    // Fill Fighter A
    await user.type(screen.getByPlaceholderText(/muhammad ali/i), "Tyson Fury");
    await user.type(screen.getByPlaceholderText("e.g. 56-5"), "34-1-1");
    await user.type(screen.getAllByPlaceholderText("e.g. USA")[0], "UK");
    await user.type(screen.getAllByPlaceholderText("e.g. Heavyweight")[0], "Heavyweight");

    // Fill Fighter B
    await user.type(screen.getByPlaceholderText(/joe frazier/i), "Oleksandr Usyk");
    await user.type(screen.getByPlaceholderText("e.g. 32-4"), "22-0");
    await user.type(screen.getAllByPlaceholderText("e.g. USA")[1], "Ukraine");
    await user.type(screen.getAllByPlaceholderText("e.g. Heavyweight")[1], "Heavyweight");

    // Dates & Oracle
    await user.type(screen.getByLabelText(/fight date \/ time/i), getFutureDate(10, 22));
    await user.type(screen.getByLabelText(/betting closes at/i), getFutureDate(10, 20));
    await user.type(screen.getByPlaceholderText("G..."), VALID_ORACLE);

    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled();
    });

    await user.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        fighterAName: "Tyson Fury",
        fighterBName: "Oleksandr Usyk",
        oracleAddress: VALID_ORACLE,
      })
    );
  });
});
