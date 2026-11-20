# Contributing to BOXMEOUT

Thank you for contributing to BOXMEOUT — a decentralized boxing prediction market on Stellar.
This guide covers everything you need to pick an issue, write code, and get your PR merged.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Getting Started](#getting-started)
3. [How to Pick an Issue](#how-to-pick-an-issue)
4. [Coding Standards](#coding-standards)
5. [Naming Conventions](#naming-conventions)
6. [Commit Messages](#commit-messages)
7. [Pull Request Process](#pull-request-process)
8. [Testing Requirements](#testing-requirements)
9. [Dependency Updates (Dependabot)](#dependency-updates-dependabot)
10. [Git Hooks and Formatting](#git-hooks-and-formatting)
11. [Labels Explained](#labels-explained)

---

## Project Overview

BOXMEOUT has three workspaces — pick the one that matches your skills:

| Workspace | Language | What you will work on |
|---|---|---|
| `/contracts` | Rust (Soroban) | Smart contract logic — betting, resolution, claims |
| `/backend` | TypeScript (Node.js) | Indexer, REST API, oracle service |
| `/frontend` | TypeScript (Next.js) | UI components, React hooks, wallet integration |

Every function in the codebase is already stubbed with a signature and a doc comment.
Your job as a contributor is to **implement the function body** — nothing else.

---

## Getting Started

### 1. Fork and clone

```bash
git clone https://github.com/YOUR_USERNAME/boxmeout.git
cd boxmeout
```

### 2. Create a feature branch

```bash
git checkout -b feat/issue-{number}-short-description
# Example: feat/issue-7-place-bet
```

### 3. Install dependencies for the workspace you are working in

**Contracts**
```bash
cd contracts
cargo build
cargo test
```

**Backend**
```bash
cd backend
cp .env.example .env   # fill in your Stellar Testnet + PostgreSQL credentials
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

**Frontend**
```bash
cd frontend
npm install
npm run dev            # opens http://localhost:3000
```

### 4. Verify the baseline passes before you change anything

```bash
# Contracts
cargo test

# Backend
npm run type-check && npm test

# Frontend
npm run type-check && npm test
```

---

## How to Pick an Issue

1. Browse [GitHub Issues](../../issues) filtered by your workspace label:
   - `smart-contract` — for `/contracts` work
   - `backend` — for `/backend` work
   - `frontend` — for `/frontend` work

2. New contributors: start with issues labelled **`good first issue`**.
   These are self-contained and require no knowledge of the full system.

3. **Claim an issue before starting.**
   Comment "I'll take this" on the issue thread.
   If no one responds to your claim within **48 hours**, you may take it over.

4. Do not work on an issue someone else has already claimed.
   Check whether there is an open PR linked to the issue before claiming.

5. **Ask questions in the issue thread** before writing any code.
   It is far cheaper to clarify requirements upfront than to rewrite later.

6. Stick to one issue per PR. Do not bundle unrelated changes.

---

## Coding Standards

### Rust — `/contracts`

- Follow the official [Soroban SDK patterns](https://developers.stellar.org/docs/smart-contracts).
- Every public function **must** have a `///` doc comment explaining the WHY, not just the what.
- All persistent storage reads and writes **must** go through typed wrapper functions — no raw `env.storage()` key calls in business logic.
- Use `require_auth()` or `require_auth_for_args()` on every state-changing function that involves a user address.
- Use **checked or saturating arithmetic** for all pool math — no unchecked `+` or `*` on `i128`.
- Mark bets as claimed **before** transferring tokens (checks-effects-interactions pattern).
- Run before committing:
  ```bash
  cargo fmt
  cargo clippy -- -D warnings
  cargo test
  ```

### TypeScript — `/backend` and `/frontend`

- TypeScript `strict` mode is enforced — **no implicit `any`**.
- All `async` functions must surface errors to the caller — no silent `catch {}` blocks.
- Never use `console.log` in committed code. Use the logger service (`pino`) in the backend.
- Do not add `// TODO` comments. Either implement it or leave the `throw new Error("Not implemented")` stub.
- Run before committing:
  ```bash
  npm run lint
  npm run type-check
  npm test
  ```

### React — `/frontend`

- Functional components only — no class components.
- Every component receives props through a typed `interface` named `{ComponentName}Props`.
- No inline styles — use Tailwind CSS utility classes only.
- No `useEffect` for data that can be fetched in a server component. Prefer server components where possible.
- Client components (`"use client"`) should be as small as possible — push state down.

---

## Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| Soroban function | `snake_case` | `place_bet()` |
| Soroban struct / enum | `PascalCase` | `MarketStatus` |
| Soroban storage key | `SCREAMING_SNAKE_CASE` | `MARKET_COUNT` |
| TypeScript function | `camelCase` | `getMarketById()` |
| TypeScript type / interface | `PascalCase` | `CreateMarketDTO` |
| React component | `PascalCase` | `MarketCard` |
| React component file | `PascalCase.tsx` | `MarketCard.tsx` |
| React hook | `use` prefix, `camelCase` | `useMarkets()` |
| Hook file | `camelCase.ts` | `useMarkets.ts` |
| Database model | `PascalCase` | `Market`, `Bet` |
| Database column | `camelCase` | `bettingEndsAt` |
| API route | `kebab-case` | `/api/market-stats` |
| Environment variable | `SCREAMING_SNAKE_CASE` | `STELLAR_RPC_URL` |
| Git branch | `feat/`, `fix/`, `docs/`, `test/` prefix | `feat/issue-7-place-bet` |

---

## Commit Messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

**Scopes:** `contracts`, `backend`, `frontend`, `docs`

**Examples:**
```
feat(contracts): implement place_bet() in Market contract
fix(backend): handle duplicate bet_id on event replay in recordBet()
test(frontend): add unit tests for useMarkets hook
docs(contracts): document all emitted events in contracts.md
```

Rules:
- Subject line max 72 characters
- Use the imperative mood: "implement" not "implemented"
- Reference the issue: `Closes #42` in the commit body or PR description

---

## Pull Request Process

1. Ensure your branch is up to date with `main` before opening a PR:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. Make sure all checks pass locally:
   ```bash
   # Contracts
   cargo fmt && cargo clippy -- -D warnings && cargo test

   # Backend / Frontend
   npm run lint && npm run type-check && npm test
   ```

3. Open a PR against `main` with:
   - A clear title matching your commit message format
   - A description explaining WHAT changed and WHY
   - `Closes #<issue-number>` linking the issue
   - Screenshots or test output for frontend / API changes

4. **Do not merge your own PR.** Wait for a maintainer review.

5. Address all review comments before requesting a re-review.

6. Squash your commits into one clean commit if asked.

7. Once approved, a maintainer will merge with squash-and-merge.

---

## Testing Requirements

| Workspace | Minimum requirement |
|---|---|
| `/contracts` | Unit tests for every public function — happy path + at least one error case |
| `/backend` | Integration test for every API endpoint using a real test database |
| `/frontend` | Unit test for every hook; snapshot test for every display component |

Test files live next to the code they test:
- `contracts/market/src/lib.rs` → tests in `#[cfg(test)]` module in the same file
- `backend/src/services/market.service.ts` → `market.service.test.ts` in the same folder
- `frontend/hooks/useMarkets.ts` → `useMarkets.test.ts` in the same folder

## Dependency Updates (Dependabot)

Dependabot is configured in `.github/dependabot.yml` and opens weekly update PRs (Mondays, UTC) for:

| Ecosystem | Directory | Label | Commit prefix |
|---|---|---|---|
| `npm` | `/frontend` | `frontend` | `chore(frontend)` |
| `npm` | `/backend` | `backend` | `chore(backend)` |
| `cargo` | `/contracts` | `smart-contract` | `chore(contracts)` |
| `github-actions` | `/` | `devops` | `ci` |

Minor and patch updates are grouped into one PR per ecosystem. Major updates open as individual PRs so they can be reviewed on their own. Each ecosystem has at most 5 open Dependabot PRs at a time.

When reviewing a Dependabot PR, check the CI result for the matching workspace before merging.

## Git Hooks and Formatting

Pre-commit hooks run [lint-staged](https://github.com/lint-staged/lint-staged) through [husky](https://typicode.github.io/husky/). Hooks are configured at the repo root (`package.json`, `.husky/pre-commit`) and only touch staged files:

| Staged files | Commands |
|---|---|
| `frontend/**/*.{ts,tsx,js,jsx,mjs,cjs}` | `eslint --fix`, then `prettier --write` |
| `backend/**/*.ts` | `eslint --fix`, then `prettier --write` |
| `frontend/**/*.{json,css}`, `backend/**/*.json` | `prettier --write` |

Install once from the repo root with `npm install`. The `prepare` script wires up husky. It is skipped when `CI` is set, and it does not fail when there is no `.git` directory (for example, a zip download). It works the same in Git Bash and PowerShell, because Git for Windows runs hooks through `sh`.

Run formatting by hand from `frontend/` or `backend/`:

```bash
npm run format        # rewrite files with Prettier
npm run format:check  # report files that differ from Prettier output
```

Prettier settings live in `frontend/.prettierrc`. Ignored paths are in each package's `.prettierignore`.

---


## Labels Explained

| Label | Meaning |
|---|---|
| `good first issue` | Self-contained, no deep system knowledge needed. Start here. |
| `intermediate` | Requires understanding of the surrounding module. |
| `advanced` | Cross-cutting concern, security-sensitive, or complex logic. |
| `smart-contract` | Work is in `/contracts` |
| `backend` | Work is in `/backend` |
| `frontend` | Work is in `/frontend` |
| `indexer` | Relates to the blockchain event indexer |
| `api` | Relates to the REST API layer |
| `hooks` | Relates to React hooks in `/frontend/hooks` |
| `components` | Relates to React components in `/frontend/components` |
| `security` | Security-sensitive — requires extra review care |
| `testing` | Writing or improving tests |
| `docs` | Documentation only |
| `oracle` | Relates to fight result submission and oracle trust |
| `devops` | CI, deployment scripts, environment config |
| `database` | Prisma schema or migration related |

---

## Questions?

Open a [GitHub Discussion](../../discussions) or ask in the issue thread.
Do not DM maintainers — public threads help everyone.
