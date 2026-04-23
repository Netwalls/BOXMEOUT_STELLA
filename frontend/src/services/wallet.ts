// ============================================================
// BOXMEOUT — Wallet Service
// Manages Freighter wallet connection and Stellar transactions.
// ============================================================

import {
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  Address,
  xdr,
} from '@stellar/stellar-sdk';
import type { BetSide } from '../types';

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const SOROBAN_RPC_URL =
  NETWORK === 'mainnet'
    ? 'https://soroban-rpc.stellar.org'
    : 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

const LS_KEY = 'boxmeout_wallet_address';

// ─── Transaction helper ───────────────────────────────────────────────────────

async function buildAndSubmit(
  contractAddress: string,
  method: string,
  args: xdr.ScVal[],
): Promise<string> {
  const address = getConnectedAddress();
  if (!address) throw new Error('WalletNotConnected');

  const server = new SorobanRpc.Server(SOROBAN_RPC_URL);
  const account = await server.getAccount(address);
  const contract = new Contract(contractAddress);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const preparedTx = await server.prepareTransaction(tx);
  const txXdr = preparedTx.toXDR();

  const freighter = (window as any).freighter;
  if (!freighter) throw new Error('WalletNotInstalledError');

  const { signedTxXdr } = await freighter.signTransaction(txXdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const submitRes = await server.sendTransaction(
    TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE),
  );

  if (submitRes.status === 'ERROR') {
    throw new Error(`TxSubmissionError: ${submitRes.errorResult?.toXDR()}`);
  }

  // Poll for confirmation
  let getRes = await server.getTransaction(submitRes.hash);
  for (let i = 0; i < 20 && getRes.status === 'NOT_FOUND'; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    getRes = await server.getTransaction(submitRes.hash);
  }

  if (getRes.status !== 'SUCCESS') {
    throw new Error(`TxSubmissionError: transaction ${getRes.status}`);
  }

  return submitRes.hash;
}

// ─── Wallet connection ────────────────────────────────────────────────────────

export async function connectWallet(): Promise<string> {
  if (typeof window === 'undefined') throw new Error('Browser only');
  const freighter = (window as any).freighter;
  const albedo = (window as any).albedo;
  if (freighter) {
    await freighter.requestAccess();
    const { publicKey } = await freighter.getPublicKey();
    localStorage.setItem(LS_KEY, publicKey);
    return publicKey;
  }
  if (albedo) {
    const { pubkey } = await albedo.publicKey({ token: 'boxmeout' });
    localStorage.setItem(LS_KEY, pubkey);
    return pubkey;
  }
  throw new Error('WalletNotInstalledError: Install Freighter or Albedo');
}

export function disconnectWallet(): void {
  localStorage.removeItem(LS_KEY);
}

export function getConnectedAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LS_KEY);
}

// ─── Contract invocations ─────────────────────────────────────────────────────

export async function submitBet(
  market_contract_address: string,
  side: BetSide,
  amount_xlm: number,
): Promise<string> {
  return buildAndSubmit(market_contract_address, 'place_bet', [
    nativeToScVal(side, { type: 'symbol' }),
    nativeToScVal(xlmToStroops(amount_xlm), { type: 'i128' }),
  ]);
}

export async function submitClaim(market_contract_address: string): Promise<string> {
  const bettor = getConnectedAddress();
  if (!bettor) throw new Error('WalletNotConnected');
  const token = process.env.NEXT_PUBLIC_XLM_TOKEN_ADDRESS;
  if (!token) throw new Error('NEXT_PUBLIC_XLM_TOKEN_ADDRESS not set');
  return buildAndSubmit(market_contract_address, 'claim_winnings', [
    new Address(bettor).toScVal(),
    new Address(token).toScVal(),
  ]);
}

export async function submitRefund(market_contract_address: string): Promise<string> {
  const bettor = getConnectedAddress();
  if (!bettor) throw new Error('WalletNotConnected');
  const token = process.env.NEXT_PUBLIC_XLM_TOKEN_ADDRESS;
  if (!token) throw new Error('NEXT_PUBLIC_XLM_TOKEN_ADDRESS not set');
  return buildAndSubmit(market_contract_address, 'claim_refund', [
    new Address(bettor).toScVal(),
    new Address(token).toScVal(),
  ]);
}

export interface CreateMarketParams {
  matchId: string;
  fighterA: string;
  fighterB: string;
  weightClass: string;
  venue: string;
  titleFight: boolean;
  scheduledAt: string;
  minBetXlm: number;
  maxBetXlm: number;
  feeBps: number;
  lockBeforeMinutes: number;
}

export async function createMarket(params: CreateMarketParams): Promise<string> {
  const factoryAddress = process.env.NEXT_PUBLIC_MARKET_FACTORY_ADDRESS;
  if (!factoryAddress) throw new Error('NEXT_PUBLIC_MARKET_FACTORY_ADDRESS not set');
  return buildAndSubmit(factoryAddress, 'create_market', [
    nativeToScVal(params.matchId, { type: 'string' }),
    nativeToScVal(params.fighterA, { type: 'string' }),
    nativeToScVal(params.fighterB, { type: 'string' }),
    nativeToScVal(params.weightClass, { type: 'string' }),
    nativeToScVal(params.venue, { type: 'string' }),
    nativeToScVal(params.titleFight, { type: 'bool' }),
    nativeToScVal(BigInt(new Date(params.scheduledAt).getTime()), { type: 'u64' }),
    nativeToScVal(xlmToStroops(params.minBetXlm), { type: 'i128' }),
    nativeToScVal(xlmToStroops(params.maxBetXlm), { type: 'i128' }),
    nativeToScVal(params.feeBps, { type: 'u32' }),
    nativeToScVal(params.lockBeforeMinutes, { type: 'u32' }),
  ]);
}

// ─── Balance ──────────────────────────────────────────────────────────────────

export async function getWalletBalance(): Promise<number> {
  const address = getConnectedAddress();
  if (!address) return 0;
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
    if (!res.ok) return 0;
    const data = await res.json();
    const native = (data.balances as any[]).find((b: any) => b.asset_type === 'native');
    return native ? parseFloat(native.balance) : 0;
  } catch {
    return 0;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function xlmToStroops(xlm: number): bigint {
  const [whole, frac = ''] = xlm.toString().split('.');
  const fracPadded = frac.slice(0, 7).padEnd(7, '0');
  return BigInt(whole) * 10_000_000n + BigInt(fracPadded);
}

export function stroopsToXlm(stroops: bigint | string): number {
  return Number(BigInt(stroops)) / 10_000_000;
}
