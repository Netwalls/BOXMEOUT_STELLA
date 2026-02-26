#!/bin/bash

# GitHub Issues Creation Script for BoxMeOut Stella
# This script helps batch-create issues from GITHUB_ISSUES.md
# 
# Prerequisites:
# 1. Install GitHub CLI: https://cli.github.com/
# 2. Authenticate: gh auth login
# 3. Set repository: gh repo set-default

set -e

REPO="GoSTEAN/BOXMEOUT_STELLA"  # Update with your repo

echo "🚀 BoxMeOut Stella - GitHub Issues Creator"
echo "=========================================="
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub CLI."
    echo "Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI is ready"
echo ""

# Function to create an issue
create_issue() {
    local title="$1"
    local body="$2"
    local labels="$3"
    local milestone="$4"
    
    echo "Creating: $title"
    
    if [ -n "$milestone" ]; then
        gh issue create \
            --repo "$REPO" \
            --title "$title" \
            --body "$body" \
            --label "$labels" \
            --milestone "$milestone"
    else
        gh issue create \
            --repo "$REPO" \
            --title "$title" \
            --body "$body" \
            --label "$labels"
    fi
}

# Create labels first
echo "📋 Creating labels..."
echo ""

gh label create "contracts" --color "0052CC" --description "Smart contract related" --force || true
gh label create "backend" --color "5319E7" --description "Backend API related" --force || true
gh label create "frontend" --color "1D76DB" --description "Frontend UI related" --force || true
gh label create "devops" --color "0E8A16" --description "DevOps and infrastructure" --force || true
gh label create "documentation" --color "0075CA" --description "Documentation" --force || true
gh label create "testing" --color "FBCA04" --description "Testing and QA" --force || true
gh label create "security" --color "D93F0B" --description "Security related" --force || true

gh label create "critical" --color "B60205" --description "Critical priority" --force || true
gh label create "high-priority" --color "D93F0B" --description "High priority" --force || true
gh label create "medium-priority" --color "FBCA04" --description "Medium priority" --force || true
gh label create "low-priority" --color "0E8A16" --description "Low priority" --force || true

gh label create "bug" --color "D73A4A" --description "Something isn't working" --force || true
gh label create "enhancement" --color "A2EEEF" --description "New feature or request" --force || true
gh label create "optimization" --color "BFD4F2" --description "Performance optimization" --force || true

gh label create "market" --color "C5DEF5" --description "Market contract" --force || true
gh label create "factory" --color "C5DEF5" --description "Factory contract" --force || true
gh label create "amm" --color "C5DEF5" --description "AMM contract" --force || true
gh label create "treasury" --color "C5DEF5" --description "Treasury contract" --force || true
gh label create "oracle" --color "C5DEF5" --description "Oracle contract" --force || true
gh label create "soroban" --color "C5DEF5" --description "Soroban/Stellar" --force || true

gh label create "v1" --color "006B75" --description "Version 1.0" --force || true
gh label create "v2" --color "006B75" --description "Version 2.0" --force || true

echo ""
echo "✅ Labels created"
echo ""

# Create milestones
echo "🎯 Creating milestones..."
echo ""

gh api repos/$REPO/milestones -f title="v1.0 - MVP Launch" -f description="Minimum viable product for testnet launch" -f due_on="2026-04-01T00:00:00Z" || true
gh api repos/$REPO/milestones -f title="v1.1 - Mainnet Launch" -f description="Production-ready mainnet deployment" -f due_on="2026-06-01T00:00:00Z" || true
gh api repos/$REPO/milestones -f title="v2.0 - Advanced Features" -f description="Cross-chain, NFTs, AI, DAO" -f due_on="2026-12-01T00:00:00Z" || true

echo "✅ Milestones created"
echo ""

# Prompt user
echo "📝 Ready to create issues from GITHUB_ISSUES.md"
echo ""
echo "Options:"
echo "  1. Create all issues (45 total)"
echo "  2. Create high-priority issues only (23 issues)"
echo "  3. Create critical issues only (1 issue)"
echo "  4. Create by component (contracts/backend/frontend/etc)"
echo "  5. Exit"
echo ""
read -p "Select option (1-5): " option

case $option in
    1)
        echo "Creating all 45 issues..."
        # Add issue creation commands here
        echo "⚠️  Manual creation recommended - see GITHUB_ISSUES.md"
        ;;
    2)
        echo "Creating high-priority issues..."
        echo "⚠️  Manual creation recommended - see GITHUB_ISSUES.md"
        ;;
    3)
        echo "Creating critical issues..."
        create_issue \
            "[SECURITY] Smart Contract Security Audit" \
            "Professional security audit before mainnet launch.

## Scope
- All 5 smart contracts
- Access control mechanisms
- Fund handling logic
- Reentrancy vulnerabilities
- Integer arithmetic
- Oracle manipulation
- Front-running prevention

## Recommended Auditors
- OpenZeppelin
- Trail of Bits
- Quantstamp
- CertiK

## Acceptance Criteria
- [ ] Audit completed by reputable firm
- [ ] All critical issues resolved
- [ ] Audit report published
- [ ] Fixes verified by auditor" \
            "security,critical,contracts" \
            "v1.1 - Mainnet Launch"
        ;;
    4)
        echo "Component-based creation not yet implemented"
        echo "Please create issues manually from GITHUB_ISSUES.md"
        ;;
    5)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo "Invalid option"
        exit 1
        ;;
esac

echo ""
echo "✅ Done!"
echo ""
echo "Next steps:"
echo "1. Review created issues on GitHub"
echo "2. Assign team members"
echo "3. Add to project board"
echo "4. Start development!"
