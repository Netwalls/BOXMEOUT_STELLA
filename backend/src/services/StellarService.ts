// ============================================================
// BOXMEOUT — Stellar Service
// Low-level Stellar SDK wrapper for contract interactions.
// Contributors: implement every function marked TODO.
// ============================================================

import { Account, Keypair, Networks, Operation, rpc, TransactionBuilder, xdr } from '@stellar/stellar-sdk';

/**
 * Builds, simulates, signs, and submits a Soroban contract invocation.
 *
 * Steps:
 *   1. Build a TransactionBuilder with source_keypair's account
 *   2. Add InvokeContractHostFunction operation with method + args
 *   3. Simulate via RPC to get resource fee estimates
 *   4. Set transaction fee = base_fee + resource_fee
 *   5. Sign with source_keypair
 *   6. Submit via RPC sendTransaction
 *   7. Poll getTransaction until status is SUCCESS or FAILED (max 30s)
 *   8. On TIMEOUT: rebuild and resubmit with bumped fee (max 3 retries)
 *
 * Returns the transaction hash on SUCCESS.
 * Throws StellarInvocationError on FAILED or max retries exceeded.
 */
export async function invokeContract(
  contract_address: string,
  method: string,
  args: xdr.ScVal[],
  source_keypair?: Keypair,
): Promise<string> {
  const horizonUrl = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
  const rpcUrl = process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';
  const networkPassphrase = process.env.STELLAR_NETWORK === 'public'
    ? Networks.PUBLIC
    : Networks.TESTNET;

  if (!source_keypair) {
    const oracleSecret = process.env.ORACLE_PRIVATE_KEY;
    if (!oracleSecret) throw new Error('ORACLE_PRIVATE_KEY env var is required');
    source_keypair = Keypair.fromSecret(oracleSecret);
  }

  const server = new rpc.Server(horizonUrl);
  const sorobanServer = new rpc.Server(rpcUrl);

  const sourceAccount = await server.getAccount(source_keypair.publicKey());

  const invokeContractHostFunction = xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: xdr.ScAddress.contractFromAddress(contract_address),
      functionName: xdr.ScSymbol.fromString(method),
      args,
    }),
  );

  const baseFee = 100; // Base fee in stroops
  let attempts = 0;
  const maxRetries = 3;

  while (attempts < maxRetries) {
    try {
      // Step 1-2: Build transaction
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: (baseFee * Math.pow(2, attempts)).toString(),
        networkPassphrase,
      })
        .addOperation(Operation.invokeHostFunction({ hostFunction: invokeContractHostFunction, auth: [] }))
        .setTimeout(30)
        .build();

      // Step 3: Simulate to get resource fee
      const simulation = await sorobanServer.simulateTransaction(transaction);
      if ('error' in simulation && simulation.error) {
        throw new Error(`Simulation error: ${JSON.stringify(simulation.error)}`);
      }

      const simResult = simulation as { results?: Array<{ minResourceFee?: string }> };
      const minResourceFee = simResult.results?.[0]?.minResourceFee;
      const resourceFee = minResourceFee ? parseInt(minResourceFee, 10) : 0;

      // Step 4: Set total fee
      const totalFee = (baseFee * Math.pow(2, attempts)) + resourceFee;
      transaction.fee = totalFee.toString();

      // Step 5: Sign
      transaction.sign(source_keypair);

      // Step 6: Submit
      const submitResponse = await sorobanServer.sendTransaction(transaction);

      if (submitResponse.status !== 'PENDING') {
        throw new Error(`Submit failed: ${submitResponse.status}`);
      }

      const txHash = submitResponse.hash;

      // Step 7: Poll for result (max 30s)
      const startTime = Date.now();
      const maxWait = 30_000;

      while (Date.now() - startTime < maxWait) {
        const statusResponse = await sorobanServer.getTransaction(txHash);

        if (statusResponse.status === 'SUCCESS') {
          return txHash;
        } else if (statusResponse.status === 'FAILED') {
          throw new Error(`Transaction failed: ${JSON.stringify(statusResponse.resultXdr)}`);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Step 8: Timeout — retry with bumped fee
      throw new Error('Transaction polling timed out');

    } catch (err) {
      attempts++;
      if (attempts >= maxRetries) {
        throw err;
      }
    }
  }

  throw new Error('Max retries exceeded');
}

