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
9. [Contract Compatibility Policy](#contract-compatibility-policy)
10. [Labels Explained](#labels-explained)

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

---

## Contract Compatibility Policy

Contract releases are tracked in [`contracts/CHANGELOG.md`](../contracts/CHANGELOG.md),
which follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

### Changelog requirement

Every PR that changes a contract's **entrypoints, events, errors, or storage layout**
MUST add an entry under `## [Unreleased]` in `contracts/CHANGELOG.md`.
The PR template includes a checkbox for this; leave it unchecked only if your PR
touches none of those surfaces.

### What counts as breaking

A change is **breaking** if it can break an existing consumer (backend indexer,
frontend, or an already-deployed contract instance):

- **Entrypoints** — renaming or removing a function, changing its parameter list,
  parameter types, or return type; changing auth requirements.
- **Events** — renaming an event, changing its topic symbols, or changing the
  payload shape/order of fields.
- **Errors** — removing or renumbering an error variant, or changing the condition
  under which an existing error is raised.
- **Storage** — changing a storage key, the type stored under a key, or the layout
  of a stored struct/enum (including adding/removing/reordering fields).

Additive, backwards-compatible changes (new entrypoint, new event, new error
variant appended at the end, new optional field with a default) are **non-breaking**
but still require a changelog entry.

### How breaking changes are announced

1. **Version bump** — bump the contract crate version following semver:
   MAJOR for breaking, MINOR for additive, PATCH for fixes. Tag the release as
   `contracts-vX.Y.Z`.
2. **Migration notes** — the changelog entry MUST include a `### Migration` note
   describing what consumers must change (renamed calls, new event fields, storage
   migration steps).
3. **Event version** — when an event payload changes, bump the event's version
   field (or add a `vN` suffix to the topic) so indexers can distinguish old and
   new payloads.

### How consumers are notified

- The changelog entry and release tag are the source of truth.
- Maintainers post a summary in the `#contracts` channel and open tracking issues
  in `/backend` and `/frontend` for any breaking change before the release is cut.
- Consumers should pin to a tagged contract version and watch releases for
  `contracts-v*` tags.

---

## Labels Explained

| Label | Meaning |
|---|---|
| `good first issue` | Self-contained, no deep system knowledge needed. Start here. |
| `intermediate` | Requires understanding of the surrounding module. |
