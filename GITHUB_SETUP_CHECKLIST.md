# GitHub Setup Checklist for BoxMeOut Stella

Use this checklist to set up your GitHub repository with all issues, labels, milestones, and project boards.

## ✅ Prerequisites

- [ ] GitHub account with repository access
- [ ] GitHub CLI installed (`gh --version`)
- [ ] Authenticated with GitHub CLI (`gh auth status`)
- [ ] Repository cloned locally
- [ ] Admin access to repository

## 📋 Phase 1: Review Documentation

- [ ] Read `ISSUES_SUMMARY.md` for overview
- [ ] Review `.github/GITHUB_ISSUES.md` for complete issue list
- [ ] Check `.github/QUICK_START_ISSUES.md` for quick start
- [ ] Review `.github/PROJECT_BOARD.md` for project management
- [ ] Understand `.github/README.md` for GitHub config

**Estimated Time:** 30 minutes

## 🏷️ Phase 2: Create Labels

Run these commands or use the script:

```bash
cd .github/scripts
chmod +x create_issues.sh
./create_issues.sh
# Select option to create labels
```

### Component Labels
- [ ] `contracts` (color: 0052CC)
- [ ] `backend` (color: 5319E7)
- [ ] `frontend` (color: 1D76DB)
- [ ] `devops` (color: 0E8A16)
- [ ] `documentation` (color: 0075CA)
- [ ] `testing` (color: FBCA04)
- [ ] `security` (color: D93F0B)

### Priority Labels
- [ ] `critical` (color: B60205)
- [ ] `high-priority` (color: D93F0B)
- [ ] `medium-priority` (color: FBCA04)
- [ ] `low-priority` (color: 0E8A16)

### Type Labels
- [ ] `bug` (color: D73A4A)
- [ ] `enhancement` (color: A2EEEF)
- [ ] `optimization` (color: BFD4F2)

### Contract-Specific Labels
- [ ] `market` (color: C5DEF5)
- [ ] `factory` (color: C5DEF5)
- [ ] `amm` (color: C5DEF5)
- [ ] `treasury` (color: C5DEF5)
- [ ] `oracle` (color: C5DEF5)
- [ ] `soroban` (color: C5DEF5)

### Version Labels
- [ ] `v1` (color: 006B75)
- [ ] `v2` (color: 006B75)

**Estimated Time:** 5 minutes

## 🎯 Phase 3: Create Milestones

- [ ] v1.0 - MVP Launch (Due: April 1, 2026)
  - Description: "Minimum viable product for testnet launch"
  
- [ ] v1.1 - Mainnet Launch (Due: June 1, 2026)
  - Description: "Production-ready mainnet deployment"
  
- [ ] v2.0 - Advanced Features (Due: December 1, 2026)
  - Description: "Cross-chain, NFTs, AI, DAO"

**Commands:**
```bash
gh api repos/:owner/:repo/milestones \
  -f title="v1.0 - MVP Launch" \
  -f description="Minimum viable product for testnet launch" \
  -f due_on="2026-04-01T00:00:00Z"

gh api repos/:owner/:repo/milestones \
  -f title="v1.1 - Mainnet Launch" \
  -f description="Production-ready mainnet deployment" \
  -f due_on="2026-06-01T00:00:00Z"

gh api repos/:owner/:repo/milestones \
  -f title="v2.0 - Advanced Features" \
  -f description="Cross-chain, NFTs, AI, DAO" \
  -f due_on="2026-12-01T00:00:00Z"
```

**Estimated Time:** 5 minutes

## 📝 Phase 4: Create Issues

### Option A: Top 10 Priority Issues (Recommended for Quick Start)

Create these critical issues first:

- [ ] Issue #1: Complete Market Contract Implementation
- [ ] Issue #2: Treasury Reward Distribution
- [ ] Issue #3: Oracle Consensus & Accuracy
- [ ] Issue #4: Authentication System
- [ ] Issue #5: Market API Endpoints
- [ ] Issue #6: Prediction Commit-Reveal Flow
- [ ] Issue #7: Wallet Integration
- [ ] Issue #8: Prediction Submission UI
- [ ] Issue #9: Production Deployment
- [ ] Issue #10: Smart Contract Security Audit

**Use:** `.github/QUICK_START_ISSUES.md` for commands

**Estimated Time:** 20 minutes

### Option B: All 45 Issues (Complete Setup)

Create all issues from `.github/GITHUB_ISSUES.md`:

**Smart Contracts (12 issues)**
- [ ] Issue #1: Complete Market Contract
- [ ] Issue #2: Treasury Reward Distribution
- [ ] Issue #3: Oracle Consensus & Accuracy
- [ ] Issue #4: Factory Pause Mechanism
- [ ] Issue #5: AMM Liquidity Management
- [ ] Issue #6: Market Creation Fee Optimization

**Backend (8 issues)**
- [ ] Issue #7: Authentication System
- [ ] Issue #8: Market API Endpoints
- [ ] Issue #9: Prediction Commit-Reveal Flow
- [ ] Issue #10: WebSocket Real-Time Updates
- [ ] Issue #11: Leaderboard System
- [ ] Issue #12: Referral System
- [ ] Issue #13: Notification System
- [ ] Issue #14: Admin Dashboard API

**Frontend (7 issues)**
- [ ] Issue #15: Wallet Integration
- [ ] Issue #16: Market Browse & Filter UI
- [ ] Issue #17: Prediction Submission Flow
- [ ] Issue #18: User Dashboard
- [ ] Issue #19: Leaderboard UI
- [ ] Issue #20: Market Creation Form
- [ ] Issue #21: Achievement & Badge System

**DevOps (6 issues)**
- [ ] Issue #22: Production Deployment
- [ ] Issue #23: Monitoring & Alerting
- [ ] Issue #24: Backup & Disaster Recovery
- [ ] Issue #25: Load Testing
- [ ] Issue #26: CI/CD Enhancements

**Documentation (4 issues)**
- [ ] Issue #27: API Documentation
- [ ] Issue #28: Smart Contract Documentation
- [ ] Issue #29: User Guide
- [ ] Issue #30: Developer Guide

**Testing (5 issues)**
- [ ] Issue #31: Contract Test Coverage
- [ ] Issue #32: Integration Test Suite
- [ ] Issue #33: Backend Test Coverage
- [ ] Issue #34: Frontend E2E Tests
- [ ] Issue #35: Security Testing

**Security (3 issues)**
- [ ] Issue #36: Smart Contract Security Audit
- [ ] Issue #37: Bug Bounty Program
- [ ] Issue #38: Rate Limiting & DDoS Protection
- [ ] Issue #39: Secrets Management

**Version 2 Features (10 issues)**
- [ ] Issue #40: Cross-Chain Integration
- [ ] Issue #41: NFT Achievement System
- [ ] Issue #42: AI-Powered Analytics
- [ ] Issue #43: DAO Governance
- [ ] Issue #44: Social Features
- [ ] Issue #45: Mobile App

**Estimated Time:** 2-3 hours

## 📊 Phase 5: Create Project Board

### Step 1: Create Board
- [ ] Go to repository → Projects → New project
- [ ] Choose "Board" template
- [ ] Name: "BoxMeOut Stella Development"

### Step 2: Add Columns
- [ ] 📋 Backlog
- [ ] 🎯 Ready
- [ ] 🚧 In Progress
- [ ] 👀 In Review
- [ ] ✅ Testing
- [ ] ✨ Done

### Step 3: Configure Automation
- [ ] Auto-add new issues to Backlog
- [ ] Auto-move to "In Progress" when assigned
- [ ] Auto-move to "In Review" when PR opened
- [ ] Auto-move to "Done" when issue closed

### Step 4: Create Views
- [ ] By Priority (filter: critical, high-priority)
- [ ] By Component (group by: component labels)
- [ ] By Milestone (group by: milestone)
- [ ] By Assignee (group by: assignee)

**Estimated Time:** 15 minutes

## 🔗 Phase 6: Link Issues to Project

```bash
# Get project ID
gh project list --owner <your-org>

# Link each issue (repeat for all issues)
gh project item-add <PROJECT_ID> --owner <your-org> --url <ISSUE_URL>
```

Or use bulk linking:
```bash
# Link all open issues
gh issue list --limit 100 --json number,url | \
  jq -r '.[] | .url' | \
  xargs -I {} gh project item-add <PROJECT_ID> --owner <your-org> --url {}
```

**Estimated Time:** 10 minutes

## 👥 Phase 7: Team Setup

### Assign Team Members
- [ ] Identify team roles (Product Owner, Tech Lead, Developers, QA, DevOps)
- [ ] Assign issues to team members
- [ ] Set up CODEOWNERS file
- [ ] Configure branch protection rules

### Set Up Communication
- [ ] Create team Slack/Discord channels
- [ ] Set up GitHub notifications
- [ ] Schedule sprint planning meeting
- [ ] Schedule daily standup time

**Estimated Time:** 30 minutes

## 🔐 Phase 8: Security & Access

