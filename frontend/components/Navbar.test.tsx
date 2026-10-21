import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { Navbar } from "./Navbar";

expect.extend(toHaveNoViolations);

jest.mock("./WalletConnectButton", () => ({
  WalletConnectButton: () => <div data-testid="wallet-connect-mock" />,
}));

const mockToggleTheme = jest.fn();
let mockTheme = "dark";
jest.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: mockTheme,
    toggleTheme: mockToggleTheme,
  }),
}));

describe("Navbar component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTheme = "dark";
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

  it("triggers theme toggle button with accessible label", async () => {
    const user = userEvent.setup();
    render(<Navbar />);

    const themeBtn = screen.getByRole("button", { name: /switch to light mode/i });
    await user.click(themeBtn);

    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });
});
