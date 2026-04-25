#!/usr/bin/env bash
# ============================================================
# BOXMEOUT — Contract Deploy Script
# Deploys MarketFactory, Market wasm, and Treasury to Stellar.
#
# Usage: ./deploy.sh [testnet|mainnet]
#
# Environment variables:
#   ADMIN_SECRET_KEY - Stellar secret key for admin account
#   ORACLE_ADDRESSES - Comma-separated oracle addresses (optional)
#   DEFAULT_FEE_BPS - Default fee in basis points (default: 200)
#   WITHDRAWAL_LIMIT - Treasury withdrawal limit (default: 1000000000)
# ============================================================

set -euo pipefail

NETWORK=${1:-testnet}
OUTPUT_FILE=".contract-addresses.env"
CONTRACTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${CONTRACTS_DIR}/target/wasm32-unknown-unknown/release"

# Configuration
ADMIN_SECRET_KEY="${ADMIN_SECRET_KEY:-}"
ORACLE_ADDRESSES="${ORACLE_ADDRESSES:-}"
DEFAULT_FEE_BPS="${DEFAULT_FEE_BPS:-200}"
WITHDRAWAL_LIMIT="${WITHDRAWAL_LIMIT:-1000000000}"

if [ -z "$ADMIN_SECRET_KEY" ]; then
    echo "Error: ADMIN_SECRET_KEY environment variable not set"
    exit 1
fi

echo "Deploying to: $NETWORK"
echo "========================================"

# 1. Build all contracts
echo "Building contracts..."
cd "$CONTRACTS_DIR"
cargo build --release --target wasm32-unknown-unknown

# Optimize each wasm
echo "Optimizing wasm files..."
for wasm in "$BUILD_DIR"/*.wasm; do
    if [ -f "$wasm" ]; then
        echo "  Optimizing $(basename "$wasm")..."
        stellar contract optimize --wasm "$wasm"
    fi
done

# 2. Deploy MarketFactory
echo "Deploying MarketFactory..."
MARKET_FACTORY_ADDRESS=$(stellar contract deploy \
    --wasm "$BUILD_DIR/market_factory.wasm" \
    --source "$ADMIN_SECRET_KEY" \
    --network "$NETWORK" \
    2>&1 | grep -oP '(?<=Contract ID: )[A-Z0-9]+' || echo "")

if [ -z "$MARKET_FACTORY_ADDRESS" ]; then
    echo "Error: Failed to deploy MarketFactory"
    exit 1
fi
echo "  MarketFactory deployed: $MARKET_FACTORY_ADDRESS"

# 3. Deploy Market wasm (upload only, factory creates instances)
echo "Deploying Market wasm..."
MARKET_WASM_HASH=$(stellar contract deploy \
    --wasm "$BUILD_DIR/market.wasm" \
    --source "$ADMIN_SECRET_KEY" \
    --network "$NETWORK" \
    2>&1 | grep -oP '(?<=Wasm Hash: )[a-f0-9]+' || echo "")

if [ -z "$MARKET_WASM_HASH" ]; then
    echo "Error: Failed to deploy Market wasm"
    exit 1
fi
echo "  Market wasm deployed: $MARKET_WASM_HASH"

# 4. Deploy Treasury
echo "Deploying Treasury..."
TREASURY_ADDRESS=$(stellar contract deploy \
    --wasm "$BUILD_DIR/treasury.wasm" \
    --source "$ADMIN_SECRET_KEY" \
    --network "$NETWORK" \
    2>&1 | grep -oP '(?<=Contract ID: )[A-Z0-9]+' || echo "")

if [ -z "$TREASURY_ADDRESS" ]; then
    echo "Error: Failed to deploy Treasury"
    exit 1
fi
echo "  Treasury deployed: $TREASURY_ADDRESS"

# 5. Initialize MarketFactory
echo "Initializing MarketFactory..."
ADMIN_ADDRESS=$(stellar account info --source "$ADMIN_SECRET_KEY" --network "$NETWORK" 2>&1 | grep -oP '(?<=Account ID: )[A-Z0-9]+' || echo "")

if [ -z "$ADMIN_ADDRESS" ]; then
    echo "Error: Failed to extract admin address"
    exit 1
fi

# Build oracle list (if provided)
ORACLE_ARGS=""
if [ -n "$ORACLE_ADDRESSES" ]; then
    ORACLE_ARGS="--oracle-addresses $ORACLE_ADDRESSES"
fi

stellar contract invoke \
    --id "$MARKET_FACTORY_ADDRESS" \
    --source "$ADMIN_SECRET_KEY" \
    --network "$NETWORK" \
    -- initialize \
    --admin "$ADMIN_ADDRESS" \
    --default-fee-bps "$DEFAULT_FEE_BPS" \
    $ORACLE_ARGS

echo "  MarketFactory initialized"

# 6. Initialize Treasury
echo "Initializing Treasury..."
stellar contract invoke \
    --id "$TREASURY_ADDRESS" \
    --source "$ADMIN_SECRET_KEY" \
    --network "$NETWORK" \
    -- initialize \
    --admin "$ADMIN_ADDRESS" \
    --withdrawal-limit "$WITHDRAWAL_LIMIT"

echo "  Treasury initialized"

# 7. Write addresses to output file
echo "Writing addresses to $OUTPUT_FILE..."
rm -f "$OUTPUT_FILE"
cat > "$OUTPUT_FILE" << EOF
# BOXMEOUT Contract Addresses
# Network: $NETWORK
# Deployed: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

MARKET_FACTORY_ADDRESS=$MARKET_FACTORY_ADDRESS
MARKET_WASM_HASH=$MARKET_WASM_HASH
TREASURY_ADDRESS=$TREASURY_ADDRESS
ADMIN_ADDRESS=$ADMIN_ADDRESS
NETWORK=$NETWORK
EOF

echo ""
echo "========================================"
echo "Deployment complete!"
echo "Addresses saved to $OUTPUT_FILE"
echo ""
echo "Summary:"
echo "  MarketFactory: $MARKET_FACTORY_ADDRESS"
echo "  Market Wasm:   $MARKET_WASM_HASH"
echo "  Treasury:      $TREASURY_ADDRESS"
echo "  Admin:         $ADMIN_ADDRESS"
echo "  Network:       $NETWORK"