- [ ] Enable branch protection on `main`
  - [ ] Require pull request reviews
  - [ ] Require status checks to pass
  - [ ] Require conversation resolution
  - [ ] Require signed commits (optional)
  
- [ ] Set up GitHub Secrets
  - [ ] Database credentials
  - [ ] API keys
  - [ ] Deployment tokens
  
- [ ] Configure Dependabot
  - [ ] Enable security updates
  - [ ] Enable version updates
  
- [ ] Set up code scanning
  - [ ] Enable CodeQL analysis
  - [ ] Configure security alerts

**Estimated Time:** 20 minutes

## 📈 Phase 9: Sprint Planning

### Sprint 1 Planning
- [ ] Review v1.0 milestone issues
- [ ] Select issues for Sprint 1 (2 weeks)
- [ ] Estimate story points
- [ ] Set sprint goal
- [ ] Create sprint milestone
- [ ] Assign sprint issues

### Recommended Sprint 1 Issues (24 story points)
- [ ] Complete Market Contract (8 points)
- [ ] Authentication System (5 points)
- [ ] Wallet Integration (5 points)
- [ ] API Documentation setup (3 points)
- [ ] CI/CD enhancements (3 points)

**Estimated Time:** 1 hour

## ✅ Phase 10: Verification

### Verify Setup
- [ ] All labels created and visible
- [ ] All milestones created with correct dates
- [ ] Top 10 (or all 45) issues created
- [ ] Project board created and configured
- [ ] Issues linked to project board
- [ ] Team members assigned
- [ ] Branch protection enabled
- [ ] GitHub Actions workflows running
- [ ] Issue templates working

### Test Workflow
- [ ] Create a test issue using template
- [ ] Assign to yourself
- [ ] Verify it appears on project board
- [ ] Move through columns
- [ ] Close issue
- [ ] Verify automation works

**Estimated Time:** 15 minutes

## 🚀 Phase 11: Kickoff

- [ ] Send kickoff email to team
- [ ] Share project board link
- [ ] Share documentation links
- [ ] Schedule first sprint planning
- [ ] Schedule first daily standup
- [ ] Begin development!

**Estimated Time:** 30 minutes

## 📊 Total Time Estimate

| Phase | Time |
|-------|------|
| Review Documentation | 30 min |
| Create Labels | 5 min |
| Create Milestones | 5 min |
| Create Issues (Top 10) | 20 min |
| Create Issues (All 45) | 2-3 hours |
| Create Project Board | 15 min |
| Link Issues | 10 min |
| Team Setup | 30 min |
| Security & Access | 20 min |
| Sprint Planning | 1 hour |
| Verification | 15 min |
| Kickoff | 30 min |
| **Total (Quick Start)** | **3-4 hours** |
| **Total (Complete)** | **5-6 hours** |

## 📝 Notes

- You can do Quick Start (Top 10 issues) first and add remaining issues later
- Use the automation script (`.github/scripts/create_issues.sh`) to save time
- Customize issue descriptions based on your team's needs
- Update milestones dates based on your timeline
- Add more labels as needed for your workflow

## 🆘 Troubleshooting

### GitHub CLI not working
```bash
# Reinstall GitHub CLI
brew reinstall gh  # macOS
# or follow: https://cli.github.com/

# Re-authenticate
gh auth logout
gh auth login
```

### Labels not creating
```bash
# Check if label already exists
gh label list

# Force create (overwrites existing)
gh label create "label-name" --color "FFFFFF" --force
```

### Issues not linking to project
```bash
# Verify project ID
gh project list --owner <your-org>

# Check issue URL format
# Should be: https://github.com/owner/repo/issues/123
```

### Milestones not creating
```bash
# Check existing milestones
gh api repos/:owner/:repo/milestones

# Verify date format (ISO 8601)
# Correct: 2026-04-01T00:00:00Z
```

## 📚 Resources

- Complete issue list: `.github/GITHUB_ISSUES.md`
- Quick start guide: `.github/QUICK_START_ISSUES.md`
- Project board guide: `.github/PROJECT_BOARD.md`
- GitHub config: `.github/README.md`
- Summary: `ISSUES_SUMMARY.md`
- This checklist: `GITHUB_SETUP_CHECKLIST.md`

## ✨ Success Criteria

Setup is complete when:
- ✅ All labels created
- ✅ All milestones created
- ✅ At least top 10 issues created
- ✅ Project board configured
- ✅ Issues linked to board
- ✅ Team members assigned
- ✅ First sprint planned
- ✅ Development started

---

**Good luck with your setup! 🚀**

**Questions?** Review the documentation files or open a discussion on GitHub.
