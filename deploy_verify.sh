#!/bin/bash
# =============================================================================
# BoxMeOut Stella - Post-Deployment Verification Script
# =============================================================================
# Verifies that all contracts are deployed and initialized correctly.
#
# Usage:
#   ./deploy_verify.sh              # Uses .env.contracts
#   ./deploy_verify.sh mainnet      # Verify mainnet deployment
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail()    { echo -e "${RED}[FAIL]${NC} $1"; }
log_step()    { echo -e "\n${BOLD}${CYAN}==> $1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.contracts"

if [ ! -f "$ENV_FILE" ]; then
    log_fail "No .env.contracts found. Run deploy.sh first."
    exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

NETWORK="${1:-$STELLAR_NETWORK}"
SOURCE_IDENTITY="${SOURCE_IDENTITY:-deployer}"
PASS=0
FAIL=0

log_step "Verifying Deployment on $NETWORK"
echo ""

# Check stellar CLI
if ! command -v stellar &> /dev/null; then
    log_fail "stellar CLI not found"
    exit 1
fi

# Verify each contract exists on-chain
log_step "Contract Existence Checks"

for name_var in "Oracle:$ORACLE_CONTRACT_ADDRESS" "Factory:$FACTORY_CONTRACT_ADDRESS" "Treasury:$TREASURY_CONTRACT_ADDRESS" "AMM:$AMM_CONTRACT_ADDRESS" "Market:$MARKET_CONTRACT_ADDRESS"; do
    name="${name_var%%:*}"
    address="${name_var#*:}"

    if [ -z "$address" ]; then
        log_fail "$name: address not set"
        FAIL=$((FAIL + 1))
        continue
    fi

    # Try to fetch contract info
    result=$(stellar contract info interface \
        --id "$address" \
        --network "$NETWORK" 2>&1 || true)

    if [[ "$result" == *"error"* ]] || [ -z "$result" ]; then
        log_fail "$name ($address): not found on $NETWORK"
        FAIL=$((FAIL + 1))
    else
        log_success "$name ($address): exists on-chain"
        PASS=$((PASS + 1))
    fi
done

# Verify initializations by calling read-only functions
log_step "Initialization Checks"

# Oracle - check oracle count
log_info "Checking Oracle initialization..."
oracle_result=$(stellar contract invoke \
    --id "$ORACLE_CONTRACT_ADDRESS" \
    --network "$NETWORK" \
    --source "$SOURCE_IDENTITY" \
    -- \
    get_oracle_count 2>&1 || true)

if [[ "$oracle_result" == *"error"* ]] || [[ "$oracle_result" == *"Error"* ]]; then
    log_fail "Oracle: not initialized or get_oracle_count failed"
    FAIL=$((FAIL + 1))
else
    log_success "Oracle: initialized (oracle_count=$oracle_result)"
    PASS=$((PASS + 1))
fi

# Factory - check market count
log_info "Checking Factory initialization..."
factory_result=$(stellar contract invoke \
    --id "$FACTORY_CONTRACT_ADDRESS" \
    --network "$NETWORK" \
    --source "$SOURCE_IDENTITY" \
    -- \
    get_market_count 2>&1 || true)

if [[ "$factory_result" == *"error"* ]] || [[ "$factory_result" == *"Error"* ]]; then
    log_fail "Factory: not initialized or get_market_count failed"
    FAIL=$((FAIL + 1))
else
    log_success "Factory: initialized (market_count=$factory_result)"
    PASS=$((PASS + 1))
fi

# Treasury - check total fees
log_info "Checking Treasury initialization..."
treasury_result=$(stellar contract invoke \
    --id "$TREASURY_CONTRACT_ADDRESS" \
    --network "$NETWORK" \
    --source "$SOURCE_IDENTITY" \
    -- \
    get_total_fees 2>&1 || true)

if [[ "$treasury_result" == *"error"* ]] || [[ "$treasury_result" == *"Error"* ]]; then
    log_fail "Treasury: not initialized or get_total_fees failed"
    FAIL=$((FAIL + 1))
else
    log_success "Treasury: initialized (total_fees=$treasury_result)"
    PASS=$((PASS + 1))
fi

# Summary
log_step "Verification Summary"
echo ""
echo -e "  ${GREEN}Passed:${NC} $PASS"
echo -e "  ${RED}Failed:${NC} $FAIL"
echo -e "  ${BOLD}Total:${NC}  $((PASS + FAIL))"
echo ""

if [ "$FAIL" -gt 0 ]; then
    log_fail "Some checks failed. Review the output above."
    exit 1
else
    log_success "All checks passed!"
fi
