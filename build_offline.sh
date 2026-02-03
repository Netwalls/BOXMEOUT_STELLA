#!/bin/bash
# Quick build script using cached dependencies (offline mode)
# Use this if DNS/network issues prevent online builds

set -e

echo "🚀 Building BoxMeOut Contracts (Offline Mode)..."
echo ""

cd "$(dirname "$0")/contracts/contracts/boxmeout"

echo "Building all 5 contracts..."
for contract in market oracle amm factory treasury; do
    echo "📦 $contract..."
    cargo build --target wasm32-unknown-unknown --release --features $contract --offline 2>&1 | grep -v "warning:" || true
    if [ -f "target/wasm32-unknown-unknown/release/boxmeout.wasm" ]; then
        cp target/wasm32-unknown-unknown/release/boxmeout.wasm target/wasm32-unknown-unknown/release/$contract.wasm
        echo "✅ $contract.wasm"
    fi
done

echo ""
echo "🎉 Done! Files:"
ls -lh target/wasm32-unknown-unknown/release/{market,oracle,amm,factory,treasury}.wasm 2>/dev/null
