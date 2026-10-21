import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateMarketPage from "@/app/create/page";
import { useWallet } from "@/hooks/useWallet";
import { useCreateMarket } from "@/hooks/useCreateMarket";
import { useToastProvider } from "@/components/ToastProvider";

jest.mock("@/hooks/useWallet");
jest.mock("@/hooks/useCreateMarket");
jest.mock("@/components/ToastProvider");
jest.mock("@/components/WalletConnectButton", () => ({
  WalletConnectButton: ({ onConnected }: { onConnected: (a: string) => void }) => (
    <button onClick={() => onConnected("GADDR")}>Connect Wallet</button>
  ),
}));

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const baseWallet = {
  address: null,
  isConnected: false,
  walletNotInstalled: false,
  connect: jest.fn(),
  disconnect: jest.fn(),
  signTransaction: jest.fn(),
};

describe("CreateMarketPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useToastProvider as jest.Mock).mockReturnValue({ addToast: jest.fn(), toasts: [], removeToast: jest.fn() });
  });

  it("shows connect prompt when wallet not connected", () => {
    (useWallet as jest.Mock).mockReturnValue({ ...baseWallet });
    (useCreateMarket as jest.Mock).mockReturnValue({ createMarket: jest.fn(), isLoading: false, error: null });
    render(<CreateMarketPage />);
    expect(screen.getByText(/Connect your wallet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect Wallet/i })).toBeInTheDocument();
  });

  it("shows form when wallet is connected", () => {
    (useWallet as jest.Mock).mockReturnValue({ ...baseWallet, isConnected: true, address: "GADDR" });
    (useCreateMarket as jest.Mock).mockReturnValue({ createMarket: jest.fn(), isLoading: false, error: null });
    render(<CreateMarketPage />);
    expect(screen.getByRole("button", { name: /Create Market/i })).toBeInTheDocument();
  });

  it("navigates to market page and shows success toast on successful creation", async () => {
    const user = userEvent.setup();
    const addToast = jest.fn();
    (useToastProvider as jest.Mock).mockReturnValue({ addToast, toasts: [], removeToast: jest.fn() });
    (useWallet as jest.Mock).mockReturnValue({ ...baseWallet, isConnected: true, address: "GADDR" });
    (useCreateMarket as jest.Mock).mockReturnValue({
      createMarket: jest.fn().mockResolvedValue("market-999"),
      isLoading: false,
      error: null,
    });

    render(<CreateMarketPage />);
    await user.click(screen.getByRole("button", { name: /Create Market/i }));

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith("Market created successfully!", "success");
      expect(push).toHaveBeenCalledWith("/markets/market-999");
    });
  });

  it("shows error toast on failed creation", async () => {
    const user = userEvent.setup();
    const addToast = jest.fn();
    (useToastProvider as jest.Mock).mockReturnValue({ addToast, toasts: [], removeToast: jest.fn() });
    (useWallet as jest.Mock).mockReturnValue({ ...baseWallet, isConnected: true, address: "GADDR" });
    (useCreateMarket as jest.Mock).mockReturnValue({
      createMarket: jest.fn().mockRejectedValue(new Error("Contract error")),
      isLoading: false,
      error: null,
    });

    render(<CreateMarketPage />);
    await user.click(screen.getByRole("button", { name: /Create Market/i }));

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith("Contract error", "error");
    });
    expect(push).not.toHaveBeenCalled();
  });
});
