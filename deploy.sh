#!/bin/bash
# =============================================================================
# BoxMeOut Stella - Soroban Contract Deployment Script
# =============================================================================
# Builds, optimizes, deploys, and initializes all 5 contracts.
# Outputs deployed contract addresses to .env.contracts
#
# Usage:
#   ./deploy.sh testnet              # Deploy to testnet (default)
#   ./deploy.sh mainnet              # Deploy to mainnet (with confirmation)
#   ./deploy.sh testnet --skip-build # Skip build step (use existing WASMs)
#   ./deploy.sh testnet --only-init  # Skip deploy, only initialize contracts
#
# Prerequisites:
#   - stellar CLI installed (https://soroban.stellar.org/docs/getting-started/setup)
#   - Rust + wasm32-unknown-unknown target installed
#   - An identity configured: stellar keys generate <name> --network testnet
# =============================================================================

set -euo pipefail

# ---- Colors & Formatting ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()    { echo -e "\n${BOLD}${CYAN}==> $1${NC}"; }

# ---- Script Directory ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACT_DIR="$SCRIPT_DIR/contracts/contracts/boxmeout"
WASM_DIR="$CONTRACT_DIR/target/wasm32-unknown-unknown/release"
ENV_FILE="$SCRIPT_DIR/.env.contracts"

# ---- Contracts ----
CONTRACTS=("oracle" "factory" "treasury" "amm" "market")

# ---- Parse Arguments ----
NETWORK="${1:-testnet}"
SKIP_BUILD=false
ONLY_INIT=false

for arg in "$@"; do
    case $arg in
        --skip-build) SKIP_BUILD=true ;;
        --only-init)  ONLY_INIT=true; SKIP_BUILD=true ;;
        testnet|mainnet) NETWORK="$arg" ;;
    esac
done

# ---- Network Configuration ----
case "$NETWORK" in
    testnet)
        RPC_URL="https://soroban-testnet.stellar.org"
        NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
        HORIZON_URL="https://horizon-testnet.stellar.org"
        ;;
    mainnet)
        RPC_URL="https://soroban-mainnet.stellar.org"
        NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
        HORIZON_URL="https://horizon.stellar.org"
        ;;
    *)
        log_error "Unknown network: $NETWORK (use 'testnet' or 'mainnet')"
        exit 1
        ;;
esac

# ---- Deployment Parameters (override via environment) ----
# Identity / source account for signing transactions
SOURCE_IDENTITY="${SOURCE_IDENTITY:-deployer}"

# Oracle configuration
ORACLE_REQUIRED_CONSENSUS="${ORACLE_REQUIRED_CONSENSUS:-2}"

# AMM configuration (max liquidity cap in stroops, default 1,000,000 USDC = 10^13 stroops)
AMM_MAX_LIQUIDITY_CAP="${AMM_MAX_LIQUIDITY_CAP:-10000000000000}"

# USDC token address (MUST be set for mainnet)
USDC_TOKEN_ADDRESS="${USDC_TOKEN_ADDRESS:-}"

# ---- Pre-flight Checks ----
log_step "Pre-flight Checks"

# Check stellar CLI
if ! command -v stellar &> /dev/null; then
    log_error "stellar CLI not found. Install from https://soroban.stellar.org/docs/getting-started/setup"
    exit 1
fi
log_success "stellar CLI found: $(stellar --version 2>/dev/null || echo 'unknown version')"

# Check source identity exists
if ! stellar keys address "$SOURCE_IDENTITY" &> /dev/null 2>&1; then
    log_error "Identity '$SOURCE_IDENTITY' not found."
    echo ""
    echo "  Create one with:"
    echo "    stellar keys generate $SOURCE_IDENTITY --network $NETWORK"
    echo ""
    echo "  Or set SOURCE_IDENTITY to an existing identity:"
    echo "    SOURCE_IDENTITY=mykey ./deploy.sh $NETWORK"
    exit 1
fi

ADMIN_ADDRESS=$(stellar keys address "$SOURCE_IDENTITY")
log_success "Source identity: $SOURCE_IDENTITY ($ADMIN_ADDRESS)"
log_info "Network: $NETWORK ($RPC_URL)"

# ---- Mainnet Safety Gate ----
if [ "$NETWORK" = "mainnet" ]; then
    echo ""
    log_warn "========================================="
    log_warn "  MAINNET DEPLOYMENT"
    log_warn "========================================="
    log_warn "Admin address: $ADMIN_ADDRESS"
    log_warn "This will deploy contracts to MAINNET."
    log_warn "Real funds will be used for fees."
    echo ""
    read -rp "Type 'DEPLOY TO MAINNET' to confirm: " confirmation
    if [ "$confirmation" != "DEPLOY TO MAINNET" ]; then
        log_error "Deployment cancelled."
        exit 1
    fi
    echo ""

    if [ -z "$USDC_TOKEN_ADDRESS" ]; then
        log_error "USDC_TOKEN_ADDRESS must be set for mainnet deployment."
        echo "  Export it before running: export USDC_TOKEN_ADDRESS=C..."
        exit 1
    fi