/**
 * Reads contract state using simulateTransaction (no fee, no state change).
 *
 * Steps:
 *   1. Build a read-only InvokeContractHostFunction transaction
 *   2. Call RPC simulateTransaction
 *   3. Extract returnValue from simulation result
 *   4. Call parseScVal(returnValue) and cast to type T
 *
 * Returns the typed result T.
 * Throws if simulation fails.
 */
export async function readContractState<T>(
  contract_address: string,
  method: string,
  args: xdr.ScVal[],
): Promise<T> {
  const rpcUrl = process.env.STELLAR_RPC_URL;
  if (!rpcUrl) throw new Error('STELLAR_RPC_URL env var is required');

  const networkPassphrase = process.env.STELLAR_NETWORK === 'public'
    ? Networks.PUBLIC
    : Networks.TESTNET;

  const sorobanServer = new rpc.Server(rpcUrl);
  const sourceAccount = new Account(Keypair.random().publicKey(), '0');

  const invokeContractHostFunction = xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: xdr.ScAddress.contractFromAddress(contract_address),
      functionName: xdr.ScSymbol.fromString(method),
      args,
    }),
  );

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(Operation.invokeHostFunction({ hostFunction: invokeContractHostFunction, auth: [] }))
    .setTimeout(30)
    .build();

  const response = await sorobanServer.simulateTransaction(transaction);
  if ('error' in response && response.error) {
    throw new Error(`Simulation error: ${JSON.stringify(response.error)}`);
  }

  const result = (response as Record<string, unknown>).results?.[0] as Record<string, unknown>;
  if (!result || result.status !== 'SUCCESS') {
    throw new Error(
      `Simulation failed${result?.status ? `: ${result.status}` : ' without a result'}`,
    );
  }

  const returnValue = result.returnValue as xdr.ScVal;
  if (!returnValue) {
    throw new Error('Simulation returned no returnValue');
  }

  return parseScVal(returnValue) as T;
}

/**
 * Subscribes to the Horizon event stream for a specific contract address.
 * Uses Horizon's /contract_events endpoint with Server-Sent Events.
 *
 * Calls onEvent for every new event received.
 * Automatically reconnects on connection drop (exponential backoff).
 *
 * Returns an unsubscribe function that stops the stream.
 */
