import {
  Account,
  Address,
  Keypair,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
  scValToNative,
} from "@stellar/stellar-sdk";
import {
  buildSorobanInvocation,
  NETWORK_PASSPHRASE,
  submitTransaction,
  TX_EXPIRED_MESSAGE,
  TX_TIMEOUT_SECONDS,
} from "@/lib/stellar";

const mockServer = {
  getAccount: jest.fn(),
  simulateTransaction: jest.fn(),
  sendTransaction: jest.fn(),
  getTransaction: jest.fn(),
};

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");

  return {
    ...actual,
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: jest.fn(() => mockServer),
      assembleTransaction: (tx: { toEnvelope: () => any }) => ({
        operations: tx.toEnvelope().v1().tx().operations(),
      }),
      Api: { ...actual.SorobanRpc.Api, isSimulationSuccess: () => true },
    },
  };
});

const SIGNER = Keypair.random().publicKey();
const CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 1));

beforeEach(() => {
  jest.clearAllMocks();
  mockServer.getAccount.mockResolvedValue(new Account(SIGNER, "1"));
  mockServer.simulateTransaction.mockResolvedValue({ minResourceFee: "100" });
});

async function buildAndDecode(args: unknown[]) {
  const xdr = await buildSorobanInvocation({
    contractId: CONTRACT_ID,
    method: "place_bet",
    args,
    signerAddress: SIGNER,
  });

  return TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE) as Transaction;
}

describe("buildSorobanInvocation encoding", () => {
  it("encodes a single invoke-contract operation targeting the given contract", async () => {
    const tx = await buildAndDecode([]);

    expect(tx.operations).toHaveLength(1);
    expect(tx.operations[0].type).toBe("invokeHostFunction");

    const invoke = (tx.operations[0] as Operation.InvokeHostFunction).func.invokeContract();
    expect(Address.fromScAddress(invoke.contractAddress()).toString()).toBe(CONTRACT_ID);
  });

  it("uses the method name as the invoked function name", async () => {
    const tx = await buildAndDecode([]);

    const invoke = (tx.operations[0] as Operation.InvokeHostFunction).func.invokeContract();
    expect(invoke.functionName().toString()).toBe("place_bet");
  });

  it("rejects a contract id that is not a C-strkey before touching the network", async () => {
    await expect(
      buildSorobanInvocation({
        contractId: "market-1",
        method: "place_bet",
        args: [],
        signerAddress: SIGNER,
      })
    ).rejects.toThrow("Invalid contract address: market-1");

    expect(mockServer.getAccount).not.toHaveBeenCalled();
  });

  it("converts each argument into the matching ScVal type", async () => {
    const tx = await buildAndDecode([SIGNER, 100n]);

    const invoke = (tx.operations[0] as Operation.InvokeHostFunction).func.invokeContract();
    const [addressArg, amountArg] = invoke.args();

    expect(addressArg.switch().name).toBe("scvAddress");
    expect(Address.fromScVal(addressArg).toString()).toBe(SIGNER);
    expect(scValToNative(amountArg)).toBe(100n);
  });
});

describe("transaction validity window", () => {
  it("sets maxTime to the bounded timeout from the moment of building", async () => {
    const before = Math.floor(Date.now() / 1000);
    const tx = await buildAndDecode([]);
    const after = Math.floor(Date.now() / 1000);

    const maxTime = Number(tx.timeBounds?.maxTime);
    expect(maxTime).toBeGreaterThanOrEqual(before + TX_TIMEOUT_SECONDS);
    expect(maxTime).toBeLessThanOrEqual(after + TX_TIMEOUT_SECONDS);
  });

  it("maps a txTooLate rejection to the friendly expiry message", async () => {
    const signedXdr = await buildSorobanInvocation({
      contractId: CONTRACT_ID,
      method: "place_bet",
      args: [],
      signerAddress: SIGNER,
    });

    mockServer.sendTransaction.mockResolvedValue({
      status: "ERROR",
      errorResult: { result: () => ({ switch: () => ({ name: "txTooLate" }) }) },
    });

    const onStatus = jest.fn();
    await expect(submitTransaction(signedXdr, onStatus)).rejects.toThrow(TX_EXPIRED_MESSAGE);
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: TX_EXPIRED_MESSAGE })
    );
  });
});
