# GitHub Project Board Configuration

This document describes the recommended project board setup for tracking BoxMeOut Stella development.

## Board Structure

### Option 1: Kanban Board (Recommended)

**Columns:**
1. 📋 Backlog - All planned issues
2. 🎯 Ready - Issues ready to start
3. 🚧 In Progress - Currently being worked on
4. 👀 In Review - Awaiting code review
5. ✅ Testing - In QA/testing phase
6. ✨ Done - Completed

### Option 2: Sprint Board

**Columns:**
1. 📋 Product Backlog
2. 🎯 Sprint Backlog
3. 🚧 In Progress
4. 👀 Review
5. ✅ Done

## Automation Rules

### Auto-move cards:

1. **To "In Progress"**
   - When issue is assigned
   - When PR is opened

2. **To "In Review"**
   - When PR is marked ready for review
   - When "review-requested" label is added

3. **To "Testing"**
   - When PR is approved
   - When "ready-for-testing" label is added

4. **To "Done"**
   - When issue is closed
   - When PR is merged

## Views

### 1. By Priority
Filter: `label:critical OR label:high-priority`
Sort: Priority (Critical → High → Medium → Low)

### 2. By Component
Group by: Labels (contracts, backend, frontend, devops)

### 3. By Milestone
Group by: Milestone (v1.0, v1.1, v2.0)

### 4. By Assignee
Group by: Assignee

### 5. Sprint View
Filter: `milestone:"Sprint X"`
Sort: Priority

## Issue Templates

Issues should follow this format:

```markdown
## Description
Clear description of the task

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Technical Details
Implementation notes, references, etc.

## Testing Requirements
- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual testing steps

## Related Issues
- Depends on #X
- Blocks #Y
- Related to #Z
```

## Labels Usage

### Priority (Required)
- `critical` - Blocks launch, security risk
- `high-priority` - Required for v1.0
- `medium-priority` - Important but not blocking
- `low-priority` - Nice to have

### Component (Required)
- `contracts` - Smart contracts
- `backend` - Backend API
- `frontend` - Frontend UI
- `devops` - Infrastructure
- `documentation` - Docs
- `testing` - QA

### Type (Required)
- `bug` - Something broken
- `enhancement` - New feature
- `optimization` - Performance
- `security` - Security issue

### Status (Optional)
- `blocked` - Cannot proceed
- `needs-review` - Awaiting review
- `ready-for-testing` - Ready for QA

### Contract-Specific
- `market` - Market contract
- `factory` - Factory contract
- `amm` - AMM contract
- `treasury` - Treasury contract
- `oracle` - Oracle contract

## Milestones

### v1.0 - MVP Launch (Target: April 2026)
**Goal:** Testnet launch with core features

**Must-Have:**
- Complete smart contracts (all 5)
- Basic backend API
- Functional frontend
- Wallet integration
- Prediction flow (commit-reveal)
- Market creation
- Basic leaderboard

**Success Criteria:**
- All contracts deployed to testnet
- 100+ test users
- 50+ markets created
- Zero critical bugs

---

### v1.1 - Mainnet Launch (Target: June 2026)
**Goal:** Production-ready mainnet deployment

**Must-Have:**
- Security audit completed
- All v1.0 features stable
- Monitoring and alerting
- Backup and recovery
- Load testing passed
- Documentation complete

**Success Criteria:**
- Audit report published
- 1000+ users in first month
- 99.9% uptime
- <2s average response time

---

### v2.0 - Advanced Features (Target: December 2026)
**Goal:** Cross-chain, NFTs, AI, DAO

**Features:**
- Cross-chain integration
- NFT achievement system
- AI-powered analytics
- DAO governance
- Social features
- Mobile app

---

## Sprint Planning

### Sprint Duration
2 weeks

### Sprint Ceremonies

**Sprint Planning (Monday)**
- Review backlog
- Select sprint items
- Estimate story points
- Assign tasks

**Daily Standup (Daily, 15 min)**
- What did you do yesterday?
- What will you do today?
- Any blockers?

