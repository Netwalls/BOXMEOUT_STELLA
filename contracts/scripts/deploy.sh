#!/usr/bin/env bash
# ==============================================================================
# BOXMEOUT — Deploy the contracts to a Stellar network
# ==============================================================================
#
# Builds and uploads Market (WASM), Treasury and MarketFactory, deploys the
# last two with fixed salts, initialises them, and records the result in
# contracts/deployments/<network>.json. Backend and frontend .env snippets are
# generated from that manifest.
#
# Usage:
#   contracts/scripts/deploy.sh --network testnet|futurenet|mainnet|local [options]
#
# Options:
#   --network NAME       Target network (required). See the table in load_network.
#   --identity NAME      Stellar CLI identity used as deployer and admin.
#                        Default: $BOXMEOUT_ADMIN_IDENTITY or "boxmeout-admin".
#   --confirm-mainnet    Required when --network mainnet. Mainnet is refused
#                        without it.
#   --validate-only      Run the validation stage (tools, CLI, network, identity)
#                        and exit without building or deploying.
#   -h, --help           Show this help.
#
# Environment:
#   BET_TOKEN_ID         Token contract (C...) used for bets. Defaults to the
#                        native XLM Stellar Asset Contract, deployed if missing.
#   DAILY_LIMIT          Treasury daily withdrawal limit in stroops
#                        (default 100000000000).
#   RPC_URL              Overrides the RPC URL from the network table.
#   BOXMEOUT_ADMIN_IDENTITY  Default identity name (see --identity).
#
# Secrets: the deployer's secret key is never passed to this script. It lives in
# the Stellar CLI's identity store and is referenced by name in every command,
# so it does not appear in argv, the process list, shell history or any file
# written here. One-time setup for each machine:
#
#   stellar keys add boxmeout-admin --secret-key   # prompts on the terminal
#   # or, for a new testnet key:
#   stellar keys generate boxmeout-admin --fund --network testnet
#
# Requirements:
#   - Rust with the wasm32-unknown-unknown target
#   - Stellar CLI 28.x, installed as `stellar` (CI pins 28.1.0). A legacy
#     `soroban` binary is used only as a fallback, with a warning.
#   - jq
#   - The deployer identity above, funded on the target network
#
# Outputs:
#   contracts/deployments/<network>.json   manifest: contract IDs, WASM hashes,
#                                          deployer public key, timestamp
#   contracts/deployments/<network>.env    backend/frontend variables
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$CONTRACTS_DIR/deployments"

NETWORK=""
IDENTITY="${BOXMEOUT_ADMIN_IDENTITY:-boxmeout-admin}"
CONFIRM_MAINNET=0
VALIDATE_ONLY=0

usage() {
  sed -n '3,46p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# ─── ARGUMENTS ────────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)         NETWORK="${2:-}"; shift 2 ;;
    --network=*)       NETWORK="${1#*=}"; shift ;;
    --identity)        IDENTITY="${2:-}"; shift 2 ;;
    --identity=*)      IDENTITY="${1#*=}"; shift ;;
    --confirm-mainnet) CONFIRM_MAINNET=1; shift ;;
    --validate-only)   VALIDATE_ONLY=1; shift ;;
    -h|--help)         usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# ─── NETWORK TABLE ────────────────────────────────────────────────────────────
# The single source of network settings. Add a network here, nowhere else.
# Sets NET_PASSPHRASE and NET_RPC_URL; RPC_URL in the environment overrides the
# table. Exits on unknown names.

load_network() {
  case "$1" in
    testnet)
      NET_PASSPHRASE="Test SDF Network ; September 2015"
      NET_RPC_URL="https://soroban-testnet.stellar.org" ;;
    futurenet)
      NET_PASSPHRASE="Test SDF Future Network ; October 2022"
      NET_RPC_URL="https://rpc-futurenet.stellar.org" ;;
    mainnet)
      NET_PASSPHRASE="Public Global Stellar Network ; September 2015"
      NET_RPC_URL="https://mainnet.sorobanrpc.com" ;;
    local)
      NET_PASSPHRASE="Standalone Network ; February 2017"
      NET_RPC_URL="http://localhost:8000/soroban/rpc" ;;
    *)
      echo "ERROR: unknown network '$1'. Use testnet, futurenet, mainnet or local." >&2
      exit 2 ;;
  esac
  NET_RPC_URL="${RPC_URL:-$NET_RPC_URL}"
}

