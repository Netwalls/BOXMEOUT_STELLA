#!/usr/bin/env bash
# ==============================================================================
# BOXMEOUT — Post-deploy smoke test
# ==============================================================================
#
# Verifies that the three deployed contracts are wired together correctly by
# running read-only checks through the Stellar CLI. Optionally exercises the
# write path (create market, place minimum bet, lock) against Testnet.
#
# Usage:
#   ADMIN_SECRET=SABC... ./smoke_test.sh
#
# Optional environment:
#   TREASURY_CONTRACT_ID / MARKET_FACTORY_CONTRACT_ID / BET_TOKEN_ID
#                    Override IDs (defaults read from deployed.testnet.json).
#   EXPECTED_ORACLE  Oracle address expected in the factory whitelist.
#                    Defaults to the admin public key.
#   RUN_WRITE_PATH   Set to 1 to run the optional write-path checks.
#
# Exit code is non-zero if any check fails; each failure prints a clear message.
# ==============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
DEPLOYED_JSON="$CONTRACTS_DIR/deployed.testnet.json"

NETWORK="testnet"

FAILURES=0

fail() {
  echo "FAIL: $*" >&2
  FAILURES=$((FAILURES + 1))
}

pass() {
  echo "ok:   $*"
}

# ─── VALIDATE ENVIRONMENT ─────────────────────────────────────────────────────

if [[ -z "${ADMIN_SECRET:-}" ]]; then
  echo "ERROR: ADMIN_SECRET is not set. Export your Testnet secret key first." >&2
  exit 1
fi

for cmd in stellar node jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' is not installed or not in PATH." >&2
    exit 1
  fi
done

ADMIN_PUBKEY=$(cd "$BACKEND_DIR" && node -e \
  "console.log(require('@stellar/stellar-sdk').Keypair.fromSecret(process.env.ADMIN_SECRET).publicKey())" \
  2>/dev/null || echo "")

if [[ -z "$ADMIN_PUBKEY" ]]; then
  echo "ERROR: Could not derive public key from ADMIN_SECRET." >&2
  echo "  Make sure backend dependencies are installed (cd backend && npm ci)." >&2
  exit 1
fi

# Resolve contract IDs from env or the deploy output file.
if [[ -f "$DEPLOYED_JSON" ]]; then
  TREASURY_ID="${TREASURY_CONTRACT_ID:-$(jq -r '.treasury // empty' "$DEPLOYED_JSON")}"
  FACTORY_ID="${MARKET_FACTORY_CONTRACT_ID:-$(jq -r '.factory // empty' "$DEPLOYED_JSON")}"
  BET_TOKEN_ID="${BET_TOKEN_ID:-$(jq -r '.token // empty' "$DEPLOYED_JSON")}"
else
  TREASURY_ID="${TREASURY_CONTRACT_ID:-}"
  FACTORY_ID="${MARKET_FACTORY_CONTRACT_ID:-}"
  BET_TOKEN_ID="${BET_TOKEN_ID:-}"
fi

EXPECTED_ORACLE="${EXPECTED_ORACLE:-$ADMIN_PUBKEY}"

if [[ -z "$TREASURY_ID" || -z "$FACTORY_ID" ]]; then
  echo "ERROR: Treasury and factory contract IDs are required." >&2
  echo "  Set TREASURY_CONTRACT_ID / MARKET_FACTORY_CONTRACT_ID or run deploy_testnet.sh first." >&2
  exit 1
fi

NET_FLAGS=(--network "$NETWORK" --source "$ADMIN_SECRET")

invoke() {
  local id="$1"; shift
  stellar contract invoke --id "$id" "${NET_FLAGS[@]}" -- "$@" 2>/dev/null
}

# ─── READ-ONLY CHECKS ─────────────────────────────────────────────────────────

echo "==> Running read-only smoke checks..."

