#!/bin/bash
# Static validation script for set_consensus_threshold implementation

echo "🔍 Validating set_consensus_threshold implementation..."
echo ""

ORACLE_FILE="contracts/contracts/boxmeout/src/oracle.rs"
ERRORS=0

# Check 1: Event definition exists
echo "✓ Checking ThresholdUpdatedEvent definition..."
if grep -q "pub struct ThresholdUpdatedEvent" "$ORACLE_FILE"; then
    echo "  ✅ Event struct found"
else
    echo "  ❌ Event struct NOT found"
    ERRORS=$((ERRORS + 1))
fi

# Check 2: Function implementation exists
echo "✓ Checking set_consensus_threshold function..."
if grep -q "pub fn set_consensus_threshold" "$ORACLE_FILE"; then
    echo "  ✅ Function found"
else
    echo "  ❌ Function NOT found"
    ERRORS=$((ERRORS + 1))
fi

# Check 3: Admin authentication
echo "✓ Checking admin authentication..."
if grep -A 10 "pub fn set_consensus_threshold" "$ORACLE_FILE" | grep -q "require_auth"; then
    echo "  ✅ Admin auth check found"
else
    echo "  ❌ Admin auth check NOT found"
    ERRORS=$((ERRORS + 1))
fi

# Check 4: Zero validation
echo "✓ Checking zero threshold validation..."
if grep -A 20 "pub fn set_consensus_threshold" "$ORACLE_FILE" | grep -q "Threshold must be at least 1"; then
    echo "  ✅ Zero validation found"
else
    echo "  ❌ Zero validation NOT found"
    ERRORS=$((ERRORS + 1))
fi

# Check 5: Oracle count validation
echo "✓ Checking oracle count validation..."
if grep -A 30 "pub fn set_consensus_threshold" "$ORACLE_FILE" | grep -q "Threshold cannot exceed oracle count"; then
    echo "  ✅ Oracle count validation found"
else
    echo "  ❌ Oracle count validation NOT found"
    ERRORS=$((ERRORS + 1))
fi

# Check 6: Event emission
echo "✓ Checking event emission..."
if grep -A 50 "pub fn set_consensus_threshold" "$ORACLE_FILE" | grep -q "ThresholdUpdatedEvent"; then
    echo "  ✅ Event emission found"
else
    echo "  ❌ Event emission NOT found"
    ERRORS=$((ERRORS + 1))
fi

# Check 7: Storage update
echo "✓ Checking storage update..."
if grep -A 40 "pub fn set_consensus_threshold" "$ORACLE_FILE" | grep -q "REQUIRED_CONSENSUS_KEY"; then
    echo "  ✅ Storage update found"
else
    echo "  ❌ Storage update NOT found"
    ERRORS=$((ERRORS + 1))
fi

# Check 8: Test count
echo "✓ Checking test coverage..."
TEST_COUNT=$(grep -c "fn test_set_consensus_threshold" "$ORACLE_FILE")
if [ "$TEST_COUNT" -eq 10 ]; then
    echo "  ✅ All 10 tests found"
else
    echo "  ❌ Expected 10 tests, found $TEST_COUNT"
    ERRORS=$((ERRORS + 1))
fi

# Check 9: Success test
echo "✓ Checking success test..."
if grep -q "fn test_set_consensus_threshold_success" "$ORACLE_FILE"; then
    echo "  ✅ Success test found"
else
    echo "  ❌ Success test NOT found"
    ERRORS=$((ERRORS + 1))
fi

# Check 10: Unauthorized test
echo "✓ Checking unauthorized access test..."
if grep -q "fn test_set_consensus_threshold_unauthorized_caller" "$ORACLE_FILE"; then
    echo "  ✅ Unauthorized test found"
else
    echo "  ❌ Unauthorized test NOT found"
    ERRORS=$((ERRORS + 1))
fi

# Check 11: Zero rejection test
echo "✓ Checking zero rejection test..."
if grep -q "fn test_set_consensus_threshold_rejects_zero" "$ORACLE_FILE"; then
    echo "  ✅ Zero rejection test found"
else
    echo "  ❌ Zero rejection test NOT found"
    ERRORS=$((ERRORS + 1))
fi

# Check 12: Exceeding count test
echo "✓ Checking exceeding count test..."
if grep -q "fn test_set_consensus_threshold_rejects_exceeding_oracle_count" "$ORACLE_FILE"; then
    echo "  ✅ Exceeding count test found"
else
    echo "  ❌ Exceeding count test NOT found"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ]; then
    echo "✅ All validation checks passed!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📝 Implementation Summary:"
    echo "  • Event: ThresholdUpdatedEvent ✓"
    echo "  • Function: set_consensus_threshold ✓"
    echo "  • Admin auth: Required ✓"
    echo "  • Validation: Complete ✓"
    echo "  • Tests: 10/10 ✓"
    echo ""
    echo "🚀 Ready for testing with:"
    echo "   cd contracts/contracts/boxmeout"
    echo "   cargo test --features testutils set_consensus_threshold"
    exit 0
else
    echo "❌ Validation failed with $ERRORS error(s)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 1
fi
