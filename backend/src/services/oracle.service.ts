import { Dispute, Market, OracleResult, Outcome } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  Contract,
  Keypair,
  BASE_FEE,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";

const prisma = new PrismaClient();
const RPC_URL = process.env.STELLAR_RPC_URL!;
const NETWORK = process.env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY!;
const BOXREC_API_URL = process.env.BOXREC_API_URL!;

export interface ExternalFightResult {
  matchId: string;
  winner: "FighterA" | "FighterB" | "Draw" | "NoContest";
  method: string;   // e.g. "KO", "TKO", "Decision"
  round: number;
  source: string;
  reportedAt: Date;
}

/**
 * Records a fight result from an authorized oracle or admin.
 * Persists to OracleResult table with confirmed=false.
 * Does NOT trigger on-chain resolution — confirmFightResult() does that.
 */
export async function submitFightResult(
  market_id: string,
  outcome: Outcome,
  source: string,
  reporter: string
): Promise<OracleResult> {
  throw new Error("Not implemented");
}

/**
 * Admin approves an oracle result and triggers on-chain resolve_market().
 * Sets OracleResult.confirmed = true and syncs market status in DB.
 */
export async function confirmFightResult(
  oracle_result_id: string,
  admin: string
): Promise<void> {
  const oracleResult = await prisma.oracleResult.findUnique({
    where: { id: oracle_result_id },
    include: { market: true },
  });
  if (!oracleResult) throw new Error(`OracleResult not found: ${oracle_result_id}`);

  const server = new SorobanRpc.Server(RPC_URL);
  const keypair = Keypair.fromSecret(ADMIN_SECRET);
  const account = await server.getAccount(keypair.publicKey());

  const contract = new Contract(oracleResult.market.contractAddress);
  const outcomeArg = xdr.ScVal.scvSymbol(oracleResult.outcome);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(contract.call("resolve_market", outcomeArg))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const sendResult = await server.sendTransaction(prepared);

  if (sendResult.status === "ERROR") {
    throw new Error(`Stellar tx failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  await prisma.oracleResult.update({
    where: { id: oracle_result_id },
    data: { confirmed: true },
  });

  await prisma.market.update({
    where: { id: oracleResult.marketId },
    data: { status: "Resolved", outcome: oracleResult.outcome, resolvedAt: new Date() },
  });
}

/**
 * Queries an external boxing data API (BoxRec, ESPN) for fight outcome.
 * Returns normalized result or null if fight not yet reported.
 */
export async function fetchExternalResult(
  market_id: string
): Promise<ExternalFightResult | null> {
  const market = await prisma.market.findUnique({ where: { id: market_id } });
  if (!market) throw new Error(`Market not found: ${market_id}`);

  const fighterA = market.fighterA as { name: string };
  const fighterB = market.fighterB as { name: string };
  const fightDate = market.scheduledAt.toISOString().split("T")[0];

  const url = `${BOXREC_API_URL}/fights?fighterA=${encodeURIComponent(fighterA.name)}&fighterB=${encodeURIComponent(fighterB.name)}&date=${fightDate}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.ORACLE_API_KEY}` },
    });
  } catch (err) {
    throw new Error(`Network error querying BoxRec: ${(err as Error).message}`);
  }

  if (res.status === 404) return null;

  if (!res.ok) {
    throw new Error(`BoxRec API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as {
    id: string;
    winner: string;
    method: string;
    round: number;
    reportedAt: string;
  };

  const winnerMap: Record<string, ExternalFightResult["winner"]> = {
    [fighterA.name]: "FighterA",
    [fighterB.name]: "FighterB",
    Draw: "Draw",
    NoContest: "NoContest",
  };

  return {
    matchId: data.id,
    winner: winnerMap[data.winner] ?? "NoContest",
    method: data.method,
    round: data.round,
    source: BOXREC_API_URL,
    reportedAt: new Date(data.reportedAt),
  };
}

/**
 * Returns all markets in Locked status without a confirmed oracle result.
 * Used by admin dashboard to show fights awaiting resolution.
 */
export async function listPendingResolutions(): Promise<Market[]> {
  return prisma.market.findMany({
    where: {
      status: "Locked",
      OR: [
        { oracleResult: null },
        { oracleResult: { confirmed: false } },
      ],
    },
    orderBy: { scheduledAt: "asc" },
  });
}

/**
 * Records a dispute in DB and submits raise_dispute() on-chain.
 * Notifies admin via internal alert.
 */
export async function raiseDispute(
  market_id: string,
  bettor: string,
  reason: string
): Promise<Dispute> {
  const market = await prisma.market.findUnique({ where: { id: market_id } });
  if (!market || market.status !== "Resolved") {
    throw new Error("Market must be in Resolved status to raise a dispute");
  }

  const dispute = await prisma.dispute.create({
    data: { marketId: market_id, raisedBy: bettor, reason },
  });

  const server = new SorobanRpc.Server(RPC_URL);
  const keypair = Keypair.fromSecret(ADMIN_SECRET);
  const account = await server.getAccount(keypair.publicKey());
  const contract = new Contract(market.contractAddress);

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call("raise_dispute", nativeToScVal(dispute.id, { type: "string" })))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  await server.sendTransaction(prepared);

  await prisma.$transaction([
    prisma.market.update({ where: { id: market_id }, data: { status: "Disputed" } }),
    prisma.adminLog.create({
      data: { action: "raiseDispute", actor: bettor, target: market_id, metadata: { disputeId: dispute.id, reason } },
    }),
  ]);

  return dispute;
}

