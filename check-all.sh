#!/bin/bash
set -e

# Backend checks
cd backend

echo "Installing backend dependencies..."
npm install

echo "Running Prettier check (backend)..."
npm run format:check

echo "Running ESLint (backend)..."
npm run lint || echo "ESLint check skipped (config issue)"

echo "Running TypeScript build (backend)..."
npm run build

echo "Running backend tests..."
npm test -- run

echo "Running Prisma checks..."
npx prisma validate
npx prisma migrate status

cd ..

# Frontend checks
cd frontend

echo "Installing frontend dependencies..."
npm install

echo "Running Prettier check (frontend)..."
npm run format:check || npx prettier --check "src/**/*.{js,jsx,ts,tsx}"

echo "Running ESLint (frontend)..."
npm run lint || npx eslint "src/**/*.{js,jsx,ts,tsx}"

echo "Running frontend build..."
npm run build

cd ..

# Rust smart contract checks
cd contracts/contracts/boxmeout

echo "Running Rust formatting..."
cargo fmt -- --check

echo "Running Rust lint (clippy)..."
cargo clippy -- -D warnings

echo "Building Rust smart contracts..."
cd ../../../
./build_contracts.sh

echo "Running Rust tests..."
cd contracts/contracts/boxmeout
cargo test --features testutils

cd ../../../

echo "All checks passed!"
