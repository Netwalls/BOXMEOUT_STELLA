#!/bin/bash
# Run market lifecycle E2E test with Docker PostgreSQL

set -e

echo "🚀 Starting Market Lifecycle E2E Test"
echo "======================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker first."
  exit 1
fi

# Start PostgreSQL test container
echo "📦 Starting PostgreSQL test container..."
docker-compose up -d postgres_test

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Check if PostgreSQL is healthy
until docker exec boxmeout_postgres_test pg_isready -U postgres > /dev/null 2>&1; do
  echo "   Waiting for database..."
  sleep 2
done

echo "✅ PostgreSQL is ready"

# Set test database URL
export DATABASE_URL="postgresql://postgres:password@localhost:5435/boxmeout_test"

# Run migrations
echo "🔧 Running database migrations..."
npx prisma migrate deploy

# Run the E2E test
echo "🧪 Running market lifecycle E2E test..."
npm run test:integration -- tests/integration/market-lifecycle.e2e.test.ts

# Capture exit code
TEST_EXIT_CODE=$?

# Cleanup
echo "🧹 Cleaning up..."
# Keep container running for inspection if test failed
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ Tests passed! Stopping containers..."
  docker-compose stop postgres_test
else
  echo "❌ Tests failed. Container left running for inspection."
  echo "   Connect with: psql postgresql://postgres:password@localhost:5435/boxmeout_test"
  echo "   Stop with: docker-compose stop postgres_test"
fi

exit $TEST_EXIT_CODE