fi

# ---- USDC Token Setup ----
log_step "USDC Token Configuration"

if [ -n "$USDC_TOKEN_ADDRESS" ]; then
    log_success "Using provided USDC address: $USDC_TOKEN_ADDRESS"
else
    if [ "$NETWORK" = "testnet" ]; then
        log_info "No USDC_TOKEN_ADDRESS set. Deploying a test token on testnet..."
        USDC_TOKEN_ADDRESS=$(stellar contract asset deploy \
            --asset "USDC:$ADMIN_ADDRESS" \
            --source "$SOURCE_IDENTITY" \
            --network "$NETWORK" 2>&1 | tail -1)
        log_success "Test USDC token deployed: $USDC_TOKEN_ADDRESS"
    else
        log_error "USDC_TOKEN_ADDRESS is required for mainnet."
        exit 1
    fi
fi

# ---- Step 1: Build Contracts ----
if [ "$SKIP_BUILD" = false ]; then
    log_step "Step 1: Building Contracts"
    bash "$SCRIPT_DIR/build_contracts.sh"
    echo ""

    # Optimize WASMs
    log_info "Optimizing WASM files..."
    for contract in "${CONTRACTS[@]}"; do
        wasm_file="$WASM_DIR/${contract}.wasm"
        if [ -f "$wasm_file" ]; then
            stellar contract optimize --wasm "$wasm_file" 2>/dev/null || true
            size=$(wc -c < "$wasm_file" | tr -d ' ')
            log_success "Optimized ${contract}.wasm (${size} bytes)"
        else
            log_error "Missing ${contract}.wasm - build may have failed"
            exit 1
        fi
    done
else
    log_step "Step 1: Build (SKIPPED)"
    # Verify WASMs exist
    for contract in "${CONTRACTS[@]}"; do
        if [ ! -f "$WASM_DIR/${contract}.wasm" ]; then
            log_error "Missing ${contract}.wasm. Run without --skip-build first."
            exit 1
        fi
    done
    log_success "All WASM files present"
fi

# ---- Step 2: Deploy Contracts ----
declare -A CONTRACT_IDS

if [ "$ONLY_INIT" = false ]; then
    log_step "Step 2: Deploying Contracts to $NETWORK"

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
else
    log_step "Step 2: Deploy (SKIPPED - loading from $ENV_FILE)"
    if [ ! -f "$ENV_FILE" ]; then
        log_error "No $ENV_FILE found. Deploy contracts first (run without --only-init)."
        exit 1
    fi
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    CONTRACT_IDS[oracle]="${ORACLE_CONTRACT_ADDRESS:?Missing ORACLE_CONTRACT_ADDRESS in $ENV_FILE}"
    CONTRACT_IDS[factory]="${FACTORY_CONTRACT_ADDRESS:?Missing FACTORY_CONTRACT_ADDRESS in $ENV_FILE}"
    CONTRACT_IDS[treasury]="${TREASURY_CONTRACT_ADDRESS:?Missing TREASURY_CONTRACT_ADDRESS in $ENV_FILE}"
    CONTRACT_IDS[amm]="${AMM_CONTRACT_ADDRESS:?Missing AMM_CONTRACT_ADDRESS in $ENV_FILE}"
    CONTRACT_IDS[market]="${MARKET_CONTRACT_ADDRESS:?Missing MARKET_CONTRACT_ADDRESS in $ENV_FILE}"
    log_success "Loaded contract addresses from $ENV_FILE"
fi

# ---- Step 3: Write Contract Addresses ----
log_step "Step 3: Saving Contract Addresses"

cat > "$ENV_FILE" <<EOF
# BoxMeOut Stella - Deployed Contract Addresses
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
USDC_TOKEN_ADDRESS=$USDC_TOKEN_ADDRESS

# Admin
ADMIN_ADDRESS=$ADMIN_ADDRESS
EOF

log_success "Addresses saved to $ENV_FILE"

# ---- Step 4: Initialize Contracts ----
log_step "Step 4: Initializing Contracts"

# 4a. Initialize Oracle (no cross-contract deps)
log_info "Initializing Oracle (consensus=$ORACLE_REQUIRED_CONSENSUS)..."
stellar contract invoke \
    --id "${CONTRACT_IDS[oracle]}" \
    --source "$SOURCE_IDENTITY" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$ADMIN_ADDRESS" \
    --required_consensus "$ORACLE_REQUIRED_CONSENSUS"
log_success "Oracle initialized"

# 4b. Initialize Factory (needs USDC + Treasury address)
log_info "Initializing Factory..."
stellar contract invoke \
    --id "${CONTRACT_IDS[factory]}" \
    --source "$SOURCE_IDENTITY" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$ADMIN_ADDRESS" \
    --usdc "$USDC_TOKEN_ADDRESS" \
    --treasury "${CONTRACT_IDS[treasury]}"
