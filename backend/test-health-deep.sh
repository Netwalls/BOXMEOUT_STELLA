#!/bin/bash

# Test script for the deep health check endpoint
# Usage: ./test-health-deep.sh [port]

PORT=${1:-3000}
BASE_URL="http://localhost:${PORT}"

echo "=========================================="
echo "Testing Deep Health Check Endpoint"
echo "=========================================="
echo ""

echo "1. Testing basic health check..."
echo "GET ${BASE_URL}/api/health"
curl -s "${BASE_URL}/api/health" | jq '.'
echo ""
echo ""

echo "2. Testing readiness check..."
echo "GET ${BASE_URL}/api/ready"
curl -s "${BASE_URL}/api/ready" | jq '.'
echo ""
echo ""

echo "3. Testing deep health check..."
echo "GET ${BASE_URL}/api/health/deep"
curl -s "${BASE_URL}/api/health/deep" | jq '.'
echo ""
echo ""

echo "=========================================="
echo "Health Check Tests Complete"
echo "=========================================="