export function subscribeToContractEvents(
  contract_address: string,
  onEvent: (event: unknown) => void,
): () => void {
  const horizonUrl = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
  let eventSource: EventSource | null = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  let backoffMs = 1000;
  let isUnsubscribed = false;

  const connect = () => {
    if (isUnsubscribed) return;

    const url = `${horizonUrl}/contract_events?contract_id=${contract_address}`;
    eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEvent(data);
        reconnectAttempts = 0;
        backoffMs = 1000;
      } catch (err) {
        console.error('[StellarService] Failed to parse event:', err);
      }
    };

    eventSource.onerror = () => {
      if (isUnsubscribed) return;
      eventSource?.close();
      eventSource = null;

      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.min(backoffMs * Math.pow(2, reconnectAttempts - 1), 30000);
        console.log(`[StellarService] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
        setTimeout(connect, delay);
      } else {
        console.error('[StellarService] Max reconnection attempts exceeded');
      }
    };
  };

  connect();

  return () => {
    isUnsubscribed = true;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

/**
 * Converts a raw XDR ScVal into a JavaScript-native value.
 *
 * Handles the following ScVal variants:
 *   ScvBool    → boolean
 *   ScvU32     → number
 *   ScvI32     → number
 *   ScvU64     → bigint
 *   ScvI128    → bigint
 *   ScvString  → string
 *   ScvAddress → string (G... format)
 *   ScvVec     → unknown[]
 *   ScvMap     → Record<string, unknown>
 *   ScvSymbol  → string
 *
 * Throws ParseError for unsupported variants.
 */
export function parseScVal(scval: xdr.ScVal): unknown {
  const value = scval as Record<string, unknown>;
  const type = scval.switch();

  if (type === xdr.ScValType.scvBool()) return (value.b as () => boolean)?.();
  if (type === xdr.ScValType.scvU32()) return (value.u32 as () => number)?.();
  if (type === xdr.ScValType.scvI32()) return (value.i32 as () => number)?.();
  if (type === xdr.ScValType.scvU64()) {
    const u64 = (value.u64 as () => bigint)?.();
    return typeof u64 === 'bigint' ? u64 : u64?.toString();
  }
  if (type === xdr.ScValType.scvI128()) {
    const i128 = (value.i128 as () => bigint)?.();
    return typeof i128 === 'bigint' ? i128 : i128?.toString();
  }
  if (type === xdr.ScValType.scvString()) return (value.str as () => string)?.();
  if (type === xdr.ScValType.scvAddress()) return (value.address as () => string)?.();
  if (type === xdr.ScValType.scvSymbol()) return (value.sym as () => string)?.();
  if (type === xdr.ScValType.scvVec()) {
    return (value.vec as () => xdr.ScVal[])()?.map((item: xdr.ScVal) => parseScVal(item));
  }
  if (type === xdr.ScValType.scvMap()) {
    const mapEntries = (value.map as () => Array<{ key: () => xdr.ScVal; value: () => xdr.ScVal }>)?.() ?? [];
    const output: Record<string, unknown> = {};
    for (const entry of mapEntries) {
      const key = parseScVal(entry.key());
      const mappedKey = typeof key === 'string' ? key : String(key);
      output[mappedKey] = parseScVal(entry.value());
    }
    return output;
  }

  throw new Error(`Unsupported ScVal type: ${type}`);
}

/**
 * Returns the current recommended base fee in stroops from the Stellar network.
 * Calls Horizon /fee_stats endpoint and returns the p70 fee.
 * Used to set appropriate transaction fees to avoid rejection.
 */
export async function getCurrentBaseFee(): Promise<number> {
  const horizonUrl = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
  const server = new Server(horizonUrl);
  const feeStats = await server.feeStats();
  return parseInt(feeStats.p70_accepted_fee, 10);
}

/**
 * Fetches historical events from Horizon for a given ledger range.
 * Paginates through all pages automatically.
 * Returns events in chronological order.
 * Handles rate limiting with automatic retry.
 */
export async function fetchHistoricalEvents(
  fromLedger: number,
  toLedger?: number,
): Promise<Array<{
  contract_address: string;
  event_type: string;
  topics: string[];
  data: string;
  ledger_sequence: number;
  ledger_close_time: string;
  tx_hash: string;
}>> {
  const horizonUrl = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
  const factoryContract = process.env.FACTORY_CONTRACT_ADDRESS || '';
  const treasuryContract = process.env.TREASURY_CONTRACT_ADDRESS || '';

  const server = new Server(horizonUrl);
  const events: Array<{
    contract_address: string;
    event_type: string;
    topics: string[];
    data: string;
    ledger_sequence: number;
    ledger_close_time: string;
    tx_hash: string;
  }> = [];
  let cursor = '';
  const limit = 200;
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      const params: Record<string, unknown> = {
        limit,
        order: 'asc',
        cursor,
      };

      if (toLedger) {
        params.to_ledger = toLedger;
      }

      const response = await (server as any).transactions()
        .forLedger(fromLedger)
        .call(params);

      if (!response.records || response.records.length === 0) {
        break;
      }

      for (const tx of response.records) {
        if (!tx.operations_url) continue;

        try {
          const opsResponse = await fetch(tx.operations_url);
          const opsData = await opsResponse.json() as { records?: Array<{ type?: string; [key: string]: unknown }> };

          if (!opsData.records) continue;

          for (const op of opsData.records) {
            if (op.type !== 'invoke_host_function') continue;

            const event = {
              contract_address: (op as any).contract_id || '',
              event_type: (op as any).function || 'unknown',
              topics: [],
              data: JSON.stringify(op),
              ledger_sequence: tx.ledger_attr || 0,
              ledger_close_time: tx.created_at || new Date().toISOString(),
              tx_hash: tx.hash || '',
            };

            if ([factoryContract, treasuryContract].includes(event.contract_address)) {
              events.push(event);
            }
          }
        } catch (err) {
          console.error('[StellarService] Error fetching operations:', err);
        }
      }

      cursor = response.records[response.records.length - 1]?.paging_token || '';
      if (!cursor) break;

      retries = 0;
    } catch (err) {
      retries++;
      if (retries >= maxRetries) {
        console.error('[StellarService] Max retries exceeded fetching historical events:', err);
        throw err;
      }
      const delay = Math.pow(2, retries) * 1000;
      console.log(`[StellarService] Rate limited, retrying in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return events;
}

export interface RawStellarEvent {
  contract_address: string;
  event_type: string;
  topics: string[];
  data: string;
  ledger_sequence: number;
  ledger_close_time: string;
  tx_hash: string;
}
