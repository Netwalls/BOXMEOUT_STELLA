#!/usr/bin/env bash
# ==============================================================================
# BOXMEOUT — Deploy all contracts to Stellar Testnet
# ==============================================================================
#
# Deploys Market (WASM), Treasury and MarketFactory to Stellar Testnet in one
# command and wires them together:
#   - Treasury is initialised with the bet token (`token`) and the factory
#     address, so the factory's ID is derived up front (see "SALTED IDS").
#   - MarketFactory is initialised with the uploaded Market WASM hash and the
#     real Treasury address as treasury / fee collector.
#
# Requirements:
#   - Rust with the wasm32-unknown-unknown target
#   - Stellar CLI v28+ (`stellar`)
#   - Node.js with backend dependencies installed (used to derive the admin
#     public key from ADMIN_SECRET; run `npm ci` in backend/ first)
#   - A funded Testnet account (friendbot: https://friendbot.stellar.org)
#
# Usage:
#   ADMIN_SECRET=SABC... ./deploy_testnet.sh
#
# Optional environment:
#   BET_TOKEN_ID     Token contract (C...) used for bets. Defaults to the
#                    native XLM Stellar Asset Contract, deployed if missing.
#   DAILY_LIMIT      Treasury daily withdrawal limit in stroops
#                    (default 100000000000).
#
# Outputs:
#   - contracts/deployed.testnet.json   contract IDs and WASM hashes (machine readable)
#   - contracts/.env.testnet            shell env file
#   - .env lines for backend/ and frontend/ printed to stdout
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
ENV_FILE="$CONTRACTS_DIR/.env.testnet"
DEPLOYED_JSON="$CONTRACTS_DIR/deployed.testnet.json"

# ─── VALIDATE ENVIRONMENT ─────────────────────────────────────────────────────

if [[ -z "${ADMIN_SECRET:-}" ]]; then
  echo "ERROR: ADMIN_SECRET is not set. Export your Testnet secret key first."
  echo "  export ADMIN_SECRET=SABC..."
  exit 1
fi

for cmd in cargo stellar node jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' is not installed or not in PATH."
    exit 1
  fi
done

NETWORK="testnet"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NETWORK_URL="https://soroban-testnet.stellar.org"
DAILY_LIMIT="${DAILY_LIMIT:-100000000000}"

# Derive the admin public key with the same SDK the backend uses.
ADMIN_PUBKEY=$(cd "$BACKEND_DIR" && node -e \
  "console.log(require('@stellar/stellar-sdk').Keypair.fromSecret(process.env.ADMIN_SECRET).publicKey())" \
  2>/dev/null || echo "")

if [[ -z "$ADMIN_PUBKEY" ]]; then
  echo "ERROR: Could not derive public key from ADMIN_SECRET."
  echo "  Make sure backend dependencies are installed (cd backend && npm ci)."
  exit 1
fi

# Common flags for every stellar CLI call.
NET_FLAGS=(--network "$NETWORK" --source "$ADMIN_SECRET")

echo "==> Admin public key: $ADMIN_PUBKEY"

# ─── BUILD ────────────────────────────────────────────────────────────────────

echo ""
echo "==> Building all contracts (release, wasm32-unknown-unknown)..."
cd "$CONTRACTS_DIR"
cargo build --release --target wasm32-unknown-unknown

WASM_DIR="$CONTRACTS_DIR/target/wasm32-unknown-unknown/release"

# ─── OPTIMIZE ─────────────────────────────────────────────────────────────────

echo ""
echo "==> Optimizing WASM binaries..."
for contract in market treasury market_factory; do
  WASM_IN="$WASM_DIR/${contract}.wasm"
  WASM_OUT="$WASM_DIR/${contract}.optimized.wasm"

  if [[ ! -f "$WASM_IN" ]]; then
    echo "ERROR: $WASM_IN not found after build."
    exit 1
  fi

  stellar contract optimize \
    --wasm     "$WASM_IN" \
    --wasm-out "$WASM_OUT"
  echo "    Optimized: $WASM_OUT"
done

# ─── UPLOAD WASM ──────────────────────────────────────────────────────────────
# Upload every WASM first. Deployments then reference the hash, which lets us
# derive contract IDs before anything is instantiated.

echo ""
echo "==> Uploading WASM binaries..."
MARKET_WASM_HASH=$(stellar contract upload \
  --wasm "$WASM_DIR/market.optimized.wasm" "${NET_FLAGS[@]}")
TREASURY_WASM_HASH=$(stellar contract upload \
  --wasm "$WASM_DIR/treasury.optimized.wasm" "${NET_FLAGS[@]}")
FACTORY_WASM_HASH=$(stellar contract upload \
  --wasm "$WASM_DIR/market_factory.optimized.wasm" "${NET_FLAGS[@]}")

echo "    Market WASM hash:      $MARKET_WASM_HASH"
echo "    Treasury WASM hash:    $TREASURY_WASM_HASH"
echo "    MarketFactory hash:    $FACTORY_WASM_HASH"

# ─── BET TOKEN ────────────────────────────────────────────────────────────────

echo ""
if [[ -n "${BET_TOKEN_ID:-}" ]]; then
  echo "==> Using bet token from BET_TOKEN_ID: $BET_TOKEN_ID"
else
  echo "==> No BET_TOKEN_ID set; using the native XLM Stellar Asset Contract..."
  BET_TOKEN_ID=$(stellar contract id asset --asset native --network "$NETWORK")
  # Deploying an already-deployed SAC fails; that is fine, the ID is the same.
  stellar contract asset deploy --asset native "${NET_FLAGS[@]}" >/dev/null 2>&1 || true