if [[ -z "$NETWORK" ]]; then
  echo "ERROR: --network is required (testnet, futurenet, mainnet or local)." >&2
  usage >&2
  exit 2
fi
load_network "$NETWORK"

if [[ "$NETWORK" == "mainnet" && "$CONFIRM_MAINNET" -ne 1 ]]; then
  echo "ERROR: deploying to mainnet requires --confirm-mainnet." >&2
  exit 2
fi

# Shared flags for every network-facing Stellar CLI call. The passphrase and
# RPC URL come from the table, so the CLI never guesses the network.
NET_FLAGS=(--rpc-url "$NET_RPC_URL" --network-passphrase "$NET_PASSPHRASE")

# ─── VALIDATION ───────────────────────────────────────────────────────────────

echo "==> Validating environment for network: $NETWORK"

# The Stellar CLI binary is resolved once and every call uses $STELLAR_CLI.
# CI installs stellar-cli, which ships the `stellar` binary.
STELLAR_CLI=""
if command -v stellar &>/dev/null; then
  STELLAR_CLI="stellar"
elif command -v soroban &>/dev/null; then
  STELLAR_CLI="soroban"
  echo "WARNING: 'stellar' not found; falling back to the legacy 'soroban' binary." >&2
  echo "         Install stellar-cli 28.x to match CI." >&2
else
  echo "ERROR: no Stellar CLI found. Install stellar-cli 28.x (provides 'stellar')." >&2
  echo "       cargo install stellar-cli --version 28.1.0 --locked" >&2
  exit 1
fi

CLI_VERSION="$("$STELLAR_CLI" --version 2>/dev/null | head -n1 || echo unknown)"
echo "    CLI: $STELLAR_CLI ($CLI_VERSION)"
case "$CLI_VERSION" in
  stellar\ 28.*) ;;
  *) echo "WARNING: CLI version is not 28.x; this script is tested against 28.1.0." >&2 ;;
esac

for cmd in cargo jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' is not installed or not in PATH." >&2
    exit 1
  fi
done

if [[ -n "${ADMIN_SECRET:-}" ]]; then
  echo "WARNING: ADMIN_SECRET is no longer read. Store the key with 'stellar keys add'" >&2
  echo "         and select it with --identity. Unsetting it for this run." >&2
  unset ADMIN_SECRET
fi

DEPLOYER_PUBKEY=""
if ! DEPLOYER_PUBKEY="$("$STELLAR_CLI" keys public-key "$IDENTITY" 2>/dev/null)"; then
  echo "ERROR: no Stellar CLI identity named '$IDENTITY' on this machine." >&2
  echo "       Create it once: $STELLAR_CLI keys add $IDENTITY --secret-key" >&2
  exit 1
fi
echo "    Deployer identity: $IDENTITY ($DEPLOYER_PUBKEY)"

echo "    Network: $NETWORK ($NET_PASSPHRASE)"
echo "    RPC:     $NET_RPC_URL"

if [[ "$VALIDATE_ONLY" -eq 1 ]]; then
  echo "==> Validation passed (--validate-only); nothing deployed."
  exit 0
fi

# Deployer flags: name only, never a secret.
SRC_FLAGS=(--source-account "$IDENTITY")

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
    echo "ERROR: $WASM_IN not found after build." >&2
    exit 1
  fi

  "$STELLAR_CLI" contract optimize \
    --wasm     "$WASM_IN" \
    --wasm-out "$WASM_OUT"
  echo "    Optimized: $WASM_OUT"
done

# ─── UPLOAD WASM ──────────────────────────────────────────────────────────────
# Upload every WASM first. Deployments then reference the hash, which lets us
# derive contract IDs before anything is instantiated.

echo ""
echo "==> Uploading WASM binaries..."
MARKET_WASM_HASH=$("$STELLAR_CLI" contract upload \
  --wasm "$WASM_DIR/market.optimized.wasm" "${NET_FLAGS[@]}" "${SRC_FLAGS[@]}")
TREASURY_WASM_HASH=$("$STELLAR_CLI" contract upload \
  --wasm "$WASM_DIR/treasury.optimized.wasm" "${NET_FLAGS[@]}" "${SRC_FLAGS[@]}")
