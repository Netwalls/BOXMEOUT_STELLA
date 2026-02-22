#!/bin/bash
# =============================================================================
# Test Migration on Testnet - Full end-to-end migration test
# =============================================================================
# This script performs a complete migration test on testnet:
# 1. Deploy v1 contracts
# 2. Create test data
# 3. Snapshot state
# 4. Deploy v2 contracts
# 5. Migrate storage
# 6. Verify migration
# 7. Run smoke tests
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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
NETWORK="testnet"
SOURCE_IDENTITY="${SOURCE_IDENTITY:-deployer}"

log_step "Full Migration Test on Testnet"
echo ""
echo "This will:"
echo "  1. Deploy v1 contracts (if not already deployed)"
echo "  2. Create test markets"
echo "  3. Snapshot current state"
echo "  4. Deploy v2 contracts"
echo "  5. Migrate storage v1 → v2"
echo "  6. Verify migration"
echo "  7. Run smoke tests"
echo ""
read -rp "Continue? (yes/no): " confirmation
if [ "$confirmation" != "yes" ]; then
    log_error "Test cancelled"
    exit 1
fi

# ============================================================================
# Step 1: Deploy v1 (if needed)
# ============================================================================
log_step "Step 1: Checking v1 Deployment"

V1_ENV="$PROJECT_ROOT/.env.contracts"
if [ -f "$V1_ENV" ]; then
    log_success "v1 contracts already deployed"
    # Backup as v1
    cp "$V1_ENV" "$PROJECT_ROOT/.env.contracts.v1"
else
    log_info "Deploying v1 contracts..."
    cd "$PROJECT_ROOT"
    ./deploy.sh testnet
    cp "$V1_ENV" "$PROJECT_ROOT/.env.contracts.v1"
    log_success "v1 deployed"
fi

# ============================================================================
# Step 2: Create Test Data
# ============================================================================
log_step "Step 2: Creating Test Data"

# shellcheck source=/dev/null
source "$PROJECT_ROOT/.env.contracts.v1"

ADMIN_ADDRESS=$(stellar keys address "$SOURCE_IDENTITY")
CURRENT_TIME=$(date +%s)
CLOSING_TIME=$((CURRENT_TIME + 86400))
RESOLUTION_TIME=$((CURRENT_TIME + 172800))

log_info "Creating test market..."
TEST_MARKET=$(stellar contract invoke \
    --id "$FACTORY_CONTRACT_ADDRESS" \
    --source "$SOURCE_IDENTITY" \
    --network testnet \
    -- \
    create_market \
    --creator "$ADMIN_ADDRESS" \
    --title "test_migration" \
    --description "migration_test" \
    --category "test" \
    --closing_time "$CLOSING_TIME" \
    --resolution_time "$RESOLUTION_TIME" 2>&1 | tail -1)

if [[ "$TEST_MARKET" != *"error"* ]]; then
    log_success "Test market created: $TEST_MARKET"
else
    log_warn "Market creation failed (may already exist): $TEST_MARKET"
fi

# ============================================================================
# Step 3: Snapshot State
# ============================================================================
log_step "Step 3: Snapshotting State"

cd "$SCRIPT_DIR"
./snapshot-state.sh testnet

log_success "State snapshot complete"

# ============================================================================
# Step 4: Deploy v2
# ============================================================================
log_step "Step 4: Deploying v2 Contracts"

./deploy-new-version.sh testnet v2

log_success "v2 contracts deployed"

# ============================================================================
# Step 5: Migrate Storage
# ============================================================================
log_step "Step 5: Migrating Storage"

./migrate-storage.sh testnet v1 v2 <<< "yes"

log_success "Storage migration complete"

# ============================================================================
# Step 6: Verify Migration
# ============================================================================
log_step "Step 6: Verifying Migration"

./verify-migration.sh testnet v2

if [ $? -eq 0 ]; then
    log_success "Migration verification passed"
else
    log_error "Migration verification failed"
    exit 1
fi

# ============================================================================
# Step 7: Smoke Tests
# ============================================================================
log_step "Step 7: Running Smoke Tests"

./smoke-test.sh testnet v2

if [ $? -eq 0 ]; then
    log_success "Smoke tests passed"
else
    log_error "Smoke tests failed"
    exit 1
fi

# ============================================================================
# Summary
# ============================================================================
log_step "Migration Test Complete!"
echo ""
log_success "All tests passed successfully"
echo ""
echo "Summary:"
echo "  Network:     testnet"
echo "  v1 env:      $PROJECT_ROOT/.env.contracts.v1"
echo "  v2 env:      $PROJECT_ROOT/.env.contracts.v2"
echo "  Snapshots:   $SCRIPT_DIR/snapshots/"
echo ""
echo "The migration process has been validated on testnet."
echo ""
echo "Next steps for mainnet migration:"
echo "  1. Review all test results"
echo "  2. Audit v2 contract code"
echo "  3. Schedule maintenance window"
echo "  4. Notify users (48h notice)"
echo "  5. Run migration on mainnet"
echo ""
log_warn "Keep v1 contracts active until v2 is fully validated in production"
