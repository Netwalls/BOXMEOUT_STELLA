import React from "react";
import { render, screen } from "@testing-library/react";
import { FighterCard } from "./FighterCard";
import { Fighter } from "@/lib/api";

const buildFighter = (): Fighter => ({
  name: "Lina Torres",
  record: "18-2",
  nationality: "USA",
  weightClass: "Featherweight",
});

describe("FighterCard", () => {
  it("renders fighter name large and bold", () => {
    render(<FighterCard fighter={buildFighter()} side="A" poolAmount={1200n} impliedOdds={72.5} />);

    const name = screen.getByText("Lina Torres");
    expect(name).toBeInTheDocument();
    expect(name.className).toContain("font-bold");
  });

  it("renders all fighter metadata fields", () => {
    render(<FighterCard fighter={buildFighter()} side="A" poolAmount={1200n} impliedOdds={72.5} />);

    expect(screen.getByText("Lina Torres")).toBeInTheDocument();
    expect(screen.getByText(/18-2/)).toBeInTheDocument();
    expect(screen.getByText(/USA/)).toBeInTheDocument();
    expect(screen.getByText(/Featherweight/)).toBeInTheDocument();
  });

  it("formats pool amount from stroops to XLM with 2 decimal places", () => {
    render(<FighterCard fighter={buildFighter()} side="A" poolAmount={100000000n} impliedOdds={50.0} />);

    expect(screen.getByText(/10\.00 XLM/)).toBeInTheDocument();
  });

  it("shows 0 XLM when pool is zero", () => {
    render(<FighterCard fighter={buildFighter()} side="B" poolAmount={0n} impliedOdds={25.0} />);

    expect(screen.getByText(/0\.00 XLM/)).toBeInTheDocument();
  });

  it("formats implied odds to 1 decimal place", () => {
    render(<FighterCard fighter={buildFighter()} side="A" poolAmount={2500n} impliedOdds={62.546} />);

    expect(screen.getByText(/62\.5%/)).toBeInTheDocument();
  });

  it("applies blue border accent for side A", () => {
    const { container } = render(<FighterCard fighter={buildFighter()} side="A" poolAmount={1200n} impliedOdds={72.5} />);
    const card = container.querySelector("div");

    expect(card?.className).toContain("border-blue-500");
    expect(card?.className).toContain("text-blue-400");
  });

  it("applies red border accent for side B", () => {
    const { container } = render(<FighterCard fighter={buildFighter()} side="B" poolAmount={1200n} impliedOdds={27.5} />);
    const card = container.querySelector("div");

    expect(card?.className).toContain("border-red-500");
    expect(card?.className).toContain("text-red-400");
  });

  it("matches the structural snapshot", () => {
    const { container } = render(<FighterCard fighter={buildFighter()} side="A" poolAmount={100000000n} impliedOdds={62.5} />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
