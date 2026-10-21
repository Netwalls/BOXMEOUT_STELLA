import { buildSorobanInvocation } from "../../lib/stellar";

const mockAddSignature = jest.fn();
const mockToXDR = jest.fn(() => "unsigned-xdr");
const mockBuild = jest.fn(() => ({ addSignature: mockAddSignature, toXDR: mockToXDR }));

jest.mock("@stellar/stellar-sdk", () => {
  const txBuilder = () => ({
    addOperation: jest.fn(),
    setTimeout: jest.fn(),
    build: () => mockBuild(),
  });

  return {
    Operation: { invokeHostFunction: jest.fn(() => ({})) },
    Timeout: { INFINITE: 0 },
    nativeToScVal: jest.fn(),
    addressToScVal: jest.fn(),
    TransactionBuilder: jest.fn(txBuilder),
    SorobanRpc: {
      Server: jest.fn(() => ({
        getAccount: jest.fn(async () => ({})),
        simulateTransaction: jest.fn(async () => ({ minResourceFee: "100" })),
      })),
      Api: { isSimulationSuccess: jest.fn(() => true) },
      assembleTransaction: jest.fn(() => ({ operations: [{}] })),
    },
  };
});

describe("buildSorobanInvocation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the built transaction without adding a placeholder signature", async () => {
    const xdr = await buildSorobanInvocation({
      contractId: "CONTRACT",
      method: "place_bet",
      args: [],
      signerAddress: "GSIGNER",
    });

    expect(xdr).toBe("unsigned-xdr");
    expect(mockAddSignature).not.toHaveBeenCalled();
  });
});
