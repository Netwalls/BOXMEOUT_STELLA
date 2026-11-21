import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { Navbar } from "./Navbar";

expect.extend(toHaveNoViolations);

jest.mock("./WalletConnectButton", () => ({
  WalletConnectButton: () => <div data-testid="wallet-connect-mock" />,
}));

const mockSetPreference = jest.fn();
let mockPreference = "system";
jest.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({
    preference: mockPreference,
    theme: "light",
    setPreference: mockSetPreference,
  }),
}));

describe("Navbar component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreference = "system";
  });

  it("renders desktop navigation links and passes axe audit", async () => {
    const { container } = render(<Navbar />);

    expect(screen.getByRole("link", { name: "BOXMEOUT" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Leaderboard" })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("toggles mobile dropdown menu when hamburger button is clicked", async () => {
    const user = userEvent.setup();
    render(<Navbar />);

    const menuButton = screen.getByRole("button", { name: /open menu/i });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await user.click(menuButton);
    expect(screen.getByRole("button", { name: /close menu/i })).toHaveAttribute("aria-expanded", "true");

    const mobileMenu = document.getElementById("mobile-menu");
    expect(mobileMenu).toBeInTheDocument();
  });

  it("offers labelled Light, Dark and System theme choices (F-152)", async () => {
    const user = userEvent.setup();
    render(<Navbar />);

    const group = screen.getByRole("radiogroup", { name: /colour theme/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(mockSetPreference).toHaveBeenCalledWith("dark");
  });
});