FACTORY_WASM_HASH=$("$STELLAR_CLI" contract upload \
  --wasm "$WASM_DIR/market_factory.optimized.wasm" "${NET_FLAGS[@]}" "${SRC_FLAGS[@]}")

echo "    Market WASM hash:      $MARKET_WASM_HASH"
echo "    Treasury WASM hash:    $TREASURY_WASM_HASH"
echo "    MarketFactory hash:    $FACTORY_WASM_HASH"

# ─── BET TOKEN ────────────────────────────────────────────────────────────────

echo ""
if [[ -n "${BET_TOKEN_ID:-}" ]]; then
  echo "==> Using bet token from BET_TOKEN_ID: $BET_TOKEN_ID"
else
  echo "==> No BET_TOKEN_ID set; using the native XLM Stellar Asset Contract..."
  BET_TOKEN_ID=$("$STELLAR_CLI" contract id asset --asset native "${NET_FLAGS[@]}")
  # Deploying an already-deployed SAC fails; that is fine, the ID is the same.
  "$STELLAR_CLI" contract asset deploy --asset native "${NET_FLAGS[@]}" "${SRC_FLAGS[@]}" \
    >/dev/null 2>&1 || true
fi
echo "    Bet token: $BET_TOKEN_ID"

# ─── SALTED IDS ───────────────────────────────────────────────────────────────
# Treasury needs the factory address at init time and the factory needs the
# treasury address at init time. Deploying with fixed salts lets us compute
# both IDs before either contract exists. The salt includes the network name,
# so the same WASM on two networks gets two different IDs.

sha256_hex() {
  if command -v sha256sum &>/dev/null; then
    sha256sum | cut -d' ' -f1
  else
    shasum -a 256 | cut -d' ' -f1
  fi
}

salt_for() {
  printf '%s' "boxmeout-${NETWORK}-$1" | sha256_hex
}
TREASURY_SALT=$(salt_for treasury)
FACTORY_SALT=$(salt_for market-factory)

TREASURY_ID=$("$STELLAR_CLI" contract id wasm --salt "$TREASURY_SALT" \
  --wasm-hash "$TREASURY_WASM_HASH" "${NET_FLAGS[@]}")
FACTORY_ID=$("$STELLAR_CLI" contract id wasm --salt "$FACTORY_SALT" \
  --wasm-hash "$FACTORY_WASM_HASH" "${NET_FLAGS[@]}")

echo ""
echo "==> Deploying Treasury at $TREASURY_ID..."
DEPLOYED=$("$STELLAR_CLI" contract deploy --wasm-hash "$TREASURY_WASM_HASH" \
  --salt "$TREASURY_SALT" "${NET_FLAGS[@]}" "${SRC_FLAGS[@]}")
[[ "$DEPLOYED" == "$TREASURY_ID" ]] || { echo "ERROR: Treasury id mismatch ($DEPLOYED)" >&2; exit 1; }

echo "==> Deploying MarketFactory at $FACTORY_ID..."
DEPLOYED=$("$STELLAR_CLI" contract deploy --wasm-hash "$FACTORY_WASM_HASH" \
  --salt "$FACTORY_SALT" "${NET_FLAGS[@]}" "${SRC_FLAGS[@]}")
[[ "$DEPLOYED" == "$FACTORY_ID" ]] || { echo "ERROR: MarketFactory id mismatch ($DEPLOYED)" >&2; exit 1; }

# ─── INITIALIZE ───────────────────────────────────────────────────────────────

echo ""
echo "==> Initializing Treasury..."
"$STELLAR_CLI" contract invoke --id "$TREASURY_ID" "${NET_FLAGS[@]}" "${SRC_FLAGS[@]}" -- initialize \
  --admin         "$DEPLOYER_PUBKEY" \
  --fee_bps       200 \
  --fee_recipient "$DEPLOYER_PUBKEY" \
  --factory       "$FACTORY_ID" \
  --token         "$BET_TOKEN_ID" \
  --daily_limit   "${DAILY_LIMIT:-100000000000}"

