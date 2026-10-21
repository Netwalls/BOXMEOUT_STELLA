import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletConnectButton } from "./WalletConnectButton";
import { useWallet } from "@/hooks/useWallet";

jest.mock("@/hooks/useWallet");

const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;

const baseWallet = {
  address: null,
  isConnected: false,
  walletNotInstalled: false,
  connect: jest.fn(),
  disconnect: jest.fn(),
  signTransaction: jest.fn(),
};

describe("WalletConnectButton", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders Connect Wallet button when not connected", () => {
    mockUseWallet.mockReturnValue({ ...baseWallet });
    render(<WalletConnectButton onConnected={jest.fn()} />);
    expect(screen.getByRole("button", { name: /Connect Wallet/i })).toBeInTheDocument();
  });

  it("renders Install Freighter link when wallet not installed", () => {
    mockUseWallet.mockReturnValue({ ...baseWallet, walletNotInstalled: true });
    render(<WalletConnectButton onConnected={jest.fn()} />);
    const link = screen.getByRole("link", { name: /Install Freighter/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://www.freighter.app/");
  });

  it("renders truncated address when connected", () => {
    mockUseWallet.mockReturnValue({
      ...baseWallet,
      isConnected: true,
      address: "GABCDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXWXYZ",
    });
    render(<WalletConnectButton onConnected={jest.fn()} />);
    expect(screen.getByText(/GABCD\.\.\.WXYZ/)).toBeInTheDocument();
  });

  it("shows Disconnect in dropdown when connected and address clicked", async () => {
    const user = userEvent.setup();
    mockUseWallet.mockReturnValue({
      ...baseWallet,
      isConnected: true,
      address: "GABCDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXWXYZ",
    });
    render(<WalletConnectButton onConnected={jest.fn()} />);
    await user.click(screen.getByText(/GABCD\.\.\.WXYZ/));
    expect(screen.getByRole("button", { name: /Disconnect/i })).toBeInTheDocument();
  });

  it("calls disconnect and clears dropdown when Disconnect clicked", async () => {
    const user = userEvent.setup();
    const disconnect = jest.fn();
    mockUseWallet.mockReturnValue({
      ...baseWallet,
      isConnected: true,
      address: "GABCDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXWXYZ",
      disconnect,
    });
    render(<WalletConnectButton onConnected={jest.fn()} />);
    await user.click(screen.getByText(/GABCD\.\.\.WXYZ/));
    await user.click(screen.getByRole("button", { name: /Disconnect/i }));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("shows Connecting... spinner while connecting", async () => {
    const user = userEvent.setup();
    // connect never resolves so we stay in connecting state
    mockUseWallet.mockReturnValue({
      ...baseWallet,
      connect: () => new Promise(() => {}),
    });
    render(<WalletConnectButton onConnected={jest.fn()} />);
    await user.click(screen.getByRole("button", { name: /Connect Wallet/i }));
    expect(await screen.findByText(/Connecting\.\.\./)).toBeInTheDocument();
  });

  it("calls onConnected with address when address changes", () => {
    const onConnected = jest.fn();
    mockUseWallet.mockReturnValue({
      ...baseWallet,
      isConnected: true,
      address: "GABCDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXWXYZ",
    });
    render(<WalletConnectButton onConnected={onConnected} />);
    expect(onConnected).toHaveBeenCalledWith("GABCDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXWXYZ");
  });

  it("matches snapshot — not connected", () => {
    mockUseWallet.mockReturnValue({ ...baseWallet });
    const { container } = render(<WalletConnectButton onConnected={jest.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("matches snapshot — freighter not installed", () => {
    mockUseWallet.mockReturnValue({ ...baseWallet, walletNotInstalled: true });
    const { container } = render(<WalletConnectButton onConnected={jest.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("matches snapshot — connected", () => {
    mockUseWallet.mockReturnValue({
      ...baseWallet,
      isConnected: true,
      address: "GABCDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXWXYZ",
    });
    const { container } = render(<WalletConnectButton onConnected={jest.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
