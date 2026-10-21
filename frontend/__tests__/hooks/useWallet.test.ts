import { renderHook, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useWallet, WalletProvider, UserRejectedError } from "@/hooks/useWallet";
import { NETWORK_PASSPHRASE } from "@/lib/stellar";

jest.mock("@stellar/freighter-api", () => ({
  isConnected: jest.fn(),
  requestAccess: jest.fn(),
  getAddress: jest.fn(),
  getNetwork: jest.fn(),
  signTransaction: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const freighter = require("@stellar/freighter-api") as {
  isConnected: jest.Mock;
  requestAccess: jest.Mock;
  getAddress: jest.Mock;
  getNetwork: jest.Mock;
  signTransaction: jest.Mock;
};

describe("useWallet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    freighter.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: NETWORK_PASSPHRASE });
  });

  it("throws when rendered outside of WalletProvider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useWallet())).toThrow(
      "useWallet must be used within a WalletProvider"
    );
    spy.mockRestore();
  });

  describe("when Freighter is not installed", () => {
    it("sets walletNotInstalled to true and does not throw", async () => {
      freighter.isConnected.mockResolvedValue({ isConnected: false });

      const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.walletNotInstalled).toBe(true);
      expect(result.current.isConnected).toBe(false);
      expect(result.current.address).toBeNull();
      expect(freighter.requestAccess).not.toHaveBeenCalled();
    });

    it("sets walletNotInstalled to true when isConnected returns an error", async () => {
      freighter.isConnected.mockResolvedValue({
        isConnected: false,
        error: { code: -1, message: "Freighter is not installed" },
      });

      const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.walletNotInstalled).toBe(true);
    });

    it("sets walletNotInstalled to true when API throws", async () => {
      freighter.isConnected.mockRejectedValue(new Error("Extension not found"));

      const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.walletNotInstalled).toBe(true);
      expect(result.current.isConnected).toBe(false);
    });

    it("sets walletNotInstalled when the user rejects access", async () => {
      freighter.isConnected.mockResolvedValue({ isConnected: true });
      freighter.requestAccess.mockResolvedValue({
        address: "",
        error: { code: -4, message: "User rejected" },
      });

      const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.walletNotInstalled).toBe(true);
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe("when Freighter is installed and access is granted", () => {
    const TEST_ADDRESS = "GABCDE1234567890ABCDE1234567890ABCDE1234567890ABCDE12";

    beforeEach(() => {
      freighter.isConnected.mockResolvedValue({ isConnected: true });
      freighter.requestAccess.mockResolvedValue({ address: TEST_ADDRESS });
    });

    it("sets address, isConnected and network on successful connect", async () => {
      const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

      await act(async () => {
        await result.current.connect();
      });

      expect(freighter.requestAccess).toHaveBeenCalled();
      expect(result.current.address).toBe(TEST_ADDRESS);
      expect(result.current.isConnected).toBe(true);
      expect(result.current.walletNotInstalled).toBe(false);
      expect(result.current.networkPassphrase).toBe(NETWORK_PASSPHRASE);
      expect(result.current.isNetworkMismatched).toBe(false);
    });

    it("clears address and connected state on disconnect", async () => {
      const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

      await act(async () => {
        await result.current.connect();
      });

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.address).toBeNull();
      expect(result.current.isConnected).toBe(false);
    });

    it("signs a transaction with the connected address and network", async () => {
      freighter.signTransaction.mockResolvedValue({ signedTxXdr: "signed-xdr", signerAddress: TEST_ADDRESS });

      const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

      await act(async () => {
        await result.current.connect();
      });

      await expect(result.current.signTransaction("unsigned-xdr")).resolves.toBe("signed-xdr");
      expect(freighter.signTransaction).toHaveBeenCalledWith("unsigned-xdr", {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: TEST_ADDRESS,
      });
    });

    it("throws a typed UserRejectedError when the user rejects signing", async () => {
      freighter.signTransaction.mockResolvedValue({
        signedTxXdr: "",
        signerAddress: "",
        error: { code: -4, message: "User declined access" },
      });

      const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

      await act(async () => {
        await result.current.connect();
      });

      await expect(result.current.signTransaction("unsigned-xdr")).rejects.toBeInstanceOf(UserRejectedError);
    });

    it("maps a rejected signTransaction promise to UserRejectedError", async () => {
      freighter.signTransaction.mockRejectedValue(new Error("User rejected the request"));

      const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

      await act(async () => {
        await result.current.connect();
      });

      await expect(result.current.signTransaction("unsigned-xdr")).rejects.toBeInstanceOf(UserRejectedError);
    });
  });

  it("throws when signing without a connected wallet", async () => {
    const { result } = renderHook(() => useWallet(), { wrapper: WalletProvider });

    await expect(result.current.signTransaction("unsigned-xdr")).rejects.toThrow("Wallet not connected");
    expect(freighter.signTransaction).not.toHaveBeenCalled();
  });
});
