#!/bin/bash
set -e

# Backend checks
cd backend

echo "Running Prettier check (backend)..."
npx prettier --check "src/**/*.ts"

echo "Running ESLint (backend)..."
npx eslint "src/**/*.ts"

echo "Running TypeScript build (backend)..."
npx tsc --noEmit

echo "Running backend tests..."
npx vitest run

echo "Running Prisma checks..."
npx prisma validate
npx prisma migrate status

cd ..

# Frontend checks
cd frontend

echo "Running Prettier check (frontend)..."
npx prettier --check "src/**/*.{js,jsx,ts,tsx}"

echo "Running ESLint (frontend)..."
npx eslint "src/**/*.{js,jsx,ts,tsx}"

echo "Running frontend build..."
npx vite build

cd ..

# Rust smart contract checks
cd contracts/contracts/boxmeout

echo "Running Rust formatting..."
cargo fmt -- --check

echo "Running Rust lint (clippy)..."
cargo clippy -- -D warnings

echo "Running Rust tests..."
cargo test

cd ../../../..

echo "All checks passed!"
