#!/bin/bash
# Script to create PR for oracle consensus threshold feature

echo "🚀 Creating Pull Request for Issue #75"
echo ""
echo "Branch: feature/oracle-consensus-threshold-75"
echo "Target: main"
echo ""

# Check if gh CLI is installed
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI found, creating PR..."
    gh pr create \
        --title "feat: Implement admin-only oracle consensus threshold update (#75)" \
        --body-file PR_ORACLE_THRESHOLD.md \
        --base main \
        --head feature/oracle-consensus-threshold-75
    
    if [ $? -eq 0 ]; then
        echo "✅ Pull Request created successfully!"
    else
        echo "❌ Failed to create PR via CLI"
        echo ""
        echo "Please create PR manually at:"
        echo "https://github.com/GoodnessJohn/BOXMEOUT_STELLA/pull/new/feature/oracle-consensus-threshold-75"
    fi
else
    echo "ℹ️  GitHub CLI not found"
    echo ""
    echo "📋 To create the PR manually:"
    echo ""
    echo "1. Visit: https://github.com/GoodnessJohn/BOXMEOUT_STELLA/pull/new/feature/oracle-consensus-threshold-75"
    echo ""
    echo "2. Use this title:"
    echo "   feat: Implement admin-only oracle consensus threshold update (#75)"
    echo ""
    echo "3. Copy the content from: PR_ORACLE_THRESHOLD.md"
    echo ""
    echo "4. Or use this quick link:"
    echo "   https://github.com/GoodnessJohn/BOXMEOUT_STELLA/compare/main...feature/oracle-consensus-threshold-75"
fi