/**
 * Admin resolves a dispute with a final outcome (may override oracle).
 * Calls resolve_dispute() on-chain and updates DB dispute record.
 */
export async function resolveDispute(
  dispute_id: string,
  override_outcome: Outcome,
  admin: string
): Promise<void> {
  const dispute = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute_id } });
  const market = await prisma.market.findUniqueOrThrow({ where: { id: dispute.marketId } });

  const server = new SorobanRpc.Server(RPC_URL);
  const keypair = Keypair.fromSecret(ADMIN_SECRET);
  const account = await server.getAccount(keypair.publicKey());
  const contract = new Contract(market.contractAddress);

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call(
      "resolve_dispute",
      nativeToScVal(dispute_id, { type: "string" }),
      nativeToScVal(override_outcome, { type: "symbol" }),
    ))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  await server.sendTransaction(prepared);

  await prisma.$transaction([
    prisma.dispute.update({
      where: { id: dispute_id },
      data: { resolvedAt: new Date(), resolution: override_outcome },
    }),
    prisma.market.update({
      where: { id: dispute.marketId },
      data: { status: "Resolved", outcome: override_outcome },
    }),
    prisma.adminLog.create({
      data: { action: "resolveDispute", actor: admin, target: dispute.marketId, metadata: { disputeId: dispute_id, override_outcome } },
    }),
  ]);
}

// ─── Oracle Address Management (Issue #455) ────────────────────────────────

/**
 * Get all registered oracles with their details.
 */
export async function getAllOracles() {
  return prisma.oracle.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a single oracle by ID.
 */
export async function getOracleById(id: string) {
  return prisma.oracle.findUnique({
    where: { id },
  });
}

/**
 * Create a new oracle entry.
 */
export async function createOracle(address: string, name: string) {
  return prisma.oracle.create({
    data: {
      address,
      name,
      active: true,
    },
  });
}

/**
 * Update oracle name or active status.
 */
export async function updateOracle(id: string, data: { name?: string; active?: boolean }) {
  return prisma.oracle.update({
    where: { id },
    data,
  });
}

/**
 * Deactivate an oracle (soft delete by setting active to false).
 */
export async function deleteOracle(id: string) {
  return prisma.oracle.update({
    where: { id },
    data: { active: false },
  });
}
