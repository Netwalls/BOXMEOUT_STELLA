import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Keypair, xdr } from '@stellar/stellar-sdk';

// ── Shared RPC mock state (defined before jest.mock so factory can close over them) ──
// jest.mock is hoisted, but variables declared with `const` in the module scope
// are NOT accessible inside the factory. We work around this by using a plain
// object that is mutated per-test.
const rpc = {
  getAccount:          jest.fn<() => Promise<unknown>>(),
  simulateTransaction: jest.fn<() => Promise<unknown>>(),
  sendTransaction:     jest.fn<() => Promise<unknown>>(),
  getTransaction:      jest.fn<() => Promise<unknown>>(),
};

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk') as Record<string, unknown>;

  const mockTx = { sign: jest.fn() };
  const mockBuilder = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue(mockTx),
  };
  const mockAssembled = {
    setNetworkPassphrase: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue(mockTx),
  };

  return {
    ...actual,
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn().mockReturnValue('op'),
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => mockBuilder),
    rpc: {
      // Server constructor returns the shared `rpc` object from outer scope.
      // Because jest.mock is hoisted, we can't reference `rpc` directly here —
      // instead we use a getter trick via a module-level variable accessed at
      // call time (not at factory-definition time).
      Server: jest.fn().mockImplementation(() => ({
        getAccount: (...a: unknown[]) => (global as any).__rpcMock.getAccount(...a),
        simulateTransaction: (...a: unknown[]) => (global as any).__rpcMock.simulateTransaction(...a),
        sendTransaction: (...a: unknown[]) => (global as any).__rpcMock.sendTransaction(...a),
        getTransaction: (...a: unknown[]) => (global as any).__rpcMock.getTransaction(...a),
      })),
      assembleTransaction: jest.fn().mockReturnValue(mockAssembled),
      Api: {
        GetTransactionStatus: { SUCCESS: 'SUCCESS', FAILED: 'FAILED', NOT_FOUND: 'NOT_FOUND' },
        isSimulationError: (r: unknown) => !!(r as Record<string, unknown>).error,
        isSimulationSuccess: (r: unknown) => !(r as Record<string, unknown>).error,
      },
    },
  };
});

// Expose the shared mock object on global so the factory can reach it at call time
(global as any).__rpcMock = rpc;

import { invokeContract, StellarInvocationError } from '../../src/services/StellarService';

// ── Constants ────────────────────────────────────────────────────────────────

const CONTRACT = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
const METHOD   = 'place_bet';
const ARGS: xdr.ScVal[] = [];
const KEYPAIR  = Keypair.random();
const TX_HASH  = 'abc123hash';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('invokeContract()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STELLAR_RPC_URL = 'https://soroban-testnet.stellar.org';
    process.env.STELLAR_NETWORK = 'testnet';

    rpc.getAccount.mockResolvedValue({ id: KEYPAIR.publicKey(), sequence: '0' });
    rpc.simulateTransaction.mockResolvedValue({ minResourceFee: '500', result: { retval: {} } });
    rpc.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: TX_HASH });
    rpc.getTransaction.mockResolvedValue({ status: 'SUCCESS' });
  });

  // ── AC1: Successful invocation returns tx hash ──────────────────────────

  it('returns the tx hash on SUCCESS', async () => {
    const hash = await invokeContract(CONTRACT, METHOD, ARGS, KEYPAIR);
    expect(hash).toBe(TX_HASH);
  });

  it('calls simulate, send, and getTransaction in order', async () => {
    await invokeContract(CONTRACT, METHOD, ARGS, KEYPAIR);
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(1);
    expect(rpc.getTransaction).toHaveBeenCalledTimes(1);
  });

  it('throws StellarInvocationError when simulation returns an error', async () => {
    rpc.simulateTransaction.mockResolvedValue({ error: 'sim failed' });
    await expect(invokeContract(CONTRACT, METHOD, ARGS, KEYPAIR))
      .rejects.toBeInstanceOf(StellarInvocationError);
  });

  it('throws StellarInvocationError when sendTransaction returns ERROR status', async () => {
    rpc.sendTransaction.mockResolvedValue({ status: 'ERROR', hash: TX_HASH, errorResult: {} });
    await expect(invokeContract(CONTRACT, METHOD, ARGS, KEYPAIR))
      .rejects.toBeInstanceOf(StellarInvocationError);
  });

  // ── AC2: FAILED on-chain throws StellarInvocationError ─────────────────

  it('throws StellarInvocationError with txHash when getTransaction returns FAILED', async () => {
    rpc.getTransaction.mockResolvedValue({ status: 'FAILED' });
    const err = await invokeContract(CONTRACT, METHOD, ARGS, KEYPAIR).catch(e => e);
    expect(err).toBeInstanceOf(StellarInvocationError);
    expect(err.txHash).toBe(TX_HASH);
  });

  // ── AC2: Fee-too-low / timeout triggers retry ───────────────────────────

  it('retries on timeout and succeeds on second attempt', async () => {
    // Strategy: make Date.now() return a value past the deadline on the SECOND call
    // (first call sets deadline, second call is the while-check → exits immediately)
    const base = Date.now();
    let nowCalls = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      nowCalls++;
      // Call 1: sets deadline = base + 30_000
      // Call 2+: return base + 31_000 → while(Date.now() < deadline) is false → timeout
      // After restoreAllMocks on retry, real Date.now is used
      return nowCalls === 1 ? base : base + 31_000;
    });

    rpc.sendTransaction
      .mockResolvedValueOnce({ status: 'PENDING', hash: 'hash-1' })
      .mockResolvedValueOnce({ status: 'PENDING', hash: TX_HASH });

    rpc.getTransaction.mockResolvedValue({ status: 'SUCCESS' });

    const hash = await invokeContract(CONTRACT, METHOD, ARGS, KEYPAIR);
    expect(hash).toBe(TX_HASH);
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(2);

    jest.restoreAllMocks();
  });

  // ── AC3: Max retries exceeded throws error ──────────────────────────────

  it('throws StellarInvocationError after max retries exceeded', async () => {
    // Make every poll timeout immediately: odd calls set deadline, even calls exceed it
    let nowCalls = 0;
    const base = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => {
      nowCalls++;
      return nowCalls % 2 === 1 ? base : base + 31_000;
    });

    rpc.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
    rpc.sendTransaction.mockResolvedValue({ status: 'PENDING', hash: TX_HASH });

    const err = await invokeContract(CONTRACT, METHOD, ARGS, KEYPAIR).catch(e => e);
    expect(err).toBeInstanceOf(StellarInvocationError);
    expect(err.message).toMatch(/retries/i);
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(4);

    jest.restoreAllMocks();
  });

  it('throws if STELLAR_RPC_URL is not set', async () => {
    delete process.env.STELLAR_RPC_URL;
    await expect(invokeContract(CONTRACT, METHOD, ARGS, KEYPAIR))
      .rejects.toThrow('STELLAR_RPC_URL');
  });
});