**Sprint Review (Friday, Week 2)**
- Demo completed work
- Gather feedback
- Update roadmap

**Sprint Retrospective (Friday, Week 2)**
- What went well?
- What could improve?
- Action items

## Story Point Estimation

**1 point** - Few hours, straightforward
- Fix typo
- Update documentation
- Simple config change

**2 points** - Half day, clear path
- Add new API endpoint
- Simple UI component
- Basic test coverage

**3 points** - 1 day, some complexity
- New feature with tests
- Database migration
- Integration work

**5 points** - 2-3 days, significant work
- Complex feature
- Multiple components
- Extensive testing

**8 points** - 1 week, major feature
- New contract function
- Full feature implementation
- Architecture changes

**13 points** - Too large, break down
- Should be split into smaller issues

## Definition of Done

An issue is "Done" when:

### Code
- [ ] Code written and follows style guide
- [ ] Code reviewed and approved
- [ ] No linting errors
- [ ] No TypeScript errors (if applicable)

### Testing
- [ ] Unit tests written and passing
- [ ] Integration tests passing (if applicable)
- [ ] Manual testing completed
- [ ] Edge cases covered

### Documentation
- [ ] Code comments added
- [ ] API docs updated (if applicable)
- [ ] README updated (if applicable)
- [ ] Changelog updated

### Deployment
- [ ] Merged to main branch
- [ ] Deployed to testnet (if applicable)
- [ ] Verified in production-like environment

### Review
- [ ] Product owner approved
- [ ] No known bugs
- [ ] Acceptance criteria met

## Quick Start

### 1. Create Project Board

```bash
# Using GitHub CLI
gh project create --owner GoSTEAN --title "BoxMeOut Stella Development"
```

Or manually:
1. Go to repository → Projects → New project
2. Choose "Board" template
3. Name it "BoxMeOut Stella Development"
4. Add columns as described above

### 2. Link Issues

```bash
# Link issue to project
gh project item-add <PROJECT_ID> --owner GoSTEAN --url <ISSUE_URL>
```

### 3. Set Up Automation

1. Go to Project → Settings → Workflows
2. Enable "Auto-add to project"
3. Enable "Auto-archive"
4. Configure custom automations

### 4. Create Views

1. Click "+ New view"
2. Configure filters and grouping
3. Save view

## Team Roles

### Product Owner
- Prioritizes backlog
- Defines acceptance criteria
- Reviews completed work
- Makes go/no-go decisions

### Tech Lead
- Reviews architecture decisions
- Approves major changes
- Mentors team members
- Ensures code quality

### Developers
- Implement features
- Write tests
- Review code
- Update documentation

### QA Engineer
- Test features
- Report bugs
- Verify fixes
- Maintain test suite

### DevOps Engineer
- Manage infrastructure
- Deploy applications
- Monitor systems
- Optimize performance

## Communication

### GitHub
- Issue comments for technical discussion
- PR reviews for code feedback
- Project board for status updates

### Slack/Discord (if applicable)
- #dev-general - General discussion
- #dev-contracts - Smart contract dev
- #dev-backend - Backend dev
- #dev-frontend - Frontend dev
- #dev-devops - Infrastructure
- #alerts - Automated alerts

### Meetings
- Sprint planning (bi-weekly)
- Daily standup (daily)
- Sprint review (bi-weekly)
- Sprint retrospective (bi-weekly)
- Architecture review (as needed)

## Metrics to Track

### Velocity
- Story points completed per sprint
- Trend over time
- Capacity planning

### Cycle Time
- Time from "In Progress" to "Done"
- Identify bottlenecks
- Optimize workflow

### Bug Rate
- Bugs per feature
- Bug resolution time
- Bug severity distribution

### Code Quality
- Test coverage %
- Linting errors
- Code review comments

### Deployment Frequency
- Deploys per week
- Deployment success rate
- Rollback frequency

## Resources

- [GitHub Projects Documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
- [Agile Best Practices](https://www.atlassian.com/agile)
- [Scrum Guide](https://scrumguides.org/)
