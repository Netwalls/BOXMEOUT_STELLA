import type { Transaction } from "@stellar/stellar-sdk";
import { ContractError, ContractErrorException, parseContractErrorCode } from "./errors";

// The SDK is large; load it only when a transaction is actually built or decoded
// so pages that just read the network constants below don't ship it.
const loadSdk = (): Promise<typeof import("@stellar/stellar-sdk")> => import("@stellar/stellar-sdk");

// ─── CONFIG ───────────────────────────────────────────────────────────────────

/**
 * The Stellar network this app is configured to operate against.
 * Wallet network mismatches are detected by comparing against this passphrase.
 */
export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

export const NETWORK_NAME = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "TESTNET";

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface SorobanInvokeParams {
  contractId: string;
  method: string;
  args: unknown[];
  signerAddress: string;
}

export interface TransactionResult {
  txHash: string;
  ledger: number;
  returnValue: unknown;
}

// ─── ERROR DECODING ───────────────────────────────────────────────────────────

/**
 * Decodes a raw Soroban host error into a friendly `ContractErrorException`.
 * Non-contract errors are returned unchanged so callers can rethrow them.
 */
function decodeContractError(error: unknown): unknown {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const code = parseContractErrorCode(raw);

  if (code !== null) {
    return new ContractErrorException(code);
  }

  return error;
}

/**
 * Extracts the raw error string from a failed simulation result.
 */
function simulationErrorText(simResult: unknown): string {
  const result = simResult as { error?: unknown };
  const err = result?.error;

  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") return JSON.stringify(err);

  return "Transaction simulation failed";
}

// ─── FUNCTIONS ────────────────────────────────────────────────────────────────

/**
 * Builds a Soroban contract invocation XDR string ready for wallet signing.
 * Fetches the current account sequence number from Horizon.
 * Simulates the transaction via Soroban RPC to populate the auth footprint.
 */
export async function buildSorobanInvocation(
  params: SorobanInvokeParams
): Promise<string> {
  const { Operation, SorobanRpc, TransactionBuilder, Timeout, nativeToScVal, addressToScVal } =
    await loadSdk();
  const server = new SorobanRpc.Server(SOROBAN_RPC_URL, {
    allowHttp: true,
  });

  const operation = Operation.invokeHostFunction({
    hostFunction: {
      functionName: params.method,
      args: params.args.map((arg) => {
        if (typeof arg === "bigint") return nativeToScVal(arg);
        if (typeof arg === "string") {
          try {
            return addressToScVal(arg);
          } catch {
            return nativeToScVal(Number(arg));
          }
        }
        if (typeof arg === "number") return nativeToScVal(arg);
        if (Array.isArray(arg)) {
          return nativeToScVal(arg);
        }
        return arg as any;
      }),
    },
    auth: [],
  });

  const account = await server.getAccount(params.signerAddress);

  const transaction = new TransactionBuilder(account, {
    networkPassphrase: NETWORK_PASSPHRASE,
    fee: "0",
  });

  transaction.addOperation(operation);
  transaction.setTimeout(Timeout.INFINITE);

  const tx = transaction.build();

  const simResult = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationSuccess(simResult)) {
    const fee = simResult.minResourceFee;
    const preparedTx = SorobanRpc.assembleTransaction(tx, simResult);

    const withFee = new TransactionBuilder(account, {
      networkPassphrase: NETWORK_PASSPHRASE,
      fee: fee,
    });

    withFee.addOperation(preparedTx.operations[0]);
    withFee.setTimeout(Timeout.INFINITE);

    const finalTx = withFee.build();
    finalTx.addSignature(params.signerAddress, Buffer.alloc(64).fill(0));

    return finalTx.toXDR();
  }

  throw decodeContractError(new Error(simulationErrorText(simResult)));
}

/**
 * Submits a signed XDR transaction to Soroban RPC and waits for ledger confirmation.
 * Returns the TransactionResult containing txHash, ledger, and return value.
 */
export async function submitTransaction(signedXdr: string): Promise<TransactionResult> {
  const { SorobanRpc, TransactionBuilder } = await loadSdk();
  const server = new SorobanRpc.Server(SOROBAN_RPC_URL, {
    allowHttp: true,
  });

  const transaction = TransactionBuilder.fromXDR(
    signedXdr,
    NETWORK_PASSPHRASE
  ) as Transaction;

  const response = await server.sendTransaction(transaction);

  if (response.status !== "PENDING") {
    throw decodeContractError(
      new Error(`Transaction submission failed with status: ${response.status}`)
    );
  }

  const hash = transaction.hash();
  let result = await server.getTransaction(hash);

  const maxAttempts = 10;
  let attempts = 0;

  while (result.status === "PENDING" || result.status === "NOT_FOUND") {
    attempts++;
    if (attempts > maxAttempts) {
      throw new Error(`Transaction submission timed out after ${maxAttempts} attempts`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));

    result = await server.getTransaction(hash);
  }

  if (result.status !== "SUCCESS") {
    throw decodeContractError(
      new Error(`Transaction failed with status: ${result.status}`)
    );
  }

  return {
    txHash: hash.toString("hex"),
    ledger: result.ledger,
    returnValue: result.returnValue,
  };
}

/**
 * Decodes a Soroban return value (ScVal) into a plain JavaScript value.
 * Handles i128, Bytes, Address, Vec, Map, and Option types.
 */
export async function decodeScVal(scVal: unknown): Promise<unknown> {
  if (!scVal) {
    return scVal;
  }

  const { scValToNative } = await loadSdk();

  try {
    return scValToNative(scVal as any);
  } catch (error) {
    if (error instanceof Error && error.message.includes("LedgerKey")) {
      return null;
    }

    if (error instanceof Error && error.message.includes("None")) {
      return null;
    }

    console.error("Error decoding ScVal:", error);
    throw error;
  }
}

/**
 * Converts a XLM amount in stroops (bigint) to a human-readable string.
 * e.g. 10_000_000n -> "1"
 */
export function stroopsToXlm(stroops: bigint): string {
  const xlm = Number(stroops) / 10000000;

  return xlm.toString();
}

/**
 * Converts a human-readable XLM string to stroops (bigint).
 * e.g. "1.5" -> 15_000_000n
 */
export function xlmToStroops(xlm: string): bigint {
  const parts = xlm.split(".");
  const integer = BigInt(parts[0] || "0");
  let fractional = "0";

  if (parts.length > 1) {
    fractional = parts[1];
    if (fractional.length > 7) {
      fractional = fractional.slice(0, 7);
    } else if (fractional.length < 7) {
      fractional = fractional.padEnd(7, "0");
    }
  }

  const stroops = integer * BigInt(10000000) + BigInt(fractional);

  return stroops;
}

/**
 * Truncates a Stellar address for display.
 * e.g. "GABCDEF...WXYZ" (first 6 + last 4 chars)
 */
export function truncateAddress(address: string): string {
  if (!address || address.length <= 10) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
