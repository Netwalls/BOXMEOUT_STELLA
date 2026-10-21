import type { Transaction, xdr } from "@stellar/stellar-sdk";
import { ContractErrorException, parseContractErrorCode } from "./errors";

// The SDK is large; load it only when a transaction is actually built or decoded
// so pages that just read the network constants below don't ship it.
const loadSdk = (): Promise<typeof import("@stellar/stellar-sdk")> => import("@stellar/stellar-sdk");

// ─── CONFIG ───────────────────────────────────────────────────────────────────

/**
 * The Stellar network this app is configured to operate against.
 * Single source of truth for the configured network name. Normalized to
 * lowercase so case-sensitive comparisons (e.g. against Freighter's network
 * string) don't trigger a false mismatch banner.
 */
export const NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet").toLowerCase();

/**
 * Canonical network passphrases keyed by normalized network name.
 * Used to derive the passphrase from the network name when an explicit
 * NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE is not provided.
 */
const NETWORK_PASSPHRASES: Record<string, string> = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
  futurenet: "Test SDF Future Network ; October 2022",
};

/**
 * The Stellar network passphrase this app is configured to operate against.
 * Wallet network mismatches are detected by comparing against this passphrase.
 * Falls back to the passphrase derived from NETWORK when not explicitly set.
 */
export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ??
  NETWORK_PASSPHRASES[NETWORK] ??
  NETWORK_PASSPHRASES.testnet;

export const NETWORK_NAME = NETWORK;

/**
 * Compares two network names case-insensitively.
 * Returns true when both refer to the same network regardless of casing.
 */
export function isSameNetwork(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) {
    return false;
  }

  return a.toLowerCase() === b.toLowerCase();
}

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/**
 * Decides whether the Soroban RPC client may use plain HTTP for `url`.
 * Plain HTTP is allowed only for localhost/127.0.0.1 outside production and
 * off mainnet. Any other non-HTTPS URL throws, so transactions cannot be sent
 * unencrypted by a misconfigured environment variable.
 */
export function allowHttpForRpc(
  url: string,
  options: { production?: boolean; network?: string } = {}
): boolean {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const network = (options.network ?? NETWORK).toLowerCase();
  const parsed = new URL(url);

  if (parsed.protocol === "https:") {
    return false;
  }

  const isLocalDevelopment =
    parsed.protocol === "http:" &&
    LOCAL_HOSTNAMES.has(parsed.hostname) &&
    !production &&
    network !== "mainnet";

  if (isLocalDevelopment) {
    return true;
  }

  throw new Error(`Insecure Soroban RPC URL rejected (HTTPS required): ${url}`);
}

/** Options for `new SorobanRpc.Server`, validated against the configured RPC URL. */
function rpcServerOptions(): { allowHttp: boolean } {
  return { allowHttp: allowHttpForRpc(SOROBAN_RPC_URL) };
}

/**
 * Base URL for the stellar.expert explorer, derived from the configured network.
 * Used to link a transaction hash to its on-chain record.
 */
export const STELLAR_EXPERT_BASE_URL =
  NETWORK_NAME.toUpperCase() === "PUBLIC" || NETWORK_NAME.toUpperCase() === "MAINNET"
    ? "https://stellar.expert/explorer/public"
    : "https://stellar.expert/explorer/testnet";

/**
 * Builds a stellar.expert URL for a given transaction hash.
 */
export function stellarExpertTxUrl(txHash: string): string {
  return `${STELLAR_EXPERT_BASE_URL}/tx/${txHash}`;
}

/**
 * Builds a stellar.expert URL for a given contract address / ID.
 */
