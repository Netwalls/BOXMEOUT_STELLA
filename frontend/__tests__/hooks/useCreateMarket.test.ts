import { renderHook, act, waitFor } from "@testing-library/react";
import { scValToNative } from "@stellar/stellar-sdk";
import { useCreateMarket } from "@/hooks/useCreateMarket";
import type { CreateMarketFormData } from "@/components/CreateMarketForm";
import * as stellar from "@/lib/stellar";
import * as api from "@/lib/api";
import { useWallet } from "@/hooks/useWallet";

jest.mock("@/hooks/useWallet", () => ({ useWallet: jest.fn() }));
jest.mock("@/lib/config", () => ({
  get MARKET_FACTORY_CONTRACT_ID() {
    return mockFactoryId;
  },
}));
jest.mock("@/lib/api", () => ({ createMarketMeta: jest.fn() }));
jest.mock("@/lib/stellar", () => ({
  ...jest.requireActual("@/lib/stellar"),
  buildSorobanInvocation: jest.fn(),
  submitTransaction: jest.fn(),
  decodeScVal: jest.fn(),
}));

// Read lazily by the config mock, so a test can switch the factory off.
let mockFactoryId: string | undefined = "CFACTORYCONTRACTADDRESS";

const FORM_DATA: CreateMarketFormData = {
  fighterAName: "Ali",
  fighterARecord: "20-0",
  fighterANationality: "USA",
  fighterAWeightClass: "HW",
  fighterBName: "Foreman",
  fighterBRecord: "18-2",
  fighterBNationality: "USA",
  fighterBWeightClass: "HW",
  scheduledAt: "2026-07-01T20:00:00Z",
  bettingEndsAt: "2026-07-01T19:00:00Z",
  oracleAddress: "GORACLE",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFactoryId = "CFACTORYCONTRACTADDRESS";
  (useWallet as jest.Mock).mockReturnValue({
    address: "GUSER123",
    signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
  });
  (stellar.submitTransaction as jest.Mock).mockResolvedValue({
    txHash: "hash123",
    ledger: 100,
    returnValue: { type: "Bytes", value: "mkt-new-hex" },
  });
  (stellar.decodeScVal as jest.Mock).mockResolvedValue("mkt-new-hex");
  (api.createMarketMeta as jest.Mock).mockResolvedValue({ success: true });
});

test("happy path: returns new market_id on success", async () => {
  (stellar.buildSorobanInvocation as jest.Mock).mockResolvedValue("unsigned-xdr");

  const { result } = renderHook(() => useCreateMarket());
  let id: string | undefined;

  await act(async () => {
    id = await result.current.createMarket(FORM_DATA);
  });

  expect(id).toBe("mkt-new-hex");
  expect(result.current.error).toBeNull();
  expect(result.current.isLoading).toBe(false);
});

test("builds create_market against the configured factory with typed arguments", async () => {
  (stellar.buildSorobanInvocation as jest.Mock).mockResolvedValue("unsigned-xdr");

  const { result } = renderHook(() => useCreateMarket());

  await act(async () => {
    await result.current.createMarket(FORM_DATA);
  });

  const call = (stellar.buildSorobanInvocation as jest.Mock).mock.calls[0][0];
  expect(call.contractId).toBe("CFACTORYCONTRACTADDRESS");
  expect(call.method).toBe("create_market");
  expect(call.signerAddress).toBe("GUSER123");

  const [caller, fighterA, fighterB, oracle, lockTime, endTime] = call.args;
  expect(caller).toBe("GUSER123");
  expect([fighterA, fighterB, oracle]).toEqual(["Ali", "Foreman", "GORACLE"]);
  expect(lockTime.switch().name).toBe("scvU64");
  expect(scValToNative(lockTime)).toBe(BigInt(Date.parse(FORM_DATA.bettingEndsAt) / 1000));
  expect(endTime.switch().name).toBe("scvU64");
  expect(scValToNative(endTime)).toBe(BigInt(Date.parse(FORM_DATA.scheduledAt) / 1000));
});

test("sends fighter metadata and the tx hash to the backend after confirmation", async () => {
  (stellar.buildSorobanInvocation as jest.Mock).mockResolvedValue("unsigned-xdr");

  const { result } = renderHook(() => useCreateMarket());

  await act(async () => {
    await result.current.createMarket(FORM_DATA);
  });

  expect(api.createMarketMeta).toHaveBeenCalledWith({ ...FORM_DATA, txHash: "hash123" });
});

test("still resolves with the market_id when the metadata sync fails", async () => {
  (stellar.buildSorobanInvocation as jest.Mock).mockResolvedValue("unsigned-xdr");
  (api.createMarketMeta as jest.Mock).mockRejectedValue(new Error("backend down"));
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

  const { result } = renderHook(() => useCreateMarket());
  let id: string | undefined;

  await act(async () => {
    id = await result.current.createMarket(FORM_DATA);
  });

  expect(id).toBe("mkt-new-hex");
  expect(result.current.error).toBeNull();
  expect(consoleError).toHaveBeenCalled();
  consoleError.mockRestore();
});

test("throws when no factory contract is configured", async () => {
  mockFactoryId = undefined;

  const { result } = renderHook(() => useCreateMarket());

  await act(async () => {
    await expect(result.current.createMarket(FORM_DATA)).rejects.toThrow(
      "Market factory contract is not configured"
    );
  });

  expect(stellar.buildSorobanInvocation).not.toHaveBeenCalled();
});

test("error path: sets error on submission failure", async () => {
  const testError = new Error("Submission failed");
  (stellar.buildSorobanInvocation as jest.Mock).mockRejectedValue(testError);

  const { result } = renderHook(() => useCreateMarket());

  await act(async () => {
    await expect(result.current.createMarket(FORM_DATA)).rejects.toThrow("Submission failed");
  });

  expect(result.current.error).toEqual(testError);
  expect(result.current.isLoading).toBe(false);
});

test("edge case: isLoading is true during request, false after completion", async () => {
  let resolve!: (v: unknown) => void;
  (stellar.buildSorobanInvocation as jest.Mock).mockReturnValue(
    new Promise((res) => {
      resolve = res;
    })
  );

  const { result } = renderHook(() => useCreateMarket());

  act(() => {
    result.current.createMarket(FORM_DATA).catch(() => {});
  });

  await waitFor(() => expect(result.current.isLoading).toBe(true));

  await act(async () => {
    resolve("unsigned-xdr");
  });

  await waitFor(() => expect(result.current.isLoading).toBe(false));
});

test("error path: throws when wallet not connected", async () => {
  (useWallet as jest.Mock).mockReturnValue({
    address: null,
    signTransaction: jest.fn(),
  });

  const { result } = renderHook(() => useCreateMarket());

  await act(async () => {
    await expect(result.current.createMarket(FORM_DATA)).rejects.toThrow("Wallet not connected");
  });
});

test("error path: throws when wallet network is mismatched", async () => {
  (useWallet as jest.Mock).mockReturnValue({
    address: "GUSER123",
    isNetworkMismatched: true,
    signTransaction: jest.fn(),
  });

  const { result } = renderHook(() => useCreateMarket());

  await act(async () => {
    await expect(result.current.createMarket(FORM_DATA)).rejects.toThrow(
      "Wallet is connected to the wrong network"
    );
  });

  expect(stellar.buildSorobanInvocation).not.toHaveBeenCalled();
});
