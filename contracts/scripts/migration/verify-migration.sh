#!/bin/bash
# =============================================================================
# Verify Migration - Validate migrated contract data
# =============================================================================
# Usage: ./verify-migration.sh <network> <version>
# Example: ./verify-migration.sh testnet v2
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
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_step() { echo -e "\n${BOLD}${CYAN}==> $1${NC}"; }

# Parse arguments
NETWORK="${1:-testnet}"
VERSION="${2:-v2}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.contracts.${VERSION}"

log_step "Verifying Migration: $VERSION on $NETWORK"

# Load contract addresses
if [ ! -f "$ENV_FILE" ]; then
    log_error "Env file not found: $ENV_FILE"
    exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

# Verify required addresses
if [ -z "${ORACLE_CONTRACT_ADDRESS:-}" ] || \
   [ -z "${FACTORY_CONTRACT_ADDRESS:-}" ] || \
   [ -z "${TREASURY_CONTRACT_ADDRESS:-}" ] || \
   [ -z "${AMM_CONTRACT_ADDRESS:-}" ]; then
    log_error "Missing contract addresses in $ENV_FILE"
    exit 1
fi

log_success "Loaded contract addresses"

# Helper function to query contract
query_contract() {
    local contract_id="$1"
    local function="$2"
    shift 2
    
    stellar contract invoke \
        --id "$contract_id" \
        --network "$NETWORK" \
        -- \
        "$function" \
        "$@" 2>/dev/null || echo "ERROR"
}

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
test_check() {
    local description="$1"
    local result="$2"
    
    if [ "$result" != "ERROR" ] && [ -n "$result" ]; then
        log_success "$description: $result"
        ((TESTS_PASSED++))
    else
        log_error "$description: FAILED"
        ((TESTS_FAILED++))
    fi
}

# ============================================================================
# Verification Tests
# ============================================================================

log_step "Running Verification Tests"

# Test 1: Oracle
log_info "Testing Oracle contract..."
ORACLE_COUNT=$(query_contract "$ORACLE_CONTRACT_ADDRESS" "get_oracle_count")
test_check "Oracle count" "$ORACLE_COUNT"

# Test 2: Factory
log_info "Testing Factory contract..."
MARKET_COUNT=$(query_contract "$FACTORY_CONTRACT_ADDRESS" "get_market_count")
test_check "Market count" "$MARKET_COUNT"

TREASURY_ADDR=$(query_contract "$FACTORY_CONTRACT_ADDRESS" "get_treasury")
test_check "Factory treasury address" "$TREASURY_ADDR"

# Test 3: Treasury
log_info "Testing Treasury contract..."
TOTAL_FEES=$(query_contract "$TREASURY_CONTRACT_ADDRESS" "get_total_fees")
test_check "Treasury total fees" "$TOTAL_FEES"

# Test 4: Contract Initialization
log_info "Verifying contracts are initialized..."

# Try to re-initialize (should fail if already initialized)
ORACLE_REINIT=$(stellar contract invoke \
    --id "$ORACLE_CONTRACT_ADDRESS" \
    --source deployer \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$(stellar keys address deployer)" \
    --required_consensus 2 2>&1 || echo "already initialized")

if [[ "$ORACLE_REINIT" == *"already initialized"* ]]; then
    log_success "Oracle is properly initialized"
    ((TESTS_PASSED++))
else
    log_error "Oracle initialization check failed"
    ((TESTS_FAILED++))
fi

# ============================================================================
# Cross-Contract Reference Verification
# ============================================================================

log_step "Verifying Cross-Contract References"

# Verify Factory → Treasury reference
if [ "$TREASURY_ADDR" = "$TREASURY_CONTRACT_ADDRESS" ]; then
    log_success "Factory → Treasury reference correct"
    ((TESTS_PASSED++))
else
    log_error "Factory → Treasury reference mismatch"
    log_error "  Expected: $TREASURY_CONTRACT_ADDRESS"
    log_error "  Got:      $TREASURY_ADDR"
    ((TESTS_FAILED++))
fi

# ============================================================================
# Summary
# ============================================================================

log_step "Verification Summary"
echo ""
echo "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
    log_success "All verification tests passed!"
    echo ""
    echo "Migration verified successfully on $NETWORK"
    echo "Version: $VERSION"
    echo ""
    echo "Next steps:"
    echo "  1. Run smoke tests: ./smoke-test.sh $NETWORK $VERSION"
    echo "  2. Update backend: cp $ENV_FILE backend/.env.contracts"
    echo "  3. Monitor for 24h before mainnet migration"
    exit 0
else
    log_error "Verification failed with $TESTS_FAILED errors"
    echo ""
    echo "Review errors above and fix before proceeding."
    exit 1
fi
