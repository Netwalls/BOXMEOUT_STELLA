#!/bin/bash
# =============================================================================
# Migrate Storage - Transfer data from old contracts to new contracts
# =============================================================================
# Usage: ./migrate-storage.sh <network> <old_version> <new_version>
# Example: ./migrate-storage.sh testnet v1 v2
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
OLD_VERSION="${2:-v1}"
NEW_VERSION="${3:-v2}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OLD_ENV="$PROJECT_ROOT/.env.contracts.${OLD_VERSION}"
NEW_ENV="$PROJECT_ROOT/.env.contracts.${NEW_VERSION}"
SOURCE_IDENTITY="${SOURCE_IDENTITY:-deployer}"

log_step "Storage Migration: $OLD_VERSION → $NEW_VERSION on $NETWORK"

# Verify environment files exist
if [ ! -f "$OLD_ENV" ]; then
    log_error "Old version env file not found: $OLD_ENV"
    exit 1
fi

if [ ! -f "$NEW_ENV" ]; then
    log_error "New version env file not found: $NEW_ENV"
    log_info "Deploy new version first: ./deploy-new-version.sh $NETWORK $NEW_VERSION"
    exit 1
fi

# Load old contract addresses
log_info "Loading old contract addresses from $OLD_ENV"
# shellcheck source=/dev/null
source "$OLD_ENV"
OLD_ORACLE="$ORACLE_CONTRACT_ADDRESS"
OLD_FACTORY="$FACTORY_CONTRACT_ADDRESS"
OLD_TREASURY="$TREASURY_CONTRACT_ADDRESS"
OLD_AMM="$AMM_CONTRACT_ADDRESS"
OLD_USDC="$USDC_TOKEN_ADDRESS"

# Load new contract addresses
log_info "Loading new contract addresses from $NEW_ENV"
# shellcheck source=/dev/null
source "$NEW_ENV"
NEW_ORACLE="$ORACLE_CONTRACT_ADDRESS"
NEW_FACTORY="$FACTORY_CONTRACT_ADDRESS"
NEW_TREASURY="$TREASURY_CONTRACT_ADDRESS"
NEW_AMM="$AMM_CONTRACT_ADDRESS"
NEW_USDC="$USDC_TOKEN_ADDRESS"

log_success "Contract addresses loaded"
echo ""
echo "Old Contracts:"
echo "  Oracle:   $OLD_ORACLE"
echo "  Factory:  $OLD_FACTORY"
echo "  Treasury: $OLD_TREASURY"
echo "  AMM:      $OLD_AMM"
echo ""
echo "New Contracts:"
echo "  Oracle:   $NEW_ORACLE"
echo "  Factory:  $NEW_FACTORY"
echo "  Treasury: $NEW_TREASURY"
echo "  AMM:      $NEW_AMM"
echo ""

# Confirmation prompt
read -rp "Proceed with migration? (yes/no): " confirmation
if [ "$confirmation" != "yes" ]; then
    log_error "Migration cancelled"
    exit 1
fi

# Helper function to invoke contract
invoke_contract() {
    local contract_id="$1"
    local function="$2"
    shift 2
    
    stellar contract invoke \
        --id "$contract_id" \
        --source "$SOURCE_IDENTITY" \
        --network "$NETWORK" \
        -- \
        "$function" \
        "$@"
}

# Helper function to query contract (read-only)
query_contract() {
    local contract_id="$1"
    local function="$2"
    shift 2
    
    stellar contract invoke \
        --id "$contract_id" \
        --network "$NETWORK" \
        -- \
        "$function" \
        "$@" 2>/dev/null || echo "null"
}

# ============================================================================
# Step 1: Export data from old contracts
# ============================================================================
log_step "Step 1: Exporting data from old contracts"

# Export Oracle data
log_info "Exporting Oracle data..."
ORACLE_COUNT=$(query_contract "$OLD_ORACLE" "get_oracle_count")
log_success "Oracle count: $ORACLE_COUNT"

# Export Factory data
log_info "Exporting Factory data..."
MARKET_COUNT=$(query_contract "$OLD_FACTORY" "get_market_count")
TREASURY_ADDR=$(query_contract "$OLD_FACTORY" "get_treasury")
log_success "Market count: $MARKET_COUNT"
log_success "Treasury address: $TREASURY_ADDR"

# Export Treasury data
log_info "Exporting Treasury data..."
TOTAL_FEES=$(query_contract "$OLD_TREASURY" "get_total_fees" || echo "0")
log_success "Total fees: $TOTAL_FEES stroops"

log_success "Data export complete"

# ============================================================================
# Step 2: Initialize new contracts with migrated data
# ============================================================================
log_step "Step 2: Initializing new contracts"

# Get admin address
ADMIN_ADDRESS=$(stellar keys address "$SOURCE_IDENTITY")

# Initialize Oracle
log_info "Initializing new Oracle..."
invoke_contract "$NEW_ORACLE" "initialize" \
    --admin "$ADMIN_ADDRESS" \
    --required_consensus 2
log_success "Oracle initialized"

# Initialize Factory (with new Treasury address)
log_info "Initializing new Factory..."
invoke_contract "$NEW_FACTORY" "initialize" \
    --admin "$ADMIN_ADDRESS" \
    --usdc "$NEW_USDC" \
    --treasury "$NEW_TREASURY"
log_success "Factory initialized"

# Initialize Treasury (with new Factory address)
log_info "Initializing new Treasury..."
invoke_contract "$NEW_TREASURY" "initialize" \
    --admin "$ADMIN_ADDRESS" \
    --usdc_contract "$NEW_USDC" \
    --factory "$NEW_FACTORY"
log_success "Treasury initialized"

# Initialize AMM
log_info "Initializing new AMM..."
invoke_contract "$NEW_AMM" "initialize" \
    --admin "$ADMIN_ADDRESS" \
    --factory "$NEW_FACTORY" \
    --usdc_token "$NEW_USDC" \
    --max_liquidity_cap 10000000000000
log_success "AMM initialized"

# ============================================================================
# Step 3: Migrate market data (if applicable)
# ============================================================================
log_step "Step 3: Market Data Migration"

if [ "$MARKET_COUNT" -gt 0 ]; then
    log_warn "Market migration requires custom logic per market"
    log_warn "Markets: $MARKET_COUNT"
    log_info "Manual steps required:"
    echo "  1. Export market metadata from old Factory"
    echo "  2. Recreate markets in new Factory"
    echo "  3. Migrate predictions and AMM pools"
    echo ""
    log_info "See CONTRACT_MIGRATION_STRATEGY.md for detailed instructions"
else
    log_success "No markets to migrate"
fi

# ============================================================================
# Summary
# ============================================================================
log_step "Migration Complete!"
echo ""
echo "Summary:"
echo "  Network:        $NETWORK"
echo "  Old Version:    $OLD_VERSION"
echo "  New Version:    $NEW_VERSION"
echo "  Markets:        $MARKET_COUNT"
echo "  Oracle Count:   $ORACLE_COUNT"
echo "  Total Fees:     $TOTAL_FEES stroops"
echo ""
echo "Next Steps:"
echo "  1. Verify migration: ./verify-migration.sh $NETWORK $NEW_VERSION"
echo "  2. Run smoke tests: ./smoke-test.sh $NETWORK $NEW_VERSION"
echo "  3. Update backend: cp $NEW_ENV backend/.env.contracts"
echo ""
log_warn "Old contracts are still active. Update backend to use new addresses."
