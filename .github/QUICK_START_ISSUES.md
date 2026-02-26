# Quick Start: Creating GitHub Issues

This guide helps you quickly create the most important issues to get started with BoxMeOut Stella development.

## Prerequisites

1. Install GitHub CLI:
   ```bash
   # macOS
   brew install gh
   
   # Linux
   curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
   sudo apt update
   sudo apt install gh
   ```

2. Authenticate:
   ```bash
   gh auth login
   ```

3. Set repository:
   ```bash
   cd BOXMEOUT_STELLA
   gh repo set-default
   ```

## Option 1: Use the Script

```bash
cd .github/scripts
./create_issues.sh
```

## Option 2: Manual Creation

### Step 1: Create Labels

```bash
# Component labels
gh label create "contracts" --color "0052CC" --description "Smart contract related"
gh label create "backend" --color "5319E7" --description "Backend API related"
gh label create "frontend" --color "1D76DB" --description "Frontend UI related"
gh label create "devops" --color "0E8A16" --description "DevOps and infrastructure"
gh label create "documentation" --color "0075CA" --description "Documentation"
gh label create "testing" --color "FBCA04" --description "Testing and QA"
gh label create "security" --color "D93F0B" --description "Security related"

# Priority labels
gh label create "critical" --color "B60205" --description "Critical priority"
gh label create "high-priority" --color "D93F0B" --description "High priority"
gh label create "medium-priority" --color "FBCA04" --description "Medium priority"
gh label create "low-priority" --color "0E8A16" --description "Low priority"

# Type labels
gh label create "bug" --color "D73A4A" --description "Something isn't working"
gh label create "enhancement" --color "A2EEEF" --description "New feature or request"
gh label create "optimization" --color "BFD4F2" --description "Performance optimization"

# Contract-specific labels
gh label create "market" --color "C5DEF5" --description "Market contract"
gh label create "factory" --color "C5DEF5" --description "Factory contract"
gh label create "amm" --color "C5DEF5" --description "AMM contract"
gh label create "treasury" --color "C5DEF5" --description "Treasury contract"
gh label create "oracle" --color "C5DEF5" --description "Oracle contract"
```

### Step 2: Create Milestones

```bash
# v1.0 - MVP Launch
gh api repos/:owner/:repo/milestones \
  -f title="v1.0 - MVP Launch" \
  -f description="Minimum viable product for testnet launch" \
  -f due_on="2026-04-01T00:00:00Z"

# v1.1 - Mainnet Launch
gh api repos/:owner/:repo/milestones \
  -f title="v1.1 - Mainnet Launch" \
  -f description="Production-ready mainnet deployment" \
  -f due_on="2026-06-01T00:00:00Z"

# v2.0 - Advanced Features
gh api repos/:owner/:repo/milestones \
  -f title="v2.0 - Advanced Features" \
  -f description="Cross-chain, NFTs, AI, DAO" \
  -f due_on="2026-12-01T00:00:00Z"
```

### Step 3: Create Top 10 Priority Issues

#### Issue #1: Complete Market Contract

```bash
gh issue create \
  --title "[CONTRACT] Complete Market Contract Implementation" \
  --body "Market contract is only 55% complete with 9 functions remaining as stubs.

## Missing Functions
- get_market_info()
- get_user_position()
- calculate_payout()
- emergency_withdraw()
- update_market_params()
- pause_market() / unpause_market()
- get_market_stats()
- validate_oracle_result()
- distribute_winnings()

## Acceptance Criteria
- [ ] All 9 functions implemented
- [ ] Unit tests for each function
- [ ] Integration tests with Factory and Oracle
- [ ] Gas optimization review
- [ ] Security audit for fund handling

## Priority
High - Required for v1.0 launch" \
  --label "contracts,high-priority,market" \
  --milestone "v1.0 - MVP Launch"
```

#### Issue #2: Treasury Reward Distribution

