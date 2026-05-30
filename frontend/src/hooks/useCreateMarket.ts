import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { nativeToScVal, Address, xdr } from '@stellar/stellar-sdk';
import type { TxStatus } from '../types';
import type { CreateMarketParams } from '../services/wallet';
import { buildContractTransaction, submitTransaction, NETWORK_PASSPHRASE } from '../../lib/stellar';
import { getConnectedAddress } from '../services/wallet';

export interface UseCreateMarketResult {
  createMarket: (params: CreateMarketParams) => Promise<void>;
  txStatus: TxStatus['status'];
  txHash: string | null;
  error: string | null;
}

function xlmToStroops(xlm: number): bigint {
  const [whole, frac = ''] = xlm.toString().split('.');
  return BigInt(whole) * BigInt(10_000_000) + BigInt(frac.slice(0, 7).padEnd(7, '0'));
}

function buildArgs(params: CreateMarketParams): xdr.ScVal[] {
  return [
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
  ];
}

/** Extracts the new market ID from the transaction result ScVal. */
function parseMarketId(resultXdr: string): string {
  try {
    const val = xdr.ScVal.fromXDR(resultXdr, 'base64');
    // Contract returns the market address as a string ScVal
    if (val.switch() === xdr.ScValType.scvString()) {
      return val.str().toString();
    }
    if (val.switch() === xdr.ScValType.scvAddress()) {
      return Address.fromScVal(val).toString();
    }
  } catch {
    // fall through
  }
  throw new Error('Could not parse market ID from transaction result');
}

export function useCreateMarket(): UseCreateMarketResult {
  const router = useRouter();
  const [txStatus, setTxStatus] = useState<TxStatus['status']>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createMarket = useCallback(async (params: CreateMarketParams) => {
    const factoryAddress = process.env.NEXT_PUBLIC_MARKET_FACTORY_ADDRESS;
    if (!factoryAddress) throw new Error('NEXT_PUBLIC_MARKET_FACTORY_ADDRESS not set');

    const address = getConnectedAddress();
    if (!address) throw new Error('Wallet not connected');

    setTxStatus('pending');
    setTxHash(null);
    setError(null);

    try {
      // 1. Build + simulate
      const preparedXdr = await buildContractTransaction(
        address,
        factoryAddress,
        'create_market',
        buildArgs(params),
      );

      // 2. Sign with Freighter
      const freighter = (window as any).freighter;
      if (!freighter) throw new Error('Freighter not installed');

      const { signedTxXdr } = await freighter.signTransaction(preparedXdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      // 3. Submit and poll
      const hash = await submitTransaction(signedTxXdr);
      setTxHash(hash);

      // 4. Parse market ID from result
      const { SorobanRpc } = await import('@stellar/stellar-sdk');
      const server = new SorobanRpc.Server(
        process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
          ? 'https://soroban-rpc.stellar.org'
          : 'https://soroban-testnet.stellar.org',
      );
      const txResult = await server.getTransaction(hash);
      if (txResult.status !== 'SUCCESS') throw new Error('Transaction did not succeed');

      const resultXdr = (txResult as any).returnValue
        ? (txResult as any).returnValue.toXDR('base64')
        : '';
      const marketId = parseMarketId(resultXdr);

      setTxStatus('success');
      router.push(`/markets/${marketId}`);
    } catch (e: any) {
      setTxStatus('error');
      setError(e?.message ?? String(e));
    }
  }, [router]);

  return { createMarket, txStatus, txHash, error };
}
