# GitHub Issues for Wrestling Prediction Market

This document contains a comprehensive list of GitHub issues to track development, bugs, and enhancements for the BoxMeOut Stella platform.

## Table of Contents
1. [Smart Contract Issues](#smart-contract-issues)
2. [Backend Issues](#backend-issues)
3. [Frontend Issues](#frontend-issues)
4. [Infrastructure & DevOps](#infrastructure--devops)
5. [Documentation](#documentation)
6. [Testing & QA](#testing--qa)
7. [Security & Audits](#security--audits)

---

## Smart Contract Issues

### High Priority

#### Issue #1: Complete Market Contract Implementation
**Labels:** `contracts`, `high-priority`, `market`
**Component:** Market Contract

**Description:**
Market contract is only 55% complete with 9 functions remaining as stubs.

**Missing Functions:**
- `get_market_info()` - Retrieve market metadata
- `get_user_position()` - Get user's position in market
- `calculate_payout()` - Calculate winnings for resolved markets
- `emergency_withdraw()` - Emergency fund recovery
- `update_market_params()` - Admin function to update parameters
- `pause_market()` / `unpause_market()` - Circuit breaker
- `get_market_stats()` - Volume, liquidity, participant count
- `validate_oracle_result()` - Verify oracle submission
- `distribute_winnings()` - Batch payout to winners

**Acceptance Criteria:**
- All 9 functions implemented with full logic
- Unit tests for each function (happy path + edge cases)
- Integration tests with Factory and Oracle
- Gas optimization review
- Security audit for fund handling

---

#### Issue #2: Implement Treasury Reward Distribution
**Labels:** `contracts`, `high-priority`, `treasury`
**Component:** Treasury Contract

**Description:**
Treasury contract missing critical reward distribution functions.

**Missing Functions:**
- `distribute_rewards()` - Platform reward distribution
- `distribute_leaderboard_rewards()` - Top 10 user rewards
- `update_fee_percentages()` - Dynamic fee adjustment

**Requirements:**
- Proportional distribution logic
- Gas-efficient batch transfers
- Admin-only access control
- Event emission for tracking
- Integration with leaderboard system

**Test Coverage Needed:**
- Non-admin access denial
- Correct proportional calculations
- Edge cases (zero balance, single recipient)
- Gas limits for large batches

---

#### Issue #3: Oracle Consensus & Accuracy Tracking
**Labels:** `contracts`, `high-priority`, `oracle`
**Component:** Oracle Contract

**Description:**
Oracle system needs additional functionality for reliability and accountability.

**Missing Features:**
- `remove_oracle()` - Remove misbehaving oracles
- `update_accuracy()` - Track oracle performance
- `get_oracle_stats()` - Retrieve oracle metadata
- Consensus verification in `resolve_market()`

**Requirements:**
- Accuracy scoring algorithm
- Slashing mechanism for incorrect submissions
- Reputation system
- Historical performance tracking
- Admin controls for oracle management

---

#### Issue #4: Factory Pause/Unpause Mechanism
**Labels:** `contracts`, `medium-priority`, `factory`
**Component:** Factory Contract

**Description:**
Implement circuit breaker for emergency situations.

**Functions Needed:**
- `pause()` - Stop new market creation
- `unpause()` - Resume operations
- `is_paused()` - Check pause status
- `update_treasury()` - Update treasury address

**Use Cases:**
- Security incident response
- Maintenance windows
- Contract upgrades
- Treasury migration

---

### Medium Priority

#### Issue #5: AMM Liquidity Management
**Labels:** `contracts`, `medium-priority`, `amm`, `enhancement`

**Description:**
Enhance AMM with advanced liquidity features.

**Features:**
- Dynamic fee adjustment based on volatility
- Liquidity provider rewards
- Impermanent loss protection
- Multi-asset pool support
- Price impact warnings

---

#### Issue #6: Market Creation Fee Optimization
**Labels:** `contracts`, `optimization`, `factory`

**Description:**
Current 0.5-2 XLM creation fee may be too high for casual users.

**Proposal:**
- Tiered fee structure based on market type
- Volume-based discounts
- Reputation-based fee reduction
- Fee refund for high-quality markets

---

## Backend Issues

### High Priority

#### Issue #7: Implement Authentication System
**Labels:** `backend`, `high-priority`, `auth`

**Description:**
Complete user authentication with JWT and wallet integration.

**Requirements:**
- JWT token generation and validation
- Refresh token mechanism
- Wallet signature verification (Freighter, xBull, Albedo, Rabet)
- Session management
- Rate limiting on auth endpoints

**Endpoints:**
- `POST /api/users/register`
- `POST /api/users/login`
- `POST /api/users/refresh`
- `POST /api/users/wallet/connect`
- `POST /api/users/logout`

---

#### Issue #8: Market API Endpoints
**Labels:** `backend`, `high-priority`, `markets`

**Description:**
Implement complete market management API.

**Endpoints:**
- `GET /api/markets` - List with filters (status, category, date)
- `GET /api/markets/:id` - Market details with stats
- `POST /api/markets` - Create market (admin)
- `PUT /api/markets/:id` - Update market
- `POST /api/markets/:id/close` - Close betting
- `POST /api/markets/:id/resolve` - Resolve outcome
- `GET /api/markets/:id/stats` - Real-time statistics

**Features:**
- Pagination and sorting
- Real-time updates via WebSocket
- Caching with Redis
- Rate limiting

---

#### Issue #9: Prediction Commit-Reveal Flow
**Labels:** `backend`, `high-priority`, `predictions`

**Description:**
Implement privacy-preserving prediction system.

**Endpoints:**
- `POST /api/predictions/commit` - Submit hash
- `POST /api/predictions/reveal` - Reveal prediction
- `POST /api/predictions/:id/claim` - Claim winnings
- `GET /api/predictions/user/:userId` - User history

**Requirements:**
- SHA-256 commitment validation
- Reveal deadline enforcement
- Automatic settlement after resolution
- Transaction retry logic
- Event logging

---

#### Issue #10: WebSocket Real-Time Updates
**Labels:** `backend`, `medium-priority`, `websocket`

**Description:**
Implement WebSocket server for live updates.

**Events:**
- Market odds changes
- New predictions
- Market resolution
- Leaderboard updates
- User notifications

**Requirements:**
- Socket.io or native WebSocket
- Authentication via JWT
- Room-based subscriptions
- Reconnection handling
- Rate limiting

---

#### Issue #11: Leaderboard System
**Labels:** `backend`, `medium-priority`, `gamification`

**Description:**
Complete leaderboard and ranking system.

**Endpoints:**
- `GET /api/leaderboard/global` - All-time rankings
- `GET /api/leaderboard/weekly` - Weekly rankings
- `GET /api/leaderboard/monthly` - Monthly rankings
- `GET /api/leaderboard/category/:category` - Category-specific

**Features:**
- Efficient ranking algorithm
- Redis caching for performance
- Tier-based rewards
- Achievement tracking
- Historical snapshots

---

### Medium Priority

#### Issue #12: Referral System
**Labels:** `backend`, `medium-priority`, `referrals`

**Description:**
Implement referral tracking and rewards.

**Features:**
- Unique referral codes
- Referral tracking
- Reward distribution (5% of referee's first bet)
- Referral leaderboard
- Analytics dashboard

---

#### Issue #13: Notification System
**Labels:** `backend`, `medium-priority`, `notifications`

**Description:**
User notification system for important events.

**Notification Types:**
- Market resolution
- Winnings available
- Achievement unlocked
- Referral signup
- System announcements

**Channels:**
- In-app notifications
- Email (optional)
- WebSocket push
- Notification preferences

---

#### Issue #14: Admin Dashboard API
**Labels:** `backend`, `medium-priority`, `admin`

**Description:**
Admin endpoints for platform management.

**Endpoints:**
- `GET /api/admin/stats` - Platform statistics
- `GET /api/admin/users` - User management
- `POST /api/admin/markets/create` - Create market
- `PUT /api/admin/markets/:id/resolve` - Force resolve
- `GET /api/admin/transactions` - Transaction history
- `POST /api/admin/treasury/distribute` - Distribute rewards

---

## Frontend Issues

### High Priority

#### Issue #15: Wallet Integration
**Labels:** `frontend`, `high-priority`, `wallet`

**Description:**
Integrate Stellar wallet providers.

**Wallets:**
- Freighter
- xBull
- Albedo
- Rabet

**Features:**
- Auto-detect installed wallets
- Connection modal
- Account switching
- Transaction signing
- Balance display
- Network switching (testnet/mainnet)

---

#### Issue #16: Market Browse & Filter UI
**Labels:** `frontend`, `high-priority`, `ui`

**Description:**
Market discovery and filtering interface.

**Features:**
- Grid/list view toggle
- Filter by category, status, date
- Sort by volume, liquidity, closing time
- Search functionality
- Pagination
- Real-time odds display

---

#### Issue #17: Prediction Submission Flow
**Labels:** `frontend`, `high-priority`, `predictions`

**Description:**
User interface for making predictions.

**Screens:**
1. Market selection
2. Outcome selection
3. Amount input with balance check
4. Commitment confirmation
5. Transaction signing
6. Success/error feedback

**Features:**
- Input validation
- Gas estimation
- Transaction status tracking
- Error handling with retry
- Reveal reminder notifications

---

#### Issue #18: User Dashboard
**Labels:** `frontend`, `high-priority`, `dashboard`

**Description:**
Personal dashboard for users.

**Sections:**
- Active predictions
- Prediction history
- Winnings summary
- XP and level progress
- Achievements
- Referral stats
- Transaction history

---

### Medium Priority

#### Issue #19: Leaderboard UI
**Labels:** `frontend`, `medium-priority`, `gamification`

**Description:**
Leaderboard display with rankings.

**Features:**
- Global/weekly/monthly tabs
- User position highlight
- Tier badges
- Animated rank changes
- Top 10 spotlight
- Category filters

---

#### Issue #20: Market Creation Form (Admin)
**Labels:** `frontend`, `medium-priority`, `admin`

**Description:**
Admin interface for creating markets.

**Form Fields:**
- Event name and description
- Participants
- Category
- Closing time
- Resolution time
- Initial liquidity
- Oracle selection

**Validation:**
- Date validation (closing < resolution)
- Minimum liquidity check
- Duplicate market prevention

---

#### Issue #21: Achievement & Badge System UI
**Labels:** `frontend`, `low-priority`, `gamification`

**Description:**
Display user achievements and badges.

**Features:**
- Achievement gallery
- Progress tracking
- Unlock animations
- Badge showcase
- Rarity indicators
- Share to social media

---

## Infrastructure & DevOps

### High Priority

#### Issue #22: Production Deployment Pipeline
**Labels:** `devops`, `high-priority`, `deployment`

**Description:**
Set up production deployment infrastructure.

**Requirements:**
- Mainnet contract deployment
- Backend hosting (AWS/Vercel/Railway)
- Frontend hosting (Vercel/Netlify)
- PostgreSQL managed database
- Redis cache
- SSL certificates
- Domain configuration
- Environment management

---

#### Issue #23: Monitoring & Alerting
**Labels:** `devops`, `high-priority`, `monitoring`

**Description:**
Implement comprehensive monitoring.

**Tools:**
- Application monitoring (Datadog/New Relic)
- Error tracking (Sentry)
- Log aggregation (CloudWatch/Papertrail)
- Uptime monitoring (Pingdom/UptimeRobot)
- Performance metrics

**Alerts:**
- API errors (>5% error rate)
- Database connection failures
- Contract transaction failures
- High response times (>2s)
- Low balance warnings

---

#### Issue #24: Backup & Disaster Recovery
**Labels:** `devops`, `high-priority`, `backup`

**Description:**
Implement backup and recovery procedures.

**Requirements:**
- Automated database backups (daily)
- Point-in-time recovery
- Backup verification
- Disaster recovery plan
- Backup retention policy (30 days)
- Off-site backup storage

**Scripts:**
- `backup.sh` - Create backup
- `restore.sh` - Restore from backup
- `verify.sh` - Verify backup integrity

---

### Medium Priority

#### Issue #25: Load Testing
**Labels:** `devops`, `medium-priority`, `testing`

**Description:**
Comprehensive load testing before launch.

**Scenarios:**
- API baseline (100 concurrent users)
- Prediction burst (500 predictions/minute)
- AMM high-frequency trading
- WebSocket connections (1000+ concurrent)

**Metrics:**
- Response time (p50, p95, p99)
- Throughput (requests/sec)
- Error rate
- Resource utilization

---

#### Issue #26: CI/CD Enhancements
**Labels:** `devops`, `medium-priority`, `ci-cd`

**Description:**
Enhance existing CI/CD pipelines.

**Improvements:**
- Automated contract deployment to testnet
- Integration test suite in CI
- Performance regression tests
- Security scanning (Snyk/Dependabot)
- Code coverage reporting
- Automated changelog generation

---

## Documentation

### High Priority

#### Issue #27: API Documentation
**Labels:** `documentation`, `high-priority`

**Description:**
Complete API documentation with Swagger/OpenAPI.

**Requirements:**
- OpenAPI 3.0 specification
- Interactive Swagger UI
- Request/response examples
- Authentication guide
- Error code reference
- Rate limiting documentation

---

#### Issue #28: Smart Contract Documentation
**Labels:** `documentation`, `high-priority`, `contracts`

**Description:**
Comprehensive contract documentation.

**Sections:**
- Architecture overview
- Contract interfaces
- Function reference
- Event reference
- Security considerations
- Upgrade procedures
- Gas optimization tips

---

### Medium Priority

#### Issue #29: User Guide
**Labels:** `documentation`, `medium-priority`

**Description:**
End-user documentation and tutorials.

**Content:**
- Getting started guide
- Wallet setup tutorial
- How to make predictions
- Understanding odds
- Claiming winnings
- Leaderboard explanation
- FAQ

---

#### Issue #30: Developer Guide
**Labels:** `documentation`, `medium-priority`

**Description:**
Developer onboarding documentation.

**Content:**
- Local development setup
- Architecture overview
- Code style guide
- Testing guide
- Deployment guide
- Contributing guidelines
- Troubleshooting

---

## Testing & QA

### High Priority

#### Issue #31: Contract Test Coverage
**Labels:** `testing`, `high-priority`, `contracts`

**Description:**
Achieve 90%+ test coverage for all contracts.

**Current Coverage:**
- Market: ~60%
- Factory: ~70%
- AMM: ~65%
- Treasury: ~50%
- Oracle: ~70%

**Focus Areas:**
- Edge cases
- Error conditions
- Access control
- Reentrancy protection
- Integer overflow/underflow

---

#### Issue #32: Integration Test Suite
**Labels:** `testing`, `high-priority`, `integration`

**Description:**
End-to-end integration tests.

**Test Scenarios:**
- Complete prediction flow (commit → reveal → claim)
- Market lifecycle (create → close → resolve)
- Multi-user interactions
- Oracle consensus
- Treasury distribution
- Leaderboard updates

---

#### Issue #33: Backend Test Coverage
**Labels:** `testing`, `medium-priority`, `backend`

**Description:**
Improve backend test coverage to 80%+.

**Current Status:**
- Repositories: ~70%
- Services: ~60%
- Controllers: ~40%
- Middleware: ~50%

**Priority:**
- Authentication flows
- Transaction handling
- Error scenarios
- Database operations

---

### Medium Priority

#### Issue #34: Frontend E2E Tests
**Labels:** `testing`, `medium-priority`, `frontend`

**Description:**
End-to-end tests with Playwright/Cypress.

**Test Cases:**
- User registration and login
- Wallet connection
- Market browsing
- Prediction submission
- Dashboard navigation
- Responsive design

---

#### Issue #35: Security Testing
**Labels:** `testing`, `security`, `high-priority`

**Description:**
Comprehensive security testing.

**Tests:**
- Smart contract audit (external firm)
- Penetration testing
- SQL injection prevention
- XSS prevention
- CSRF protection
- Rate limiting validation
- Authentication bypass attempts

---

## Security & Audits

### Critical Priority

#### Issue #36: Smart Contract Security Audit
**Labels:** `security`, `critical`, `contracts`, `audit`

**Description:**
Professional security audit before mainnet launch.

**Scope:**
- All 5 smart contracts
- Access control mechanisms
- Fund handling logic
- Reentrancy vulnerabilities
- Integer arithmetic
- Oracle manipulation
- Front-running prevention

**Recommended Auditors:**
- OpenZeppelin
- Trail of Bits
- Quantstamp
- CertiK

---

#### Issue #37: Bug Bounty Program
**Labels:** `security`, `high-priority`

**Description:**
Launch bug bounty program.

**Tiers:**
- Critical: $10,000 - $50,000
- High: $5,000 - $10,000
- Medium: $1,000 - $5,000
- Low: $100 - $1,000

**Platforms:**
- Immunefi
- HackerOne
- Bugcrowd

---

### High Priority

#### Issue #38: Rate Limiting & DDoS Protection
**Labels:** `security`, `high-priority`, `backend`

**Description:**
Implement comprehensive rate limiting.

**Limits:**
- Authentication: 5 requests/minute
- API endpoints: 100 requests/minute
- WebSocket connections: 10/IP
- Market creation: 1/hour (non-admin)

**Tools:**
- Redis-based rate limiter
- Cloudflare DDoS protection
- IP blacklisting

---

#### Issue #39: Secrets Management
**Labels:** `security`, `high-priority`, `devops`

**Description:**
Secure secrets management system.

**Requirements:**
- AWS Secrets Manager / HashiCorp Vault
- Rotate JWT secrets regularly
- Encrypted environment variables
- No secrets in code/logs
- Audit trail for secret access

---

## Version 2 Features (Future)

### Issue #40: Cross-Chain Integration
**Labels:** `enhancement`, `v2`, `blockchain`

**Description:**
Enable cross-chain predictions via Stellar bridges.

**Chains:**
- Ethereum
- Polygon
- Binance Smart Chain
- Avalanche

---

### Issue #41: NFT Achievement System
**Labels:** `enhancement`, `v2`, `nft`, `gamification`

**Description:**
Tradeable NFT badges for achievements.

**Features:**
- Mint NFTs on Stellar
- Rarity tiers
- Marketplace integration
- Special perks for holders

---

### Issue #42: AI-Powered Analytics
**Labels:** `enhancement`, `v2`, `ai`

**Description:**
AI-driven insights and recommendations.

**Features:**
- Prediction success analysis
- Personalized market recommendations
- Trend detection
- Risk assessment
- Performance forecasting

---

### Issue #43: DAO Governance
**Labels:** `enhancement`, `v2`, `governance`

**Description:**
Decentralized governance system.

**Features:**
- Governance token
- Proposal system
- Token-weighted voting
- Treasury management
- Parameter updates

---

### Issue #44: Social Features
**Labels:** `enhancement`, `v2`, `social`

**Description:**
Social prediction features.

**Features:**
- Copy trading
- Private leagues
- Social feed
- User profiles
- Following system
- Shared predictions

---

### Issue #45: Mobile App
**Labels:** `enhancement`, `v2`, `mobile`

**Description:**
Native mobile applications.

**Platforms:**
- iOS (React Native / Flutter)
- Android (React Native / Flutter)

**Features:**
- Push notifications
- Biometric authentication
- Mobile wallet integration
- Offline mode

---

## Issue Creation Checklist

When creating these issues on GitHub:

1. ✅ Use appropriate labels
2. ✅ Assign to relevant team members
3. ✅ Set milestones (v1.0, v1.1, v2.0)
4. ✅ Link related issues
5. ✅ Add to project board
6. ✅ Include acceptance criteria
7. ✅ Estimate effort (story points)
8. ✅ Set priority

## Priority Legend

- **Critical**: Blocks launch, security risk
- **High**: Required for v1.0
- **Medium**: Important but not blocking
- **Low**: Nice to have, future enhancement

## Labels to Create

```
Component Labels:
- contracts
- backend
- frontend
- devops
- documentation

Priority Labels:
- critical
- high-priority
- medium-priority
- low-priority

Type Labels:
- bug
- enhancement
- security
- testing
- optimization

Status Labels:
- in-progress
- blocked
- needs-review
- ready-for-testing
```

---

**Total Issues**: 45
**Critical**: 1
**High Priority**: 23
**Medium Priority**: 18
**Low Priority**: 3
