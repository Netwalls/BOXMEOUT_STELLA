#!/bin/bash
# Build script for BoxMeOut Stella smart contracts
# Builds each contract separately as a WASM module

set -e

# Support for --check flag
CHECK_ONLY=false
if [ "$1" == "--check" ]; then
    CHECK_ONLY=true
    COMMAND="cargo check"
    echo "🔍 Running check-only mode..."
else
    COMMAND="cargo build --target wasm32-unknown-unknown --release"
fi

echo "🚀 Building BoxMeOut Stella Smart Contracts..."
echo ""

# Navigate to contract directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACT_DIR="$SCRIPT_DIR/contracts/contracts/boxmeout"
cd "$CONTRACT_DIR"

echo "📍 Working directory: $(pwd)"
echo ""

# Build Market Contract
echo "📦 Building Market Contract..."
$COMMAND --features market
if [ $? -eq 0 ]; then
    echo "✅ Market contract check/build successful"
    if [ "$CHECK_ONLY" == false ] && [ -f "target/wasm32-unknown-unknown/release/boxmeout.wasm" ]; then
        cp target/wasm32-unknown-unknown/release/boxmeout.wasm target/wasm32-unknown-unknown/release/market.wasm
        echo "   📄 Saved as market.wasm"
    fi
else
    echo "❌ Market contract check/build failed"
    exit 1
fi
echo ""

# Build Oracle Contract
echo "📦 Building Oracle Contract..."
$COMMAND --features oracle
if [ $? -eq 0 ]; then
    echo "✅ Oracle contract check/build successful"
    if [ "$CHECK_ONLY" == false ] && [ -f "target/wasm32-unknown-unknown/release/boxmeout.wasm" ]; then
        cp target/wasm32-unknown-unknown/release/boxmeout.wasm target/wasm32-unknown-unknown/release/oracle.wasm
        echo "   📄 Saved as oracle.wasm"
    fi
else
    echo "❌ Oracle contract check/build failed"
    exit 1
fi
echo ""

# Build AMM Contract
echo "📦 Building AMM Contract..."
$COMMAND --features amm
if [ $? -eq 0 ]; then
    echo "✅ AMM contract check/build successful"
    if [ "$CHECK_ONLY" == false ] && [ -f "target/wasm32-unknown-unknown/release/boxmeout.wasm" ]; then
        cp target/wasm32-unknown-unknown/release/boxmeout.wasm target/wasm32-unknown-unknown/release/amm.wasm
        echo "   📄 Saved as amm.wasm"
    fi
else
    echo "❌ AMM contract check/build failed"
    exit 1
fi
echo ""

# Build Factory Contract
echo "📦 Building Factory Contract..."
$COMMAND --features factory
if [ $? -eq 0 ]; then
    echo "✅ Factory contract check/build successful"
    if [ "$CHECK_ONLY" == false ] && [ -f "target/wasm32-unknown-unknown/release/boxmeout.wasm" ]; then
        cp target/wasm32-unknown-unknown/release/boxmeout.wasm target/wasm32-unknown-unknown/release/factory.wasm
        echo "   📄 Saved as factory.wasm"
    fi
else
    echo "❌ Factory contract check/build failed"
    exit 1
fi
echo ""

# Build Treasury Contract
echo "📦 Building Treasury Contract..."
$COMMAND --features treasury
if [ $? -eq 0 ]; then
    echo "✅ Treasury contract check/build successful"
    if [ "$CHECK_ONLY" == false ] && [ -f "target/wasm32-unknown-unknown/release/boxmeout.wasm" ]; then
        cp target/wasm32-unknown-unknown/release/boxmeout.wasm target/wasm32-unknown-unknown/release/treasury.wasm
        echo "   📄 Saved as treasury.wasm"
    fi
else
    echo "❌ Treasury contract check/build failed"
    exit 1
fi
echo ""

if [ "$CHECK_ONLY" == true ]; then
    echo "🎉 All contract checks passed!"
else
    echo "🎉 All 5 contracts built successfully!"
    echo ""
    echo "📁 Output files:"
    ls -lh target/wasm32-unknown-unknown/release/{market,oracle,amm,factory,treasury}.wasm 2>/dev/null || echo "⚠️  Some WASM files missing"
fi
echo ""
echo "Next steps:"
echo "  1. Optimize: stellar contract optimize --wasm target/wasm32-unknown-unknown/release/market.wasm"
echo "  2. Deploy: stellar contract deploy --wasm <file> --network testnet --source <account>"
echo "  3. Initialize each contract with proper addresses"
echo "  4. Update backend .env with deployed contract addresses"
