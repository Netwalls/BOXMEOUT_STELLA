import { renderHook, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useWallet } from "../useWallet";

jest.mock("@stellar/freighter-api", () => ({
  isConnected: jest.fn(),
  getPublicKey: jest.fn(),
  setAllowed: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const freighter = require("@stellar/freighter-api") as {
  isConnected: jest.Mock;
  getPublicKey: jest.Mock;
  setAllowed: jest.Mock;
};

describe("useWallet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when Freighter is not installed", () => {
    it("sets walletNotInstalled to true and does not throw", async () => {
      freighter.isConnected.mockResolvedValue({ error: "Freighter is not installed" });

      const { result } = renderHook(() => useWallet());

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.walletNotInstalled).toBe(true);
      expect(result.current.isConnected).toBe(false);
      expect(result.current.address).toBeNull();
    });

    it("sets walletNotInstalled to true when API throws", async () => {
      freighter.isConnected.mockRejectedValue(new Error("Extension not found"));

      const { result } = renderHook(() => useWallet());

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.walletNotInstalled).toBe(true);
      expect(result.current.isConnected).toBe(false);
    });

    it("sets walletNotInstalled when setAllowed fails after extension check", async () => {
      freighter.isConnected.mockResolvedValue({ isConnected: false });
      freighter.setAllowed.mockResolvedValue({ error: "User rejected" });

      const { result } = renderHook(() => useWallet());

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.walletNotInstalled).toBe(true);
    });
  });

  describe("when Freighter is installed and connected", () => {
    const TEST_ADDRESS = "GABCDE1234567890ABCDE1234567890ABCDE1234567890ABCDE12";

    beforeEach(() => {
      freighter.isConnected.mockResolvedValue({ isConnected: true });
      freighter.getPublicKey.mockResolvedValue({ publicKey: TEST_ADDRESS });
    });

    it("sets address and isConnected on successful connect", async () => {
      const { result } = renderHook(() => useWallet());

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.address).toBe(TEST_ADDRESS);
      expect(result.current.isConnected).toBe(true);
      expect(result.current.walletNotInstalled).toBe(false);
    });

    it("clears address and connected state on disconnect", async () => {
      const { result } = renderHook(() => useWallet());

      await act(async () => {
        await result.current.connect();
      });

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.address).toBeNull();
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe("when Freighter needs authorization", () => {
    const TEST_ADDRESS = "GXYZ1234567890ABCDE1234567890ABCDE1234567890ABCDE1234";

    it("calls setAllowed and connects when extension is present but not yet authorized", async () => {
      freighter.isConnected.mockResolvedValue({ isConnected: false });
      freighter.setAllowed.mockResolvedValue({ isAllowed: true });
      freighter.getPublicKey.mockResolvedValue({ publicKey: TEST_ADDRESS });

      const { result } = renderHook(() => useWallet());

      await act(async () => {
        await result.current.connect();
      });

      expect(freighter.setAllowed).toHaveBeenCalled();
      expect(result.current.address).toBe(TEST_ADDRESS);
      expect(result.current.isConnected).toBe(true);
      expect(result.current.walletNotInstalled).toBe(false);
    });
  });
});