fi
echo "    Bet token: $BET_TOKEN_ID"

# ─── SALTED IDS ───────────────────────────────────────────────────────────────
# Treasury needs the factory address at init time and the factory needs the
# treasury address at init time. Deploying with fixed salts lets us compute
# both IDs before either contract exists.

salt_for() {
  printf '%s' "boxmeout-testnet-$1" | sha256sum | cut -d' ' -f1
}
TREASURY_SALT=$(salt_for treasury)
FACTORY_SALT=$(salt_for market-factory)

TREASURY_ID=$(stellar contract id wasm --salt "$TREASURY_SALT" \
  --wasm-hash "$TREASURY_WASM_HASH" --network "$NETWORK")
FACTORY_ID=$(stellar contract id wasm --salt "$FACTORY_SALT" \
  --wasm-hash "$FACTORY_WASM_HASH" --network "$NETWORK")

echo ""
echo "==> Deploying Treasury at $TREASURY_ID..."
stellar contract deploy --wasm-hash "$TREASURY_WASM_HASH" --salt "$TREASURY_SALT" \
  "${NET_FLAGS[@]}" >/dev/null

echo "==> Deploying MarketFactory at $FACTORY_ID..."
stellar contract deploy --wasm-hash "$FACTORY_WASM_HASH" --salt "$FACTORY_SALT" \
  "${NET_FLAGS[@]}" >/dev/null

# ─── INITIALIZE ───────────────────────────────────────────────────────────────

echo ""
echo "==> Initializing Treasury..."
stellar contract invoke --id "$TREASURY_ID" "${NET_FLAGS[@]}" -- initialize \
  --admin         "$ADMIN_PUBKEY" \
  --fee_bps       200 \
  --fee_recipient "$ADMIN_PUBKEY" \
  --factory       "$FACTORY_ID" \
  --token         "$BET_TOKEN_ID" \
  --daily_limit   "$DAILY_LIMIT"

echo ""
echo "==> Initializing MarketFactory..."
stellar contract invoke --id "$FACTORY_ID" "${NET_FLAGS[@]}" -- initialize \
  --admin              "$ADMIN_PUBKEY" \
  --market_wasm_hash   "$MARKET_WASM_HASH" \
  --treasury           "$TREASURY_ID" \
  --fee_collector      "$TREASURY_ID" \
  --default_fee_bp     200 \
  --min_bet_amount     1000000 \
  --max_bet_amount     100000000000 \
  --dispute_window_sec 86400

# ─── SAVE OUTPUT ──────────────────────────────────────────────────────────────

echo ""
echo "==> Saving contract IDs..."

cat > "$ENV_FILE" <<ENVFILE
# BOXMEOUT Stellar Testnet — generated by deploy_testnet.sh
NETWORK=testnet
RPC_URL=${NETWORK_URL}
ADMIN_PUBKEY=${ADMIN_PUBKEY}
BET_TOKEN_ID=${BET_TOKEN_ID}
TREASURY_CONTRACT_ID=${TREASURY_ID}
MARKET_FACTORY_CONTRACT_ID=${FACTORY_ID}
MARKET_WASM_HASH=${MARKET_WASM_HASH}
ENVFILE

jq -n \
  --arg network "$NETWORK" \
  --arg rpcUrl "$NETWORK_URL" \
  --arg passphrase "$NETWORK_PASSPHRASE" \
  --arg admin "$ADMIN_PUBKEY" \
  --arg token "$BET_TOKEN_ID" \
  --arg treasury "$TREASURY_ID" \
  --arg factory "$FACTORY_ID" \
  --arg marketWasmHash "$MARKET_WASM_HASH" \
  --arg treasuryWasmHash "$TREASURY_WASM_HASH" \
  --arg factoryWasmHash "$FACTORY_WASM_HASH" \
  --arg deployedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{
    network: $network,
    rpcUrl: $rpcUrl,
    networkPassphrase: $passphrase,
    adminPublicKey: $admin,
    betToken: $token,
    deployedAt: $deployedAt,
    contracts: {
      treasury: $treasury,
      marketFactory: $factory
    },
    wasmHashes: {
      market: $marketWasmHash,
      treasury: $treasuryWasmHash,
      marketFactory: $factoryWasmHash
    }
  }' > "$DEPLOYED_JSON"

echo ""
echo "============================================================"
echo "  DEPLOYMENT COMPLETE"
echo "============================================================"
echo "  Treasury:         $TREASURY_ID"
echo "  MarketFactory:    $FACTORY_ID"
echo "  Market WASM hash: $MARKET_WASM_HASH"
echo "  Bet token:        $BET_TOKEN_ID"
echo "============================================================"
echo ""
echo "  Machine-readable: $DEPLOYED_JSON"
echo "  Shell env file:   $ENV_FILE"
echo ""
echo "Paste these into backend/.env:"
echo "  MARKET_FACTORY_CONTRACT_ID=$FACTORY_ID"
echo "  TREASURY_CONTRACT_ID=$TREASURY_ID"
echo ""
echo "Paste these into frontend/.env.local:"
echo "  NEXT_PUBLIC_MARKET_FACTORY_CONTRACT_ID=$FACTORY_ID"
echo "  NEXT_PUBLIC_TREASURY_CONTRACT_ID=$TREASURY_ID"
echo "  NEXT_PUBLIC_BET_TOKEN_ID=$BET_TOKEN_ID"
