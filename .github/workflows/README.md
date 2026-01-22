# GitHub Actions Workflows for BoxMeOut

## Overview

This directory contains automated CI/CD workflows for the BoxMeOut open-source project.

## Workflows

### 1. **contracts.yml** - Smart Contract Tests
- Runs on: `contracts/**` changes
- Tests: Rust formatting, Clippy linting, compilation, unit tests
- Artifacts: Build outputs for verification
- **Triggers:** Push to main/develop, Pull requests

### 2. **backend.yml** - Backend API Tests
- Runs on: `backend/**` changes
- Tests: ESLint, unit tests, build verification
- Services: PostgreSQL, Redis
- Artifacts: Build outputs
- **Triggers:** Push to main/develop, Pull requests

### 3. **frontend.yml** - Frontend Application Tests
- Runs on: `frontend/**` changes
- Tests: ESLint, build, unit tests
- Artifacts: Production build (dist/)
- **Triggers:** Push to main/develop, Pull requests

### 4. **security.yml** - Security & Dependency Checks
- Dependency audits: npm audit for Node.js packages
- Rust audits: cargo-audit for Soroban dependencies
- **Schedule:** Weekly on Sunday + on-demand
- **Triggers:** Push, Pull requests, Schedule

### 5. **codeql.yml** - CodeQL Code Analysis
- Static analysis for JavaScript/TypeScript
- Detects potential security issues and bugs
- **Triggers:** Push to main/develop, Pull requests

### 6. **pr-validation.yml** - Pull Request Validation
- Validates PR title (Conventional Commits)
- Checks for breaking changes (!)
- Requires PR description
- **Triggers:** Pull requests only

## Conventional Commits Format

For PR titles and commit messages:

```
type(scope): description

Types:
- feat:     New feature
- fix:      Bug fix
- docs:     Documentation
- style:    Code style (no logic change)
- refactor: Code refactoring
- perf:     Performance improvement
- test:     Add/update tests
- chore:    Build, dependencies, setup
- ci:       CI/CD configuration
```

Examples:
```
feat(contracts): implement Factory.create_market()
fix(backend): resolve authentication middleware issue
docs: update API documentation
chore(deps): upgrade Soroban SDK to v20.0.0
feat!(amm)!: change CPMM pricing algorithm (BREAKING)
```

## Status Badges

Add these to your README:

```markdown
[![Contracts CI](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/contracts.yml/badge.svg)](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/contracts.yml)
[![Backend CI](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/backend.yml/badge.svg)](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/backend.yml)
[![Frontend CI](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/frontend.yml/badge.svg)](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/frontend.yml)
[![Security](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/security.yml/badge.svg)](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/security.yml)
[![CodeQL](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/codeql.yml/badge.svg)](https://github.com/Netwalls/BOXMEOUT_STELLA/actions/workflows/codeql.yml)
```

## Configuration

### Skipping Workflows

Add `[skip ci]` to commit message to skip all workflows:
```bash
git commit -m "docs: update README [skip ci]"
```

### Required Status Checks

Configure in GitHub Settings → Branches → Branch Protection Rules:
1. Require all status checks to pass
2. Require code reviews
3. Dismiss stale reviews

## Local Testing

### Test Contracts Locally
```bash
cd contracts/contracts/boxmeout
cargo test
```

### Test Backend Locally
```bash
cd backend
npm test
```

### Test Frontend Locally
```bash
cd frontend
npm test
npm run lint
npm run build
```

## Troubleshooting

### Workflow Failing?

1. **Check logs:** Click on the failing job in Actions tab
2. **Run locally:** Test your changes locally first
3. **Check dependencies:** Ensure package.json and Cargo.lock are up-to-date
4. **Clear cache:** Delete artifact caches if they're outdated

### Failed Tests

- **Contracts:** Check Rust version compatibility, run `cargo update`
- **Backend:** Ensure DB/Redis services are configured in test env
- **Frontend:** Check Node version, clear node_modules

## Security Considerations

- ✅ Dependency audits run weekly
- ✅ Code analysis on every PR
- ✅ Rust security audit included
- ⚠️ Keep dependencies updated
- ⚠️ Review security alerts immediately

## Contributing

When submitting a PR:
1. Follow Conventional Commits format
2. Ensure all workflows pass
3. Add tests for new features
4. Update documentation
5. Request review from maintainers

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Soroban Testing Guide](https://soroban.stellar.org/docs/learn/testing)
- [Jest Testing](https://jestjs.io/)
- [CodeQL Analysis](https://codeql.github.com/)
