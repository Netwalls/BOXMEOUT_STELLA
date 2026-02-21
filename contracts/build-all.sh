#!/bin/bash
set -e

# Run from workspace root (contracts/) - script lives in contracts/
cd "$(dirname "$0")"
WASM_OUT="target/wasm32-unknown-unknown/release/boxmeout.wasm"
DEST_DIR=".."  # project root (BOXMEOUT_STELLA)

echo "🏗️  Building Market contract..."
cargo build --release --target wasm32-unknown-unknown -p boxmeout --features market --no-default-features
cp "$WASM_OUT" "$DEST_DIR/market.wasm"

echo "🏗️  Building Oracle contract..."
cargo build --release --target wasm32-unknown-unknown -p boxmeout --features oracle --no-default-features
cp "$WASM_OUT" "$DEST_DIR/oracle.wasm"

echo "🏗️  Building AMM contract..."
cargo build --release --target wasm32-unknown-unknown -p boxmeout --features amm --no-default-features
cp "$WASM_OUT" "$DEST_DIR/amm.wasm"

echo "🏗️  Building Factory contract..."
cargo build --release --target wasm32-unknown-unknown -p boxmeout --features factory --no-default-features
cp "$WASM_OUT" "$DEST_DIR/factory.wasm"

echo "🏗️  Building Treasury contract..."
cargo build --release --target wasm32-unknown-unknown -p boxmeout --features treasury --no-default-features
cp "$WASM_OUT" "$DEST_DIR/treasury.wasm"

echo "✅ All 5 contracts built successfully!"
ls -lh "$DEST_DIR"/*.wasm