```bash
gh issue create \
  --title "[CONTRACT] Implement Treasury Reward Distribution" \
  --body "Treasury contract missing critical reward distribution functions.

## Missing Functions
- distribute_rewards()
- distribute_leaderboard_rewards()
- update_fee_percentages()

## Requirements
- Proportional distribution logic
- Gas-efficient batch transfers
- Admin-only access control
- Event emission for tracking
- Integration with leaderboard system

## Test Coverage Needed
- Non-admin access denial
- Correct proportional calculations
- Edge cases (zero balance, single recipient)
- Gas limits for large batches

## Priority
High - Required for gamification system" \
  --label "contracts,high-priority,treasury" \
  --milestone "v1.0 - MVP Launch"
```

#### Issue #3: Authentication System

```bash
gh issue create \
  --title "[BACKEND] Implement Authentication System" \
  --body "Complete user authentication with JWT and wallet integration.

## Requirements
- JWT token generation and validation
- Refresh token mechanism
- Wallet signature verification (Freighter, xBull, Albedo, Rabet)
- Session management
- Rate limiting on auth endpoints

## Endpoints
- POST /api/users/register
- POST /api/users/login
- POST /api/users/refresh
- POST /api/users/wallet/connect
- POST /api/users/logout

## Acceptance Criteria
- [ ] All endpoints implemented
- [ ] JWT middleware working
- [ ] Wallet signature verification
- [ ] Rate limiting configured
- [ ] Unit and integration tests
- [ ] API documentation

## Priority
High - Foundation for all user features" \
  --label "backend,high-priority" \
  --milestone "v1.0 - MVP Launch"
```

#### Issue #4: Market API Endpoints

```bash
gh issue create \
  --title "[BACKEND] Market API Endpoints" \
  --body "Implement complete market management API.

## Endpoints
- GET /api/markets - List with filters
- GET /api/markets/:id - Market details
- POST /api/markets - Create market (admin)
- PUT /api/markets/:id - Update market
- POST /api/markets/:id/close - Close betting
- POST /api/markets/:id/resolve - Resolve outcome
- GET /api/markets/:id/stats - Real-time statistics

## Features
- Pagination and sorting
- Real-time updates via WebSocket
- Caching with Redis
- Rate limiting

## Acceptance Criteria
- [ ] All endpoints implemented
- [ ] Pagination working
- [ ] Filters and sorting
- [ ] Redis caching
- [ ] WebSocket integration
- [ ] Tests and documentation

## Priority
High - Core platform functionality" \
  --label "backend,high-priority" \
  --milestone "v1.0 - MVP Launch"
```

#### Issue #5: Wallet Integration

```bash
gh issue create \
  --title "[FRONTEND] Wallet Integration" \
  --body "Integrate Stellar wallet providers.

## Wallets
- Freighter
- xBull
- Albedo
- Rabet

## Features
- Auto-detect installed wallets
- Connection modal
- Account switching
- Transaction signing
- Balance display
- Network switching (testnet/mainnet)

## Acceptance Criteria
- [ ] All 4 wallets supported
- [ ] Auto-detection working
- [ ] Clean connection UI
- [ ] Transaction signing flow
- [ ] Error handling
- [ ] Responsive design

## Priority
High - Required for any user interaction" \
  --label "frontend,high-priority" \
  --milestone "v1.0 - MVP Launch"
```

#### Issue #6: Prediction Submission Flow

```bash
gh issue create \
  --title "[FRONTEND] Prediction Submission Flow" \
  --body "User interface for making predictions.

## Screens
1. Market selection
2. Outcome selection
3. Amount input with balance check
4. Commitment confirmation
5. Transaction signing
6. Success/error feedback

## Features
- Input validation
- Gas estimation
- Transaction status tracking
- Error handling with retry
- Reveal reminder notifications

## Acceptance Criteria
- [ ] Complete flow implemented
- [ ] Validation working
- [ ] Transaction tracking
- [ ] Error handling
- [ ] Mobile responsive
- [ ] Accessibility compliant

## Priority
High - Core user feature" \
  --label "frontend,high-priority" \
  --milestone "v1.0 - MVP Launch"
```

#### Issue #7: Production Deployment