# version() of each contract.
for pair in "treasury:$TREASURY_ID" "factory:$FACTORY_ID"; do
  name="${pair%%:*}"
  id="${pair#*:}"
  version=$(invoke "$id" version)
  if [[ -n "$version" ]]; then
    pass "$name version() = $version"
  else
    fail "$name version() returned empty (contract $id)"
  fi
done

if [[ -n "$BET_TOKEN_ID" ]]; then
  token_version=$(invoke "$BET_TOKEN_ID" version)
  if [[ -n "$token_version" ]]; then
    pass "token version() = $token_version"
  else
    fail "token version() returned empty (contract $BET_TOKEN_ID)"
  fi
fi

# Factory get_config must match the deployed treasury and admin.
config=$(invoke "$FACTORY_ID" get_config)
if [[ -z "$config" ]]; then
  fail "factory get_config returned empty (contract $FACTORY_ID)"
else
  cfg_treasury=$(echo "$config" | jq -r '.treasury // empty' 2>/dev/null)
  cfg_admin=$(echo "$config" | jq -r '.admin // empty' 2>/dev/null)

  if [[ "$cfg_treasury" == "$TREASURY_ID" ]]; then
    pass "factory treasury matches deployed treasury"
  else
    fail "factory treasury '$cfg_treasury' does not match deployed treasury '$TREASURY_ID'"
  fi

  if [[ "$cfg_admin" == "$ADMIN_PUBKEY" ]]; then
    pass "factory admin matches expected admin"
  else
    fail "factory admin '$cfg_admin' does not match expected admin '$ADMIN_PUBKEY'"
  fi
fi

# Oracle whitelist must contain the expected oracle.
whitelist=$(invoke "$FACTORY_ID" get_oracle_whitelist)
if [[ -z "$whitelist" ]]; then
  fail "factory get_oracle_whitelist returned empty (contract $FACTORY_ID)"
elif echo "$whitelist" | grep -q "$EXPECTED_ORACLE"; then
  pass "oracle whitelist contains $EXPECTED_ORACLE"
else
  fail "oracle whitelist does not contain expected oracle '$EXPECTED_ORACLE'"
fi

# Treasury must not be paused.
paused=$(invoke "$TREASURY_ID" is_paused)
if [[ "$paused" == "false" ]]; then
  pass "treasury is_paused = false"
else
  fail "treasury is_paused = '$paused' (expected false)"
fi

# ─── OPTIONAL WRITE PATH ──────────────────────────────────────────────────────

if [[ "${RUN_WRITE_PATH:-0}" == "1" ]]; then
  echo ""
  echo "==> Running optional write-path checks..."

  if [[ -z "$BET_TOKEN_ID" ]]; then
    fail "write path requires BET_TOKEN_ID"
  else
    market_id=$(invoke "$FACTORY_ID" create_market \
      --creator "$ADMIN_PUBKEY" \
      --question "smoke-test" \
      --outcome_a "yes" \
      --outcome_b "no" \
      --min_bet "1000000" \
      --max_bet "100000000000" \
      --dispute_window_sec "86400" 2>/dev/null)

    if [[ -n "$market_id" ]]; then
      pass "created market $market_id"

      if invoke "$market_id" place_bet \
        --bettor "$ADMIN_PUBKEY" \
        --outcome 0 \
        --amount "1000000" >/dev/null; then
        pass "placed minimum bet on market $market_id"
      else
        fail "place_bet failed on market $market_id"
      fi

      if invoke "$market_id" lock >/dev/null; then
        pass "locked market $market_id"
      else
        fail "lock failed on market $market_id"
      fi
    else
      fail "create_market failed"
    fi
  fi
fi

# ─── SUMMARY ──────────────────────────────────────────────────────────────────

echo ""
if [[ "$FAILURES" -gt 0 ]]; then
  echo "SMOKE TEST FAILED: $FAILURES check(s) failed." >&2
  exit 1
fi

echo "SMOKE TEST PASSED: all checks succeeded."
exit 0
