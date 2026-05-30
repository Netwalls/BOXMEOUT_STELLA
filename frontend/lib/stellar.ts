// ============================================================
// BOXMEOUT — Soroban Transaction Utilities
// Low-level helpers for building, simulating, and submitting
// Soroban contract invocations.
// ============================================================

import {
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  xdr,
} from '@stellar/stellar-sdk';

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const SOROBAN_RPC_URL =
  NETWORK === 'mainnet'
    ? 'https://soroban-rpc.stellar.org'
    : 'https://soroban-testnet.stellar.org';

export const NETWORK_PASSPHRASE =
  NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

/**
 * Assembles a Soroban contract invocation transaction, then calls
 * simulateTransaction on the RPC to obtain the fee estimate and
 * resource footprint. Returns the prepared (simulation-enriched) XDR.
 */
export async function buildContractTransaction(
  sourceAddress: string,
  contractAddress: string,
  method: string,
  args: xdr.ScVal[],
): Promise<string> {
  const server = new SorobanRpc.Server(SOROBAN_RPC_URL);
  const account = await server.getAccount(sourceAddress);
  const contract = new Contract(contractAddress);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  // simulateTransaction fills in the resource footprint and fee estimate
  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
  return preparedTx.toXDR();
}

/**
 * Submits a signed transaction XDR to the network and polls until
 * it reaches SUCCESS or a terminal failure state.
 * Returns the transaction hash on success.
 */
export async function submitTransaction(signedXdr: string): Promise<string> {
  const server = new SorobanRpc.Server(SOROBAN_RPC_URL);
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  const sendRes = await server.sendTransaction(tx);
  if (sendRes.status === 'ERROR') {
    throw new Error(
      `Network rejected transaction: ${sendRes.errorResult?.toString() ?? 'unknown error'}`,
    );
  }

  // Poll for confirmation (max 30 s)
  let getRes = await server.getTransaction(sendRes.hash);
  for (let i = 0; i < 20 && getRes.status === 'NOT_FOUND'; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    getRes = await server.getTransaction(sendRes.hash);
  }

  if (getRes.status !== 'SUCCESS') {
    throw new Error(`Transaction failed with status: ${getRes.status}`);
  }

  return sendRes.hash;
}

/**
 * Converts a stroops value (7 decimal places) to a human-readable XLM string.
 * e.g. 12345678n → "1.2345678"
 */
export function formatTokenAmount(stroops: bigint | string, decimals = 7): string {
  const n = BigInt(stroops);
  const divisor = BigInt(10 ** decimals);
  const whole = n / divisor;
  const frac = (n % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
}

/**
 * Truncates a Stellar address to "GABC...1234" format.
 */
export function truncateAddress(address: string, leading = 4, trailing = 4): string {
  if (address.length <= leading + trailing) return address;
  return `${address.slice(0, leading)}...${address.slice(-trailing)}`;
}

export { HORIZON_URL, SOROBAN_RPC_URL };