```bash
gh issue create \
  --title "[DEVOPS] Production Deployment Pipeline" \
  --body "Set up production deployment infrastructure.

## Requirements
- Mainnet contract deployment
- Backend hosting (AWS/Vercel/Railway)
- Frontend hosting (Vercel/Netlify)
- PostgreSQL managed database
- Redis cache
- SSL certificates
- Domain configuration
- Environment management

## Acceptance Criteria
- [ ] Contracts deployed to mainnet
- [ ] Backend deployed and accessible
- [ ] Frontend deployed with custom domain
- [ ] Database configured with backups
- [ ] Redis cache working
- [ ] SSL certificates active
- [ ] Environment variables secured
- [ ] Monitoring enabled

## Priority
High - Required for launch" \
  --label "devops,high-priority" \
  --milestone "v1.1 - Mainnet Launch"
```

#### Issue #8: Monitoring & Alerting

```bash
gh issue create \
  --title "[DEVOPS] Monitoring & Alerting" \
  --body "Implement comprehensive monitoring.

## Tools
- Application monitoring (Datadog/New Relic)
- Error tracking (Sentry)
- Log aggregation (CloudWatch/Papertrail)
- Uptime monitoring (Pingdom/UptimeRobot)
- Performance metrics

## Alerts
- API errors (>5% error rate)
- Database connection failures
- Contract transaction failures
- High response times (>2s)
- Low balance warnings

## Acceptance Criteria
- [ ] Monitoring tools configured
- [ ] Alerts set up
- [ ] Dashboard created
- [ ] On-call rotation defined
- [ ] Runbooks documented

## Priority
High - Critical for production" \
  --label "devops,high-priority" \
  --milestone "v1.1 - Mainnet Launch"
```

#### Issue #9: API Documentation

```bash
gh issue create \
  --title "[DOCS] API Documentation" \
  --body "Complete API documentation with Swagger/OpenAPI.

## Requirements
- OpenAPI 3.0 specification
- Interactive Swagger UI
- Request/response examples
- Authentication guide
- Error code reference
- Rate limiting documentation

## Acceptance Criteria
- [ ] OpenAPI spec complete
- [ ] Swagger UI deployed
- [ ] All endpoints documented
- [ ] Examples provided
- [ ] Authentication explained
- [ ] Error codes listed

## Priority
High - Required for developers" \
  --label "documentation,high-priority" \
  --milestone "v1.0 - MVP Launch"
```

#### Issue #10: Smart Contract Security Audit

```bash
gh issue create \
  --title "[SECURITY] Smart Contract Security Audit" \
  --body "Professional security audit before mainnet launch.

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
- [ ] All high issues resolved
- [ ] Medium issues addressed or documented
- [ ] Audit report published
- [ ] Fixes verified by auditor

## Budget
$15,000 - $50,000 depending on auditor

## Priority
Critical - Cannot launch without this" \
  --label "security,critical,contracts" \
  --milestone "v1.1 - Mainnet Launch"
```

## Step 4: Create Project Board

1. Go to your repository on GitHub
2. Click "Projects" tab
3. Click "New project"
4. Choose "Board" template
5. Name it "BoxMeOut Stella Development"
6. Add columns:
   - 📋 Backlog
   - 🎯 Ready
   - 🚧 In Progress
   - 👀 In Review
   - ✅ Testing
   - ✨ Done

## Step 5: Link Issues to Project

```bash
# Get project ID
gh project list --owner GoSTEAN

# Link issues (replace PROJECT_ID and ISSUE_NUMBER)
gh project item-add PROJECT_ID --owner GoSTEAN --url https://github.com/GoSTEAN/BOXMEOUT_STELLA/issues/ISSUE_NUMBER
```

## Next Steps

1. ✅ Create remaining issues from `GITHUB_ISSUES.md`
2. ✅ Assign team members to issues
3. ✅ Set up project board automation
4. ✅ Create sprint milestones
5. ✅ Start development!

## Tips

- Use issue templates for consistency
- Link related issues with "Depends on #X" or "Blocks #Y"
- Update issue status regularly
- Close issues when truly done (all acceptance criteria met)
- Use labels consistently for filtering
- Add time estimates for planning

## Resources

- Full issue list: `GITHUB_ISSUES.md`
- Project board guide: `PROJECT_BOARD.md`
- Issue templates: `.github/ISSUE_TEMPLATE/`
- Creation script: `.github/scripts/create_issues.sh`
