#!/usr/bin/env bash
# =============================================================================
# BoxMeOut Stella — Run All Load Tests
# =============================================================================
# Usage: ./run-all.sh [--base-url http://localhost:3000] [--scenario <name>]
#
# Prerequisites:
#   brew install k6   (macOS)
#   sudo apt install k6   (Linux)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
BASE_URL="${BASE_URL:-http://localhost:3000}"
WS_URL="${WS_URL:-ws://localhost:3000}"
MARKET_ID="${MARKET_ID:-test-market-1}"
SCENARIO="${1:-all}"

# Parse flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --base-url) BASE_URL="$2"; shift 2;;
    --ws-url) WS_URL="$2"; shift 2;;
    --market-id) MARKET_ID="$2"; shift 2;;
    --scenario) SCENARIO="$2"; shift 2;;
    *) shift;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  BoxMeOut Stella — Load Testing Suite          ║${NC}"
echo -e "${BLUE}╠════════════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║  Target:  ${NC}${BASE_URL}"
echo -e "${BLUE}║  WS:      ${NC}${WS_URL}"
echo -e "${BLUE}║  Market:  ${NC}${MARKET_ID}"
echo -e "${BLUE}║  Scenario:${NC} ${SCENARIO}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Check k6 is installed
if ! command -v k6 &> /dev/null; then
  echo -e "${RED}Error: k6 is not installed.${NC}"
  echo "Install with: brew install k6 (macOS) or see https://k6.io/docs/get-started/installation/"
  exit 1
fi

# Check server is reachable
echo -e "${YELLOW}Checking server health...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" != "200" ]; then
  echo -e "${RED}Warning: Server at ${BASE_URL}/health returned HTTP ${HTTP_CODE}${NC}"
  echo -e "${YELLOW}Tests may fail. Make sure the server is running.${NC}"
  echo ""
fi

# Create results directory
mkdir -p "${RESULTS_DIR}"

# Export environment variables for k6
export BASE_URL WS_URL MARKET_ID

run_test() {
  local name="$1"
  local script="$2"

  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}Running: ${name}${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  local start_time
  start_time=$(date +%s)

  if k6 run \
    -e BASE_URL="${BASE_URL}" \
    -e WS_URL="${WS_URL}" \
    -e MARKET_ID="${MARKET_ID}" \
    "${SCRIPT_DIR}/${script}"; then
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo -e "${GREEN}✓ ${name} completed in ${duration}s${NC}"
  else
    echo -e "${RED}✗ ${name} failed${NC}"
  fi
}

case "${SCENARIO}" in
  all)
    run_test "API Baseline" "scenarios/api-baseline.js"
    run_test "WebSocket Connections (1000)" "scenarios/websocket-connections.js"
    run_test "Predictions Burst (100)" "scenarios/predictions-burst.js"
    run_test "AMM High-Frequency Trading" "scenarios/amm-high-frequency.js"
    ;;
  baseline)
    run_test "API Baseline" "scenarios/api-baseline.js"
    ;;
  websocket)
    run_test "WebSocket Connections (1000)" "scenarios/websocket-connections.js"
    ;;
  predictions)
    run_test "Predictions Burst (100)" "scenarios/predictions-burst.js"
    ;;
  amm)
    run_test "AMM High-Frequency Trading" "scenarios/amm-high-frequency.js"
    ;;
  *)
    echo -e "${RED}Unknown scenario: ${SCENARIO}${NC}"
    echo "Available: all, baseline, websocket, predictions, amm"
    exit 1
    ;;
esac

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}All tests complete. Results in: ${RESULTS_DIR}/${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Print summary if result files exist
if ls "${RESULTS_DIR}"/*.json 1>/dev/null 2>&1; then
  echo -e "\n${YELLOW}Result files:${NC}"
  for f in "${RESULTS_DIR}"/*.json; do
    echo "  - $(basename "$f")"
  done
fi
