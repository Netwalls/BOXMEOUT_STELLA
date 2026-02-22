#!/bin/bash
# =============================================================================
# Snapshot Contract State - Export current contract data for migration
# =============================================================================
# Usage: ./snapshot-state.sh <network>
# Example: ./snapshot-state.sh testnet
# =============================================================================

set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
NETWORK="${1:-testnet}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.contracts"
SNAPSHOT_DIR="$SCRIPT_DIR/snapshots"
TIMESTAMP=$(date -u '+%Y%m%d-%H%M%S')
SNAPSHOT_FILE="$SNAPSHOT_DIR/${NETWORK}-${TIMESTAMP}.json"

# Create snapshot directory
mkdir -p "$SNAPSHOT_DIR"

log_info "Snapshotting contract state on $NETWORK"
log_info "Output: $SNAPSHOT_FILE"

# Load contract addresses
if [ ! -f "$ENV_FILE" ]; then
    log_error "No .env.contracts found. Deploy contracts first."
    exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

# Verify required addresses
if [ -z "${ORACLE_CONTRACT_ADDRESS:-}" ] || \
   [ -z "${FACTORY_CONTRACT_ADDRESS:-}" ] || \
   [ -z "${TREASURY_CONTRACT_ADDRESS:-}" ] || \
   [ -z "${AMM_CONTRACT_ADDRESS:-}" ] || \
   [ -z "${MARKET_CONTRACT_ADDRESS:-}" ]; then
    log_error "Missing contract addresses in $ENV_FILE"
    exit 1
fi

log_success "Loaded contract addresses"

# Initialize JSON output
cat > "$SNAPSHOT_FILE" <<EOF
{
  "network": "$NETWORK",
  "timestamp": "$(date -u '+%Y-%m-%d %H:%M:%S UTC')",
  "contracts": {
    "oracle": "$ORACLE_CONTRACT_ADDRESS",
    "factory": "$FACTORY_CONTRACT_ADDRESS",
    "treasury": "$TREASURY_CONTRACT_ADDRESS",
    "amm": "$AMM_CONTRACT_ADDRESS",
    "market": "$MARKET_CONTRACT_ADDRESS",
    "usdc": "$USDC_TOKEN_ADDRESS"
  },
  "data": {
EOF

# Helper function to invoke contract and capture output
invoke_contract() {
    local contract_id="$1"
    local function="$2"
    shift 2
    local args=("$@")
    
    stellar contract invoke \
        --id "$contract_id" \
        --network "$NETWORK" \
        -- \
        "$function" \
        "${args[@]}" 2>/dev/null || echo "null"
}

# Snapshot Oracle
log_info "Snapshotting Oracle..."
ORACLE_COUNT=$(invoke_contract "$ORACLE_CONTRACT_ADDRESS" "get_oracle_count")

cat >> "$SNAPSHOT_FILE" <<EOF
    "oracle": {
      "oracle_count": $ORACLE_COUNT
    },
EOF

log_success "Oracle snapshot complete"

# Snapshot Factory
log_info "Snapshotting Factory..."
MARKET_COUNT=$(invoke_contract "$FACTORY_CONTRACT_ADDRESS" "get_market_count")
TREASURY_ADDR=$(invoke_contract "$FACTORY_CONTRACT_ADDRESS" "get_treasury")

cat >> "$SNAPSHOT_FILE" <<EOF
    "factory": {
      "market_count": $MARKET_COUNT,
      "treasury": "$TREASURY_ADDR"
    },
EOF

log_success "Factory snapshot complete (${MARKET_COUNT} markets)"

# Snapshot Treasury
log_info "Snapshotting Treasury..."
TOTAL_FEES=$(invoke_contract "$TREASURY_CONTRACT_ADDRESS" "get_total_fees" || echo "0")

cat >> "$SNAPSHOT_FILE" <<EOF
    "treasury": {
      "total_fees": $TOTAL_FEES
    },
EOF

log_success "Treasury snapshot complete"

# Snapshot AMM (basic info)
log_info "Snapshotting AMM..."

cat >> "$SNAPSHOT_FILE" <<EOF
    "amm": {
      "note": "AMM pool states require per-market queries"
    }
EOF

log_success "AMM snapshot complete"

# Close JSON
cat >> "$SNAPSHOT_FILE" <<EOF
  }
}
EOF

log_success "Snapshot saved to $SNAPSHOT_FILE"
echo ""
echo "Summary:"
echo "  Network:      $NETWORK"
echo "  Markets:      $MARKET_COUNT"
echo "  Oracle Count: $ORACLE_COUNT"
echo "  Total Fees:   $TOTAL_FEES stroops"
echo ""
echo "Use this snapshot for migration verification."
