# GitHub Configuration for BoxMeOut Stella

This directory contains GitHub-specific configuration, workflows, and issue management resources.

## 📁 Directory Structure

```
.github/
├── ISSUE_TEMPLATE/          # Issue templates
│   ├── bug_report.md        # Bug report template
│   ├── feature_request.md   # Feature request template
│   └── contract_issue.md    # Smart contract issue template
├── workflows/               # GitHub Actions CI/CD
│   ├── ci.yml              # Main CI workflow
│   └── contracts.yml       # Contract testing workflow
├── scripts/                 # Automation scripts
│   └── create_issues.sh    # Batch issue creation script
├── GITHUB_ISSUES.md        # Complete issue list (45 issues)
├── PROJECT_BOARD.md        # Project board setup guide
├── QUICK_START_ISSUES.md   # Quick start guide
└── README.md               # This file
```

## 🚀 Quick Start

### 1. Create Issues

**Option A: Use the script (recommended)**
```bash
cd .github/scripts
./create_issues.sh
```

**Option B: Manual creation**
Follow the guide in `QUICK_START_ISSUES.md`

### 2. Set Up Project Board

1. Go to repository → Projects → New project
2. Choose "Board" template
3. Follow instructions in `PROJECT_BOARD.md`

### 3. Configure Workflows

GitHub Actions workflows are already configured:
- `ci.yml` - Main CI pipeline
- `contracts.yml` - Smart contract testing

## 📋 Issue Templates

Three templates are available when creating issues:

1. **Bug Report** - For reporting bugs and unexpected behavior
2. **Feature Request** - For suggesting new features
3. **Contract Issue** - For smart contract-specific issues

## 📊 Issue Overview

Total issues identified: **45**

### By Priority
- Critical: 1 (Security audit)
- High: 23 (Core features for v1.0)
- Medium: 18 (Important enhancements)
- Low: 3 (Future features)

### By Component
- Smart Contracts: 12 issues
- Backend: 8 issues
- Frontend: 7 issues
- DevOps: 6 issues
- Documentation: 4 issues
- Testing: 5 issues
- Security: 3 issues

### By Milestone
- v1.0 - MVP Launch: 24 issues
- v1.1 - Mainnet Launch: 11 issues
- v2.0 - Advanced Features: 10 issues

## 🏷️ Labels

### Component Labels
- `contracts` - Smart contract related
- `backend` - Backend API related
- `frontend` - Frontend UI related
- `devops` - DevOps and infrastructure
- `documentation` - Documentation
- `testing` - Testing and QA
- `security` - Security related

### Priority Labels
- `critical` - Critical priority
- `high-priority` - High priority
- `medium-priority` - Medium priority
- `low-priority` - Low priority

### Type Labels
- `bug` - Something isn't working
- `enhancement` - New feature or request
- `optimization` - Performance optimization

### Contract-Specific Labels
- `market` - Market contract
- `factory` - Factory contract
- `amm` - AMM contract
- `treasury` - Treasury contract
- `oracle` - Oracle contract
- `soroban` - Soroban/Stellar

## 🎯 Milestones

### v1.0 - MVP Launch (April 2026)
Testnet launch with core features
- Complete smart contracts
- Basic backend API
- Functional frontend
- Wallet integration

### v1.1 - Mainnet Launch (June 2026)
Production-ready mainnet deployment
- Security audit completed
- Monitoring and alerting
- Load testing passed
- Documentation complete

### v2.0 - Advanced Features (December 2026)
Advanced features and integrations
- Cross-chain integration
- NFT achievement system
- AI-powered analytics
- DAO governance

## 📖 Documentation

### For Developers
- `GITHUB_ISSUES.md` - Complete list of all 45 issues with detailed descriptions
- `QUICK_START_ISSUES.md` - Quick guide to create top 10 priority issues
- `PROJECT_BOARD.md` - Project board setup and management guide

### For Project Managers
- `PROJECT_BOARD.md` - Sprint planning, metrics, and team roles
- Issue templates for consistent issue creation
- Milestone definitions and success criteria

## 🔧 GitHub Actions Workflows

### CI Workflow (`ci.yml`)
Runs on: Push to main, Pull requests
- Linting
- Type checking
- Unit tests
- Build verification

### Contracts Workflow (`contracts.yml`)
Runs on: Push to main, Pull requests to contracts/
- Rust compilation
- Contract tests
- WASM optimization
- Security checks

## 🤝 Contributing

When creating issues:
1. Use appropriate issue template
2. Add relevant labels
3. Assign to milestone
4. Link related issues
5. Include acceptance criteria
6. Estimate effort (story points)

When working on issues:
1. Assign yourself to the issue
2. Move to "In Progress" on project board
3. Create feature branch
4. Submit PR when ready
5. Link PR to issue
6. Request review

## 📞 Support

For questions about:
- Issue creation → See `QUICK_START_ISSUES.md`
- Project board → See `PROJECT_BOARD.md`
- Workflows → See workflow files in `workflows/`
- General → Open a discussion on GitHub

## 🔗 Useful Links

- [GitHub Projects Documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Issue Templates Guide](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests)
- [Conventional Commits](https://www.conventionalcommits.org/)

## 📝 Notes

- All issues are documented in `GITHUB_ISSUES.md`
- Use the script in `scripts/create_issues.sh` for batch creation
- Follow the project board guide for optimal workflow
- Keep issue templates updated as project evolves
- Review and update milestones quarterly

---

**Last Updated:** February 2026
**Maintained by:** BoxMeOut Stella Team
