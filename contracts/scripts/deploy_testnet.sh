#!/usr/bin/env bash
# ==============================================================================
# BOXMEOUT — Deploy to Stellar Testnet (thin wrapper)
# ==============================================================================
#
# Kept so existing docs and commands keep working. All logic lives in deploy.sh:
#
#   contracts/scripts/deploy.sh --network testnet "$@"
#
# Usage:
#   contracts/scripts/deploy_testnet.sh [--identity NAME] [--validate-only]
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "$SCRIPT_DIR/deploy.sh" --network testnet "$@"
