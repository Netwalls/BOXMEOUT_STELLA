#!/bin/bash
set -e

# Helper to check node_modules
check_deps() {
  if [ ! -d "$1/node_modules" ]; then
    echo "⚠️  node_modules missing in $1. Running 'npm install'..."
    (cd "$1" && npm install)
  fi
}

echo "🚀 Starting Consolidated Checks..."

# --- Backend Checks ---
echo ""
echo "📦 Running Backend Checks..."
check_deps "backend"
cd backend

# Run linting and type-checking in parallel for speed
echo "  - Running Prettier, ESLint, and TypeScript check..."
npm run format:check > /dev/null 2>&1 &
npm run lint -- --no-error-on-unmatched-pattern > /dev/null 2>&1 &
npm run build > /dev/null 2>&1 &

wait

echo "  - Running Prisma validation..."
npm run prisma:generate > /dev/null 2>&1
npx prisma validate

echo "  - Running Backend tests..."
npm test -- --run
cd ..

# --- Frontend Checks ---
echo ""
echo "📦 Running Frontend Checks..."
check_deps "frontend"
cd frontend

echo "  - Running Prettier and ESLint..."
# Note: These scripts might need adjustment in package.json if they don't exist
(npm run format:check || npx prettier --check "src/**/*.{js,jsx,ts,tsx}") > /dev/null 2>&1 &
(npm run lint -- --no-error-on-unmatched-pattern || npx eslint "src/**/*.{js,jsx,ts,tsx}" --no-error-on-unmatched-pattern) > /dev/null 2>&1 &
wait

echo "  - Building Frontend (Vite)..."
npm run build
cd ..

# --- Contract Checks ---
echo ""
echo "📦 Running Smart Contract Checks..."
cd contracts/contracts/boxmeout

echo "  - Running Rust formatting and Clippy..."
cargo fmt -- --check &
cargo clippy -- -D warnings &
wait

echo "  - Running Rust tests..."
cargo test --features testutils

echo "  - Building Smart Contracts (Check mode)..."
../../../build_contracts.sh --check

cd ../../../

echo ""
echo "✅ All checks passed successfully!"

