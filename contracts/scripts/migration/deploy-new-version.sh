#!/bin/bash
# =============================================================================
# Deploy New Version - Deploy new contract version without initialization
# =============================================================================
# Usage: ./deploy-new-version.sh <network> <version>
# Example: ./deploy-new-version.sh testnet v2
# =============================================================================

set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${BOLD}${CYAN}==> $1${NC}"; }

# Parse arguments
NETWORK="${1:-testnet}"
VERSION="${2:-v2}"
SOURCE_IDENTITY="${SOURCE_IDENTITY:-deployer}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONTRACT_DIR="$PROJECT_ROOT/contracts/contracts/boxmeout"
WASM_DIR="$CONTRACT_DIR/target/wasm32-unknown-unknown/release"
ENV_FILE="$PROJECT_ROOT/.env.contracts.${VERSION}"

# Contracts to deploy
CONTRACTS=("oracle" "factory" "treasury" "amm" "market")

log_step "Deploying New Version: $VERSION on $NETWORK"

# Network configuration
case "$NETWORK" in
    testnet)
        RPC_URL="https://soroban-testnet.stellar.org"
        HORIZON_URL="https://horizon-testnet.stellar.org"
        ;;
    mainnet)
        RPC_URL="https://soroban-mainnet.stellar.org"
        HORIZON_URL="https://horizon.stellar.org"
        ;;
    *)
        log_error "Unknown network: $NETWORK"
        exit 1
        ;;
esac

# Verify source identity
if ! stellar keys address "$SOURCE_IDENTITY" &> /dev/null; then
    log_error "Identity '$SOURCE_IDENTITY' not found"
    exit 1
fi

ADMIN_ADDRESS=$(stellar keys address "$SOURCE_IDENTITY")
log_success "Source identity: $SOURCE_IDENTITY ($ADMIN_ADDRESS)"

# ============================================================================
# Step 1: Build Contracts
# ============================================================================
log_step "Step 1: Building Contracts"

cd "$CONTRACT_DIR"
for contract in "${CONTRACTS[@]}"; do
    log_info "Building $contract..."
    cargo build --release --target wasm32-unknown-unknown --features "$contract" --quiet
    log_success "$contract built"
done

# Optimize WASMs
log_info "Optimizing WASM files..."
for contract in "${CONTRACTS[@]}"; do
    wasm_file="$WASM_DIR/${contract}.wasm"
    if [ -f "$wasm_file" ]; then
        stellar contract optimize --wasm "$wasm_file" 2>/dev/null || true
        size=$(wc -c < "$wasm_file" | tr -d ' ')
        log_success "Optimized ${contract}.wasm (${size} bytes)"
    else
        log_error "Missing ${contract}.wasm"
        exit 1
    fi
done

# ============================================================================
# Step 2: Deploy Contracts
# ============================================================================
log_step "Step 2: Deploying Contracts"

declare -A CONTRACT_IDS

for contract in "${CONTRACTS[@]}"; do
    log_info "Deploying ${contract}..."
    wasm_file="$WASM_DIR/${contract}.wasm"
    
    contract_id=$(stellar contract deploy \
        --wasm "$wasm_file" \
        --source "$SOURCE_IDENTITY" \
        --network "$NETWORK" \
        2>&1 | tail -1)
    
    if [ -z "$contract_id" ] || [[ "$contract_id" == *"error"* ]]; then
        log_error "Failed to deploy ${contract}: $contract_id"
        exit 1
    fi
    
    CONTRACT_IDS[$contract]="$contract_id"
    log_success "${contract} deployed: $contract_id"
done

# ============================================================================
# Step 3: Save Contract Addresses
# ============================================================================
log_step "Step 3: Saving Contract Addresses"

# Get USDC address from v1 if exists, otherwise prompt
OLD_ENV="$PROJECT_ROOT/.env.contracts"
if [ -f "$OLD_ENV" ]; then
    # shellcheck source=/dev/null
    source "$OLD_ENV"
    USDC_ADDR="${USDC_TOKEN_ADDRESS:-}"
else
    USDC_ADDR=""
fi

if [ -z "$USDC_ADDR" ]; then
    if [ "$NETWORK" = "testnet" ]; then
        log_info "Deploying test USDC token..."
        USDC_ADDR=$(stellar contract asset deploy \
            --asset "USDC:$ADMIN_ADDRESS" \
            --source "$SOURCE_IDENTITY" \
            --network "$NETWORK" 2>&1 | tail -1)
        log_success "Test USDC deployed: $USDC_ADDR"
    else
        log_error "USDC_TOKEN_ADDRESS required for mainnet"
        exit 1
    fi
fi

cat > "$ENV_FILE" <<EOF
# BoxMeOut Stella - Deployed Contract Addresses
# Version: $VERSION
# Network: $NETWORK
# Deployed: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
# Admin: $ADMIN_ADDRESS

# Stellar Network
STELLAR_NETWORK=$NETWORK
STELLAR_HORIZON_URL=$HORIZON_URL
STELLAR_SOROBAN_RPC_URL=$RPC_URL

# Contract Addresses
ORACLE_CONTRACT_ADDRESS=${CONTRACT_IDS[oracle]}
FACTORY_CONTRACT_ADDRESS=${CONTRACT_IDS[factory]}
TREASURY_CONTRACT_ADDRESS=${CONTRACT_IDS[treasury]}
AMM_CONTRACT_ADDRESS=${CONTRACT_IDS[amm]}
MARKET_CONTRACT_ADDRESS=${CONTRACT_IDS[market]}
USDC_TOKEN_ADDRESS=$USDC_ADDR

# Admin
ADMIN_ADDRESS=$ADMIN_ADDRESS
EOF

log_success "Addresses saved to $ENV_FILE"

# ============================================================================
# Summary
# ============================================================================
log_step "Deployment Complete!"
echo ""
echo "Version:  $VERSION"
echo "Network:  $NETWORK"
echo "Env file: $ENV_FILE"
echo ""
echo "Contract Addresses:"
echo "  Oracle:   ${CONTRACT_IDS[oracle]}"
echo "  Factory:  ${CONTRACT_IDS[factory]}"
echo "  Treasury: ${CONTRACT_IDS[treasury]}"
echo "  AMM:      ${CONTRACT_IDS[amm]}"
echo "  Market:   ${CONTRACT_IDS[market]}"
echo "  USDC:     $USDC_ADDR"
echo ""
log_warn "Contracts deployed but NOT initialized"
echo ""
echo "Next steps:"
echo "  1. Migrate storage: ./migrate-storage.sh $NETWORK v1 $VERSION"
echo "  2. Verify migration: ./verify-migration.sh $NETWORK $VERSION"
echo "  3. Run smoke tests: ./smoke-test.sh $NETWORK $VERSION"