log_success "Factory initialized"

# 4c. Initialize Treasury (needs USDC + Factory address)
log_info "Initializing Treasury..."
stellar contract invoke \
    --id "${CONTRACT_IDS[treasury]}" \
    --source "$SOURCE_IDENTITY" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$ADMIN_ADDRESS" \
    --usdc_contract "$USDC_TOKEN_ADDRESS" \
    --factory "${CONTRACT_IDS[factory]}"
log_success "Treasury initialized"

# 4d. Initialize AMM (needs Factory + USDC)
log_info "Initializing AMM (max_liquidity_cap=$AMM_MAX_LIQUIDITY_CAP)..."
stellar contract invoke \
    --id "${CONTRACT_IDS[amm]}" \
    --source "$SOURCE_IDENTITY" \
    --network "$NETWORK" \
    -- \
    initialize \
    --admin "$ADMIN_ADDRESS" \
    --factory "${CONTRACT_IDS[factory]}" \
    --usdc_token "$USDC_TOKEN_ADDRESS" \
    --max_liquidity_cap "$AMM_MAX_LIQUIDITY_CAP"
log_success "AMM initialized"

# 4e. Market contract - deployed but initialized per-market via Factory
log_info "Market contract deployed (initialized per-market via Factory.create_market)"
log_success "Market WASM ready for Factory to instantiate"

# ---- Step 5: Update Backend .env ----
log_step "Step 5: Backend Environment"

BACKEND_ENV="$SCRIPT_DIR/backend/.env"
if [ -f "$BACKEND_ENV" ]; then
    log_info "Updating $BACKEND_ENV with contract addresses..."

    update_env_var() {
        local key="$1" val="$2" file="$3"
        if grep -q "^${key}=" "$file" 2>/dev/null; then
            sed -i.bak "s|^${key}=.*|${key}=${val}|" "$file"
        else
            echo "${key}=${val}" >> "$file"
        fi
    }

    update_env_var "STELLAR_NETWORK"           "$NETWORK"                    "$BACKEND_ENV"
    update_env_var "STELLAR_HORIZON_URL"        "$HORIZON_URL"               "$BACKEND_ENV"
    update_env_var "STELLAR_SOROBAN_RPC_URL"    "$RPC_URL"                   "$BACKEND_ENV"
    update_env_var "FACTORY_CONTRACT_ADDRESS"   "${CONTRACT_IDS[factory]}"   "$BACKEND_ENV"
    update_env_var "MARKET_CONTRACT_ADDRESS"    "${CONTRACT_IDS[market]}"    "$BACKEND_ENV"
    update_env_var "TREASURY_CONTRACT_ADDRESS"  "${CONTRACT_IDS[treasury]}"  "$BACKEND_ENV"
    update_env_var "ORACLE_CONTRACT_ADDRESS"    "${CONTRACT_IDS[oracle]}"    "$BACKEND_ENV"
    update_env_var "AMM_CONTRACT_ADDRESS"       "${CONTRACT_IDS[amm]}"       "$BACKEND_ENV"
    update_env_var "USDC_TOKEN_ADDRESS"         "$USDC_TOKEN_ADDRESS"        "$BACKEND_ENV"

    # Clean up sed backup files
    rm -f "${BACKEND_ENV}.bak"

    log_success "Backend .env updated"
else
    log_warn "No backend/.env found. Copy backend/.env.example and re-run with --only-init,"
    log_warn "or manually copy values from $ENV_FILE"
fi

# ---- Summary ----
log_step "Deployment Complete!"
echo ""
echo -e "${BOLD}Network:${NC}    $NETWORK"
echo -e "${BOLD}Admin:${NC}      $ADMIN_ADDRESS"
echo -e "${BOLD}Env file:${NC}   $ENV_FILE"
echo ""
echo -e "${BOLD}Contract Addresses:${NC}"
echo -e "  Oracle:   ${GREEN}${CONTRACT_IDS[oracle]}${NC}"
echo -e "  Factory:  ${GREEN}${CONTRACT_IDS[factory]}${NC}"
echo -e "  Treasury: ${GREEN}${CONTRACT_IDS[treasury]}${NC}"
echo -e "  AMM:      ${GREEN}${CONTRACT_IDS[amm]}${NC}"
echo -e "  Market:   ${GREEN}${CONTRACT_IDS[market]}${NC}"
echo -e "  USDC:     ${GREEN}${USDC_TOKEN_ADDRESS}${NC}"
echo ""
echo -e "${BOLD}Next Steps:${NC}"
echo "  1. Verify contracts: stellar contract invoke --id <CONTRACT_ID> --network $NETWORK -- <function>"
echo "  2. Create a market:  stellar contract invoke --id ${CONTRACT_IDS[factory]} --network $NETWORK -- create_market ..."
echo "  3. Start backend:    cd backend && npm start"
echo ""
