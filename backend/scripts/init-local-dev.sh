#!/bin/bash
# =============================================================================
# BoxMeOut Stella - Local Development Initialization Script
# =============================================================================
# This script runs inside the Docker container to:
# 1. Wait for Soroban node to be ready
# 2. Deploy and initialize all contracts to local Soroban
# 3. Run database migrations
# 4. Seed database with test markets
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INIT]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
SOROBAN_RPC_URL="${SOROBAN_RPC_URL:-http://soroban:8001}"
HORIZON_URL="${HORIZON_URL:-http://soroban:8000}"
MAX_RETRIES=30
RETRY_DELAY=2

# Wait for Soroban RPC to be ready
log_info "Waiting for Soroban RPC at $SOROBAN_RPC_URL..."
for i in $(seq 1 $MAX_RETRIES); do
    if curl -s -X POST "$SOROBAN_RPC_URL" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q "healthy"; then
        log_success "Soroban RPC is ready"
        break
    fi
    
    if [ $i -eq $MAX_RETRIES ]; then
        log_error "Soroban RPC failed to become ready after $MAX_RETRIES attempts"
        exit 1
    fi
    
    log_info "Attempt $i/$MAX_RETRIES - waiting ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
done

# Check if stellar CLI is available
if ! command -v stellar &> /dev/null; then
    log_error "stellar CLI not found. Install it in the Docker image."
    exit 1
fi

# Generate or load deployer identity
log_info "Setting up deployer identity..."
if ! stellar keys address deployer &> /dev/null 2>&1; then
    stellar keys generate deployer --network standalone
    log_success "Generated new deployer identity"
else
    log_info "Using existing deployer identity"
fi

ADMIN_ADDRESS=$(stellar keys address deployer)
log_info "Admin address: $ADMIN_ADDRESS"

# Fund the admin account on standalone network
log_info "Funding admin account..."
curl -s "$HORIZON_URL/friendbot?addr=$ADMIN_ADDRESS" > /dev/null || true
log_success "Admin account funded"

# Deploy test USDC token
log_info "Deploying test USDC token..."
USDC_TOKEN_ADDRESS=$(stellar contract asset deploy \
    --asset "USDC:$ADMIN_ADDRESS" \
    --source deployer \
    --network standalone \
    --rpc-url "$SOROBAN_RPC_URL" 2>&1 | tail -1)
log_success "USDC token deployed: $USDC_TOKEN_ADDRESS"

# Build contracts if WASMs don't exist
WASM_DIR="/app/contracts/contracts/boxmeout/target/wasm32-unknown-unknown/release"
if [ ! -f "$WASM_DIR/oracle.wasm" ]; then
    log_info "Building contracts..."
    cd /app/contracts
    cargo build --release --target wasm32-unknown-unknown
    log_success "Contracts built"
fi

# Deploy contracts
log_info "Deploying contracts..."
declare -A CONTRACT_IDS

for contract in oracle factory treasury amm market; do
    log_info "Deploying ${contract}..."
    wasm_file="$WASM_DIR/${contract}.wasm"
    
    if [ ! -f "$wasm_file" ]; then
        log_error "WASM file not found: $wasm_file"
        exit 1
    fi
    
    contract_id=$(stellar contract deploy \
        --wasm "$wasm_file" \
        --source deployer \
        --network standalone \
        --rpc-url "$SOROBAN_RPC_URL" 2>&1 | tail -1)
    
    CONTRACT_IDS[$contract]="$contract_id"
    log_success "${contract} deployed: $contract_id"
done

# Initialize contracts
log_info "Initializing Oracle..."
stellar contract invoke \
    --id "${CONTRACT_IDS[oracle]}" \
    --source deployer \
    --network standalone \
    --rpc-url "$SOROBAN_RPC_URL" \
    -- initialize \
    --admin "$ADMIN_ADDRESS" \
    --required_consensus 2

