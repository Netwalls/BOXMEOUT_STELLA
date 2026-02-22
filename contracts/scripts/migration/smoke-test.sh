#!/bin/bash
# =============================================================================
# Smoke Test - Post-migration validation tests
# =============================================================================
# Usage: ./smoke-test.sh <network> <version>
# Example: ./smoke-test.sh testnet v2
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
SOURCE_IDENTITY="${SOURCE_IDENTITY:-deployer}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.contracts.${VERSION}"

log_step "Smoke Tests: $VERSION on $NETWORK"

# Load contract addresses
if [ ! -f "$ENV_FILE" ]; then
    log_error "Env file not found: $ENV_FILE"
    exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

log_success "Loaded contract addresses"

# Get admin address
ADMIN_ADDRESS=$(stellar keys address "$SOURCE_IDENTITY")

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to run test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    log_info "Running: $test_name"
    
    if eval "$test_command" > /dev/null 2>&1; then
        log_success "$test_name"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "$test_name"
        ((TESTS_FAILED++))
        return 1
    fi
}

# ============================================================================
# Smoke Tests
# ============================================================================

log_step "Test 1: Read Operations"

# Test Oracle read
run_test "Oracle: get_oracle_count" \
    "stellar contract invoke --id $ORACLE_CONTRACT_ADDRESS --network $NETWORK -- get_oracle_count"

# Test Factory read
run_test "Factory: get_market_count" \
    "stellar contract invoke --id $FACTORY_CONTRACT_ADDRESS --network $NETWORK -- get_market_count"

run_test "Factory: get_treasury" \
    "stellar contract invoke --id $FACTORY_CONTRACT_ADDRESS --network $NETWORK -- get_treasury"

# Test Treasury read
run_test "Treasury: get_total_fees" \
    "stellar contract invoke --id $TREASURY_CONTRACT_ADDRESS --network $NETWORK -- get_total_fees"

log_step "Test 2: Market Creation (Write Operation)"

# Create a test market
CURRENT_TIME=$(date +%s)
CLOSING_TIME=$((CURRENT_TIME + 86400))    # +24 hours
RESOLUTION_TIME=$((CURRENT_TIME + 172800)) # +48 hours

log_info "Creating test market..."
log_info "  Closing time: $CLOSING_TIME"
log_info "  Resolution time: $RESOLUTION_TIME"

CREATE_RESULT=$(stellar contract invoke \
    --id "$FACTORY_CONTRACT_ADDRESS" \
    --source "$SOURCE_IDENTITY" \
    --network "$NETWORK" \
    -- \
    create_market \
    --creator "$ADMIN_ADDRESS" \
    --title "test_market" \
    --description "smoke_test" \
    --category "test" \
    --closing_time "$CLOSING_TIME" \
    --resolution_time "$RESOLUTION_TIME" 2>&1 || echo "FAILED")

if [[ "$CREATE_RESULT" != "FAILED" ]] && [[ "$CREATE_RESULT" != *"error"* ]]; then
    log_success "Market creation successful"
    ((TESTS_PASSED++))
    
    # Extract market ID (if output format allows)
    MARKET_ID=$(echo "$CREATE_RESULT" | tail -1)
    log_info "Market ID: $MARKET_ID"
else
    log_error "Market creation failed: $CREATE_RESULT"
    ((TESTS_FAILED++))
fi

log_step "Test 3: Post-Creation Verification"

# Verify market count increased
NEW_MARKET_COUNT=$(stellar contract invoke \
    --id "$FACTORY_CONTRACT_ADDRESS" \
    --network "$NETWORK" \
    -- \
    get_market_count 2>/dev/null || echo "0")

if [ "$NEW_MARKET_COUNT" -gt 0 ]; then
    log_success "Market count updated: $NEW_MARKET_COUNT"
    ((TESTS_PASSED++))
else
    log_error "Market count not updated"
    ((TESTS_FAILED++))
fi

# ============================================================================
# Summary
# ============================================================================

log_step "Smoke Test Summary"
echo ""
echo "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
    log_success "All smoke tests passed!"
    echo ""
    echo "Migration validated successfully on $NETWORK"
    echo "Version: $VERSION"
    echo ""
    echo "Safe to proceed with:"
    echo "  1. Update backend: cp $ENV_FILE backend/.env.contracts"
    echo "  2. Restart backend services"
    echo "  3. Monitor for 24-48 hours"
    echo "  4. Plan mainnet migration (if on testnet)"
    exit 0
else
    log_error "Smoke tests failed with $TESTS_FAILED errors"
    echo ""
    echo "DO NOT proceed to production."
    echo "Review errors and fix issues before continuing."
    exit 1
fi