export function stellarExpertContractUrl(contractId: string): string {
  return `${STELLAR_EXPERT_BASE_URL}/contract/${contractId}`;
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface SorobanInvokeParams {
  contractId: string;
  method: string;
  args: xdr.ScVal[];
  signerAddress: string;
}

export interface TransactionResult {
  txHash: string;
  ledger: number;
  returnValue: unknown;
}

/**
 * Lifecycle states reported while waiting for a transaction to confirm.
 * - `pending`: submitted, not yet included in a ledger
 * - `success`: included in a ledger and executed successfully
 * - `failed`: included in a ledger but execution failed
 * - `timeout`: not confirmed within the bounded wait window
 */
export type TransactionStatus = "pending" | "success" | "failed" | "timeout";

export interface TransactionStatusUpdate {
  status: TransactionStatus;
  txHash: string;
  ledger?: number;
  error?: string;
}

/**
 * Thrown when a transaction is not confirmed within the bounded timeout.
 * Carries the tx hash so callers can still surface an explorer link.
 */
export class TransactionTimeoutError extends Error {
  readonly txHash: string;

  constructor(txHash: string, timeoutMs: number) {
    super(`Transaction ${txHash} was not confirmed within ${timeoutMs}ms`);
    this.name = "TransactionTimeoutError";
    this.txHash = txHash;
  }
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
  const { Operation, SorobanRpc, TransactionBuilder, Timeout } = await loadSdk();
  const server = new SorobanRpc.Server(SOROBAN_RPC_URL, rpcServerOptions());

  const operation = Operation.invokeHostFunction({
    hostFunction: {
      functionName: params.method,
      args: params.args,
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

    // Returned unsigned on purpose: the wallet adds the real signature, so no
    // placeholder signature is attached here.
    const finalTx = withFee.build();

    return finalTx.toXDR();
  }

  throw decodeContractError(new Error(simulationErrorText(simResult)));
}

/**
 * Submits a signed XDR transaction to Soroban RPC and waits for ledger confirmation.
 * Polls `getTransaction` with exponential backoff, bounded to a 30s timeout, and
 * reports each state transition (pending/success/failed/timeout) via `onStatus`.
 * Returns the TransactionResult containing txHash, ledger, and return value.
 */
export async function submitTransaction(
  signedXdr: string,
  onStatus?: (update: TransactionStatusUpdate) => void
): Promise<TransactionResult> {
  const { SorobanRpc, TransactionBuilder } = await loadSdk();
  const server = new SorobanRpc.Server(SOROBAN_RPC_URL, rpcServerOptions());

  const transaction = TransactionBuilder.fromXDR(
    signedXdr,
    NETWORK_PASSPHRASE
  ) as Transaction;

  const hash = transaction.hash();
  const txHash = hash.toString("hex");

  const response = await server.sendTransaction(transaction);

  if (response.status !== "PENDING") {
    const error = `Transaction submission failed with status: ${response.status}`;
    onStatus?.({ status: "failed", txHash, error });
    throw decodeContractError(new Error(error));
  }

  onStatus?.({ status: "pending", txHash });

  const TIMEOUT_MS = 30_000;
  const INITIAL_DELAY_MS = 1_000;
  const MAX_DELAY_MS = 5_000;
  const startedAt = Date.now();
  let delay = INITIAL_DELAY_MS;

  let result = await server.getTransaction(hash);

  while (result.status === "PENDING" || result.status === "NOT_FOUND") {
    if (Date.now() - startedAt >= TIMEOUT_MS) {
      onStatus?.({ status: "timeout", txHash });
      throw new TransactionTimeoutError(txHash, TIMEOUT_MS);
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, MAX_DELAY_MS);

    result = await server.getTransaction(hash);
  }

  if (result.status !== "SUCCESS") {
    const error = `Transaction failed with status: ${result.status}`;
    onStatus?.({ status: "failed", txHash, error });
    throw decodeContractError(new Error(error));
  }

  onStatus?.({ status: "success", txHash, ledger: result.ledger });

  return {
    txHash,
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
    return scValToNative(scVal as xdr.ScVal);
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

// ─── SCVAL ARGUMENT HELPERS ───────────────────────────────────────────────────
// Each helper states the Soroban type explicitly, so no value is guessed at
// runtime. They are async because the SDK is loaded lazily.

/** Soroban `i128`. Keeps amounts above Number.MAX_SAFE_INTEGER exact. */
export async function i128(value: bigint): Promise<xdr.ScVal> {
  const { nativeToScVal } = await loadSdk();

  return nativeToScVal(value, { type: "i128" });
}

/** Soroban `u64`. */
export async function u64(value: bigint): Promise<xdr.ScVal> {
  const { nativeToScVal } = await loadSdk();

  return nativeToScVal(value, { type: "u64" });
}

/** Soroban `u32`. */
export async function u32(value: number): Promise<xdr.ScVal> {
  const { nativeToScVal } = await loadSdk();

  return nativeToScVal(value, { type: "u32" });
}

/** Soroban `Address` from a G… account or C… contract strkey. */
export async function address(strkey: string): Promise<xdr.ScVal> {
  const { Address } = await loadSdk();

  return new Address(strkey).toScVal();
}

/** Soroban `Bytes` from a hex string. Rejects odd length and non-hex characters. */
export async function bytes(hex: string): Promise<xdr.ScVal> {
  if (!/^([0-9a-fA-F]{2})*$/.test(hex)) {
    throw new TypeError("bytes() expects an even-length hex string");
  }

  const { xdr } = await loadSdk();

  return xdr.ScVal.scvBytes(Buffer.from(hex, "hex"));
}

/** Soroban `Symbol`. */
export async function sym(value: string): Promise<xdr.ScVal> {
  const { nativeToScVal } = await loadSdk();

  return nativeToScVal(value, { type: "symbol" });
}

/** Soroban `String`. */
export async function str(value: string): Promise<xdr.ScVal> {
  const { nativeToScVal } = await loadSdk();

  return nativeToScVal(value, { type: "string" });
}

const STROOPS_PER_XLM = 10_000_000n;
const STELLAR_DECIMALS = 7;
const I128_MAX = 2n ** 127n - 1n;

/**
 * Thrown by `xlmToStroops` when user input cannot be converted exactly.
 * `reason` lets callers pick a message without parsing the text.
 */
export class InvalidAmountError extends Error {
  readonly reason: "empty" | "negative" | "non-numeric" | "over-precision" | "out-of-range";

  constructor(reason: InvalidAmountError["reason"], message: string) {
    super(message);
    this.name = "InvalidAmountError";
    this.reason = reason;
  }
}

/**
 * Converts a XLM amount in stroops (bigint) to an exact decimal string.
 * Uses BigInt arithmetic only, so no float artefacts appear.
 * e.g. 10_000_000n -> "1", 1n -> "0.0000001", -15_000_000n -> "-1.5"
 */
export function stroopsToXlm(stroops: bigint): string {
  const sign = stroops < 0n ? "-" : "";
  const magnitude = stroops < 0n ? -stroops : stroops;
  const whole = magnitude / STROOPS_PER_XLM;
  const fraction = (magnitude % STROOPS_PER_XLM)
    .toString()
    .padStart(STELLAR_DECIMALS, "0")
    .replace(/0+$/, "");

  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

/**
 * Converts a human-readable XLM string to stroops (bigint), exactly.
 * e.g. "1.5" -> 15_000_000n
 * Throws `InvalidAmountError` for empty, negative, non-numeric, over-precise
 * (more than 7 significant decimals) or out-of-range input.
 */
export function xlmToStroops(xlm: string): bigint {
  const input = xlm.trim();

  if (input === "") {
    throw new InvalidAmountError("empty", "Amount is required");
  }

  if (input.startsWith("-")) {
    throw new InvalidAmountError("negative", "Amount cannot be negative");
  }

  if (!/^(\d+\.?\d*|\.\d+)$/.test(input)) {
    throw new InvalidAmountError("non-numeric", `"${input}" is not a valid amount`);
  }

  const [whole, fraction = ""] = input.split(".");

  if (/[1-9]/.test(fraction.slice(STELLAR_DECIMALS))) {
    throw new InvalidAmountError(
      "over-precision",
      `Amount supports at most ${STELLAR_DECIMALS} decimal places`
    );
  }

  const stroops =
    BigInt(whole || "0") * STROOPS_PER_XLM +
    BigInt(fraction.slice(0, STELLAR_DECIMALS).padEnd(STELLAR_DECIMALS, "0"));

  if (stroops > I128_MAX) {
    throw new InvalidAmountError("out-of-range", "Amount is too large");
  }

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