log_info "Initializing Factory..."
stellar contract invoke \
    --id "${CONTRACT_IDS[factory]}" \
    --source deployer \
    --network standalone \
    --rpc-url "$SOROBAN_RPC_URL" \
    -- initialize \
    --admin "$ADMIN_ADDRESS" \
    --usdc "$USDC_TOKEN_ADDRESS" \
    --treasury "${CONTRACT_IDS[treasury]}"

log_info "Initializing Treasury..."
stellar contract invoke \
    --id "${CONTRACT_IDS[treasury]}" \
    --source deployer \
    --network standalone \
    --rpc-url "$SOROBAN_RPC_URL" \
    -- initialize \
    --admin "$ADMIN_ADDRESS" \
    --usdc_contract "$USDC_TOKEN_ADDRESS" \
    --factory "${CONTRACT_IDS[factory]}"

log_info "Initializing AMM..."
stellar contract invoke \
    --id "${CONTRACT_IDS[amm]}" \
    --source deployer \
    --network standalone \
    --rpc-url "$SOROBAN_RPC_URL" \
    -- initialize \
    --admin "$ADMIN_ADDRESS" \
    --factory "${CONTRACT_IDS[factory]}" \
    --usdc_token "$USDC_TOKEN_ADDRESS" \
    --max_liquidity_cap 10000000000000

log_success "All contracts initialized"

# Update environment variables
log_info "Updating environment variables..."
cat > /app/.env.local <<EOF
STELLAR_NETWORK=standalone
STELLAR_HORIZON_URL=$HORIZON_URL
STELLAR_SOROBAN_RPC_URL=$SOROBAN_RPC_URL
ORACLE_CONTRACT_ADDRESS=${CONTRACT_IDS[oracle]}
FACTORY_CONTRACT_ADDRESS=${CONTRACT_IDS[factory]}
TREASURY_CONTRACT_ADDRESS=${CONTRACT_IDS[treasury]}
AMM_CONTRACT_ADDRESS=${CONTRACT_IDS[amm]}
MARKET_CONTRACT_ADDRESS=${CONTRACT_IDS[market]}
USDC_TOKEN_ADDRESS=$USDC_TOKEN_ADDRESS
ADMIN_WALLET_SECRET=$(stellar keys show deployer)
ADMIN_ADDRESS=$ADMIN_ADDRESS
EOF

# Export for current session
export STELLAR_NETWORK=standalone
export STELLAR_HORIZON_URL=$HORIZON_URL
export STELLAR_SOROBAN_RPC_URL=$SOROBAN_RPC_URL
export ORACLE_CONTRACT_ADDRESS=${CONTRACT_IDS[oracle]}
export FACTORY_CONTRACT_ADDRESS=${CONTRACT_IDS[factory]}
export TREASURY_CONTRACT_ADDRESS=${CONTRACT_IDS[treasury]}
export AMM_CONTRACT_ADDRESS=${CONTRACT_IDS[amm]}
export MARKET_CONTRACT_ADDRESS=${CONTRACT_IDS[market]}
export USDC_TOKEN_ADDRESS=$USDC_TOKEN_ADDRESS

log_success "Environment variables updated"

# Run database migrations
log_info "Running database migrations..."
cd /app
npx prisma migrate deploy
log_success "Database migrations complete"

# Seed database
log_info "Seeding database with test markets..."
npx prisma db seed
log_success "Database seeded"

log_success "Local development environment initialized successfully!"
echo ""
echo "Contract Addresses:"
echo "  Oracle:   ${CONTRACT_IDS[oracle]}"
echo "  Factory:  ${CONTRACT_IDS[factory]}"
echo "  Treasury: ${CONTRACT_IDS[treasury]}"
echo "  AMM:      ${CONTRACT_IDS[amm]}"
echo "  Market:   ${CONTRACT_IDS[market]}"
echo "  USDC:     $USDC_TOKEN_ADDRESS"
echo ""
