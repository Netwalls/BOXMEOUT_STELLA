import {
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  scValToNative,
} from "@stellar/stellar-sdk";
import { OnChainMarket, parseOnChainMarket } from "./market-reconciliation.service";

/**
 * B-114 / #1412: reads a market's state from the contract via a simulated
 * `get_market_info()` call. Simulation is read-only, so no funded account is
 * needed; a throwaway keypair is used as the source account.
 */
export async function readOnChainMarket(contractAddress: string): Promise<OnChainMarket> {
  const rpcUrl = process.env.STELLAR_RPC_URL;
  if (!rpcUrl) {
    throw new Error("STELLAR_RPC_URL environment variable is not set");
  }

  const server = new SorobanRpc.Server(rpcUrl);
  const throwaway = Keypair.random();
  const networkPassphrase =
    process.env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

  const account = await server.getAccount(throwaway.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(new Contract(contractAddress).call("get_market_info"))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation error for contract ${contractAddress}: ${sim.error}`);
  }
  if (!sim.result?.retval) {
    throw new Error(`Empty simulation result for contract ${contractAddress}`);
  }

  return parseOnChainMarket(scValToNative(sim.result.retval) as Record<string, unknown>);
}