echo ""
echo "==> Initializing MarketFactory..."
"$STELLAR_CLI" contract invoke --id "$FACTORY_ID" "${NET_FLAGS[@]}" "${SRC_FLAGS[@]}" -- initialize \
  --admin              "$DEPLOYER_PUBKEY" \
  --market_wasm_hash   "$MARKET_WASM_HASH" \
  --treasury           "$TREASURY_ID" \
  --fee_collector      "$TREASURY_ID" \
  --default_fee_bp     200 \
  --min_bet_amount     1000000 \
  --max_bet_amount     100000000000 \
  --dispute_window_sec 86400

# ─── SAVE MANIFEST ────────────────────────────────────────────────────────────

echo ""
echo "==> Writing deployments manifest..."
mkdir -p "$DEPLOY_DIR"
MANIFEST="$DEPLOY_DIR/$NETWORK.json"
ENV_OUT="$DEPLOY_DIR/$NETWORK.env"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Write to a temp file then move, so a failed run never leaves a half-written manifest.
TMP_MANIFEST="$(mktemp "$DEPLOY_DIR/.$NETWORK.json.XXXXXX")"
jq -n \
  --arg network "$NETWORK" \
  --arg rpcUrl "$NET_RPC_URL" \
  --arg passphrase "$NET_PASSPHRASE" \
  --arg deployer "$DEPLOYER_PUBKEY" \
  --arg identity "$IDENTITY" \
  --arg token "$BET_TOKEN_ID" \
  --arg treasury "$TREASURY_ID" \
  --arg factory "$FACTORY_ID" \
  --arg marketWasmHash "$MARKET_WASM_HASH" \
  --arg treasuryWasmHash "$TREASURY_WASM_HASH" \
  --arg factoryWasmHash "$FACTORY_WASM_HASH" \
  --arg deployedAt "$DEPLOYED_AT" \
  '{
    network: $network,
    rpcUrl: $rpcUrl,
    networkPassphrase: $passphrase,
    deployer: { identity: $identity, publicKey: $deployer },
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
  }' > "$TMP_MANIFEST"
mv "$TMP_MANIFEST" "$MANIFEST"

# Snippets are generated from the manifest so the two never drift apart.
TREASURY_FROM_MANIFEST="$(jq -r .contracts.treasury "$MANIFEST")"
FACTORY_FROM_MANIFEST="$(jq -r .contracts.marketFactory "$MANIFEST")"
TOKEN_FROM_MANIFEST="$(jq -r .betToken "$MANIFEST")"

cat > "$ENV_OUT" <<ENVFILE
# BOXMEOUT $NETWORK — generated by deploy.sh from deployments/$NETWORK.json
NETWORK=$NETWORK
RPC_URL=$NET_RPC_URL
ADMIN_PUBKEY=$DEPLOYER_PUBKEY
BET_TOKEN_ID=$TOKEN_FROM_MANIFEST
TREASURY_CONTRACT_ID=$TREASURY_FROM_MANIFEST
MARKET_FACTORY_CONTRACT_ID=$FACTORY_FROM_MANIFEST
MARKET_WASM_HASH=$MARKET_WASM_HASH
ENVFILE

echo ""
echo "============================================================"
echo "  DEPLOYMENT COMPLETE ($NETWORK)"
echo "============================================================"
echo "  Treasury:         $TREASURY_FROM_MANIFEST"
echo "  MarketFactory:    $FACTORY_FROM_MANIFEST"
echo "  Market WASM hash: $MARKET_WASM_HASH"
echo "  Bet token:        $TOKEN_FROM_MANIFEST"
echo "============================================================"
echo ""
echo "  Manifest:         $MANIFEST"
echo "  Env snippet:      $ENV_OUT"
echo ""
echo "Paste these into backend/.env:"
echo "  MARKET_FACTORY_CONTRACT_ID=$FACTORY_FROM_MANIFEST"
echo "  TREASURY_CONTRACT_ID=$TREASURY_FROM_MANIFEST"
echo ""
echo "Paste these into frontend/.env.local:"
echo "  NEXT_PUBLIC_MARKET_FACTORY_CONTRACT_ID=$FACTORY_FROM_MANIFEST"
echo "  NEXT_PUBLIC_TREASURY_CONTRACT_ID=$TREASURY_FROM_MANIFEST"
echo "  NEXT_PUBLIC_BET_TOKEN_ID=$TOKEN_FROM_MANIFEST"
