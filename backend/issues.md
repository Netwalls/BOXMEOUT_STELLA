# Backend — GitHub Issues

> Copy each block below to create the corresponding GitHub issue.
> Create these labels before applying them.
>
> | Label | Color | Description |
> |---|---|---|
> | `backend` | `#0075ca` | Backend / API work |
> | `auth` | `#ee0701` | Authentication & authorisation |
> | `markets` | `#e4e669` | Market management |
> | `trading` | `#f9d0c4` | Trading & share operations |
> | `predictions` | `#a2eeef` | Prediction placement & settlement |
> | `disputes` | `#b60205` | Dispute resolution |
> | `oracle` | `#5319e7` | Oracle integration |
> | `wallet` | `#006b75` | Wallet & balance management |
> | `treasury` | `#0e8a16` | Treasury operations |
> | `notifications` | `#fbca04` | Notification system |
> | `leaderboard` | `#1d76db` | Leaderboard & rankings |
> | `users` | `#bfd4f2` | User profile & management |
> | `referrals` | `#d93f0b` | Referral system |
> | `achievements` | `#0075ca` | Achievement & reward system |
> | `websocket` | `#5319e7` | Real-time WebSocket layer |
> | `middleware` | `#e4e669` | Express middleware |
> | `blockchain` | `#0e8a16` | Stellar / Soroban blockchain layer |
> | `cron` | `#fbca04` | Scheduled / background jobs |
> | `repository` | `#bfd4f2` | Data access layer |
> | `feature` | `#a2eeef` | New functionality |
> | `bug` | `#ee0701` | Bug fix |
> | `security` | `#ee0701` | Security-critical |
> | `testing` | `#0075ca` | Test coverage |
> | `good first issue` | `#7057ff` | Suitable for newcomers |

---

## Issue #1 — Auth: JWT login & registration

**Title:** `[Auth] Implement user registration and JWT login`

**Tags:** `backend`, `auth`, `feature`, `security`

**Description:**
Core authentication — register a new user with email/password and issue a JWT access + refresh token pair on login.

**Acceptance Criteria:**
- [ ] `POST /auth/register` — validates email uniqueness, hashes password with bcrypt, creates user record, returns JWT pair.
- [ ] `POST /auth/login` — validates credentials, returns `access_token` (15 min) and `refresh_token` (7 days).
- [ ] Passwords stored as bcrypt hashes (min cost 12). Never returned in any response.
- [ ] Input validated via `validation.schemas.ts` (email format, password strength).
- [ ] Returns `400` for duplicate email, `401` for bad credentials.
- [ ] Integration test in `tests/auth.integration.test.ts`.

**Files:** `src/routes/auth.routes.ts`, `src/controllers/auth.controller.ts`, `src/services/auth.service.ts`

---

## Issue #2 — Auth: refresh token rotation

**Title:** `[Auth] Implement refresh token rotation`

**Tags:** `backend`, `auth`, `feature`, `security`

**Description:**
Silently issue a new access token from a valid refresh token, and rotate the refresh token on every use to prevent replay attacks.

**Acceptance Criteria:**
- [ ] `POST /auth/refresh` — accepts `refresh_token`, returns new `access_token` + new `refresh_token`.
- [ ] Old refresh token is invalidated immediately on use.
- [ ] Returns `401` if token is expired, invalid, or already used.
- [ ] Refresh tokens stored and tracked in `session.service.ts`.
- [ ] Unit test: replaying a used refresh token is rejected.

**Files:** `src/services/auth.service.ts`, `src/services/session.service.ts`

---

## Issue #3 — Auth: logout & session invalidation

**Title:** `[Auth] Implement logout and full session invalidation`

**Tags:** `backend`, `auth`, `feature`, `security`

**Description:**
Invalidate a user's current session or all sessions at once.

**Acceptance Criteria:**
- [ ] `POST /auth/logout` — invalidates the current refresh token.
- [ ] `POST /auth/logout-all` — invalidates ALL sessions for the authenticated user.
- [ ] Requires valid access token (protected by `auth.middleware.ts`).
- [ ] Returns `204` on success.

**Files:** `src/routes/auth.routes.ts`, `src/services/session.service.ts`

---

## Issue #4 — Auth: wallet-based authentication (Stellar)

**Title:** `[Auth] Implement Stellar wallet signature authentication`

**Tags:** `backend`, `auth`, `blockchain`, `feature`, `security`

**Description:**
Allow users to authenticate by signing a challenge message with their Stellar keypair — passwordless login.

**Acceptance Criteria:**
- [ ] `GET /auth/challenge` — returns a one-time nonce for the user's public key.
- [ ] `POST /auth/wallet-login` — verifies the signed nonce against the public key using `stellar.service.ts`, issues JWT pair on success.
- [ ] Nonce expires after 60 seconds.
- [ ] Returns `401` if signature is invalid or nonce is expired/used.
- [ ] Unit test: invalid signature is rejected; valid signature issues tokens.

**Files:** `src/routes/auth.routes.ts`, `src/controllers/auth.controller.ts`, `src/services/auth.service.ts`, `src/services/stellar.service.ts`

---

## Issue #5 — Auth Middleware: JWT verification

**Title:** `[Middleware] Implement JWT auth middleware`

**Tags:** `backend`, `middleware`, `auth`, `security`

**Description:**
Express middleware that validates the `Authorization: Bearer <token>` header on protected routes.

**Acceptance Criteria:**
- [ ] Extracts and verifies the JWT using the secret from config.
- [ ] Attaches `req.user` (id, role, walletAddress) on success.
- [ ] Returns `401` for missing, malformed, or expired tokens.
- [ ] Returns `403` if token is valid but user account is suspended.
- [ ] Unit test: expired token rejected; valid token passes; missing header rejected.

**File:** `src/middleware/auth.middleware.ts`

---

## Issue #6 — Auth Middleware: admin role guard

**Title:** `[Middleware] Implement admin role guard middleware`

**Tags:** `backend`, `middleware`, `auth`, `security`

**Description:**
Restricts routes to users with the `admin` role.

**Acceptance Criteria:**
- [ ] Reads `req.user.role` (set by auth middleware).
- [ ] Returns `403` if role is not `admin`.
- [ ] Applied to all admin-only routes (market resolution, dispute ruling, treasury management).
- [ ] Unit test: non-admin user gets `403`; admin user passes.

**File:** `src/middleware/admin.middleware.ts`

---

## Issue #7 — Middleware: rate limiting

**Title:** `[Middleware] Implement rate limiting middleware`

**Tags:** `backend`, `middleware`, `security`, `feature`

**Description:**
Protect the API from abuse with per-IP and per-user rate limits.

**Acceptance Criteria:**
- [ ] Global limit: 100 req/min per IP.
- [ ] Auth endpoints: 10 req/min per IP (stricter, anti-brute-force).
- [ ] Trading endpoints: 30 req/min per authenticated user.
- [ ] Returns `429 Too Many Requests` with `Retry-After` header when exceeded.
- [ ] Uses Redis for distributed counter storage via `rateLimit.middleware.ts`.
- [ ] Integration test: exceed limit → `429`; wait → requests resume.

**File:** `src/middleware/rateLimit.middleware.ts`

---

## Issue #8 — Middleware: request validation

**Title:** `[Middleware] Implement request validation middleware using Zod schemas`

**Tags:** `backend`, `middleware`, `feature`, `good first issue`

**Description:**
Centrally validate all incoming request bodies and query params against Zod schemas defined in `validation.schemas.ts`.

**Acceptance Criteria:**
- [ ] Returns `400` with structured error messages for invalid input.
- [ ] Used on all routes that accept a request body.
- [ ] Error response format: `{ errors: [{ field, message }] }`.
- [ ] Unit test: missing required field returns `400` with field name.

**Files:** `src/middleware/validation.middleware.ts`, `src/schemas/validation.schemas.ts`

---

## Issue #9 — Middleware: error handling

**Title:** `[Middleware] Implement centralised error handling middleware`

**Tags:** `backend`, `middleware`, `feature`

**Description:**
Global Express error handler — catches all thrown errors, maps them to consistent HTTP responses.

**Acceptance Criteria:**
- [ ] Catches `AppError` (custom) and maps to the correct HTTP status code.
- [ ] Catches unhandled `Error` → returns `500` without leaking stack traces in production.
- [ ] Logs all `5xx` errors to the logging service.
- [ ] Response format: `{ error: { code, message, details? } }`.
- [ ] Unit test: `AppError(404, 'Not found')` → `{ status: 404, error: { message: 'Not found' } }`.

**File:** `src/middleware/error.middleware.ts`

---

## Issue #10 — Middleware: security headers

**Title:** `[Middleware] Implement security headers middleware (Helmet + CORS)`

**Tags:** `backend`, `middleware`, `security`

**Description:**
Apply HTTP security best practices to all responses.

**Acceptance Criteria:**
- [ ] Uses Helmet to set `X-Content-Type-Options`, `X-Frame-Options`, `HSTS`, `CSP` headers.
- [ ] CORS configured to allow only whitelisted origins from environment config.
- [ ] `OPTIONS` preflight requests handled correctly.
- [ ] Unit test: response includes expected security headers.

**File:** `src/middleware/security.middleware.ts`

---

## Issue #11 — Markets: create market

**Title:** `[Markets] Implement create market endpoint`

**Tags:** `backend`, `markets`, `feature`

**Description:**
Admin or operator creates a new prediction market.

**Acceptance Criteria:**
- [ ] `POST /markets` (admin only) — validates body, creates market record via `market.service.ts`, calls Stellar contract `create_market` via `blockchain.service.ts`.
- [ ] Required fields: `question`, `outcomes[]`, `bettingCloseTime`, `resolutionDeadline`, `category`, `tags`.
- [ ] Returns `201` with the created market object including `marketId`.
- [ ] Returns `400` for invalid dates (e.g. deadline in the past).
- [ ] Integration test: create market → fetch market → verify fields match.

**Files:** `src/routes/markets.routes.ts`, `src/controllers/markets.controller.ts`, `src/services/market.service.ts`, `src/repositories/market.repository.ts`

---

## Issue #12 — Markets: list & filter markets

**Title:** `[Markets] Implement list markets with filtering and pagination`

**Tags:** `backend`, `markets`, `feature`, `good first issue`

**Description:**
Public endpoint to browse open markets with filtering by category, status, and sorting options.

**Acceptance Criteria:**
- [ ] `GET /markets` — returns paginated list.
- [ ] Query params: `status` (open/closed/resolved), `category`, `sort` (volume/newest/closing_soon), `page`, `limit`.
- [ ] Default: `status=open`, sorted by newest, `limit=20`.
- [ ] Returns `{ data: Market[], total, page, limit }`.
- [ ] Integration test: create 3 markets with different statuses → filter by `status=open` returns only open ones.

**Files:** `src/routes/markets.routes.ts`, `src/controllers/markets.controller.ts`, `src/repositories/market.repository.ts`

---

## Issue #13 — Markets: get market by ID

**Title:** `[Markets] Implement get single market endpoint`

**Tags:** `backend`, `markets`, `feature`, `good first issue`

**Description:**
Fetch full details of a single market including current outcome prices, volume, and stats.

**Acceptance Criteria:**
- [ ] `GET /markets/:id` — returns full `Market` object.
- [ ] Includes: question, outcomes with current prices, status, volume, participant count, fee pools.
- [ ] Returns `404` if market not found.
- [ ] Response is cached for 5 seconds (Redis) to reduce DB load.

**Files:** `src/controllers/markets.controller.ts`, `src/repositories/market.repository.ts`

---

## Issue #14 — Markets: resolve market (oracle)

**Title:** `[Markets] Implement market resolution via oracle`

**Tags:** `backend`, `markets`, `oracle`, `feature`, `security`

**Description:**
Oracle submits the winning outcome for a closed market, kicking off the two-phase on-chain resolution.

**Acceptance Criteria:**
- [ ] `POST /markets/:id/resolve` (oracle/admin only) — validates market is in `closed` state.
- [ ] Calls `oracle.service` → calls Stellar contract `report_outcome`.
- [ ] Updates market status to `reported` in DB.
- [ ] Returns `200` with updated market record.
- [ ] Returns `409` if market is not in a resolvable state.

**Files:** `src/routes/oracle.ts`, `src/controllers/oracle.controller.ts`, `src/services/market.service.ts`

---

## Issue #15 — Trading: buy shares

**Title:** `[Trading] Implement buy shares endpoint`

**Tags:** `backend`, `trading`, `feature`, `security`

**Description:**
User buys outcome shares via the CPMM. Records the trade in the DB and submits the transaction to Stellar.

**Acceptance Criteria:**
- [ ] `POST /trading/buy` — requires auth.
- [ ] Body: `{ marketId, outcomeId, collateralAmount, minSharesOut }`.
- [ ] Validates market is open and `collateralAmount >= minTradeAmount`.
- [ ] Calls `trading.service.ts` → calls Stellar contract `buy_shares` via `blockchain.service.ts`.
- [ ] Saves trade record to `trade.repository.ts`.
- [ ] Updates user's share position in `share.repository.ts`.
- [ ] Returns `TradeReceipt` with shares received, avg price, fees.
- [ ] Returns `400` for slippage exceeded, `404` for market not found.
- [ ] Integration test: buy → check position updated → check volume incremented.

**Files:** `src/routes/trading.ts`, `src/controllers/trading.controller.ts`, `src/services/trading.service.ts`, `src/repositories/trade.repository.ts`, `src/repositories/share.repository.ts`

---

## Issue #16 — Trading: sell shares

**Title:** `[Trading] Implement sell shares endpoint`

**Tags:** `backend`, `trading`, `feature`, `security`

**Description:**
User sells outcome shares back to the AMM before market resolution.

**Acceptance Criteria:**
- [ ] `POST /trading/sell` — requires auth.
- [ ] Body: `{ marketId, outcomeId, sharesAmount, minCollateralOut }`.
- [ ] Validates user holds enough shares via `share.repository.ts`.
- [ ] Calls Stellar contract `sell_shares`.
- [ ] Updates trade record and share position.
- [ ] Returns `TradeReceipt`.
- [ ] Returns `400` if insufficient shares or slippage exceeded.
- [ ] Integration test: buy shares → sell shares → position returns to zero.

**Files:** `src/routes/trading.ts`, `src/controllers/trading.controller.ts`, `src/services/trading.service.ts`

---

## Issue #17 — Trading: get trade history

**Title:** `[Trading] Implement trade history endpoint`

**Tags:** `backend`, `trading`, `feature`, `good first issue`

**Description:**
Return paginated trade history for the authenticated user or for a specific market.

**Acceptance Criteria:**
- [ ] `GET /trading/history` — returns authenticated user's trades.
- [ ] `GET /markets/:id/trades` — returns all trades for a market (public).
- [ ] Supports `page`, `limit`, `outcomeId` query filters.
- [ ] Returns `{ data: Trade[], total, page, limit }`.

**Files:** `src/routes/trading.ts`, `src/repositories/trade.repository.ts`

---

## Issue #18 — Trading: get share quote (price preview)

**Title:** `[Trading] Implement buy/sell quote endpoint (read-only price preview)`

**Tags:** `backend`, `trading`, `feature`

**Description:**
Preview the output of a trade before submitting it — used by the frontend to show expected shares and price impact.

**Acceptance Criteria:**
- [ ] `GET /trading/quote?marketId=&outcomeId=&amount=&side=buy|sell`
- [ ] Calls blockchain `get_buy_quote` or `get_sell_quote`.
- [ ] Returns `{ sharesOut|collateralOut, avgPriceBps, priceImpactBps, totalFees }`.
- [ ] No auth required; no state mutation.
- [ ] Response cached for 2 seconds.

**Files:** `src/routes/trading.ts`, `src/controllers/trading.controller.ts`, `src/services/trading.service.ts`

---

## Issue #19 — Predictions: place prediction

**Title:** `[Predictions] Implement place prediction endpoint`

**Tags:** `backend`, `predictions`, `feature`

**Description:**
Record a user's prediction (separate from actual share purchase — used for tracking and leaderboard scoring).

**Acceptance Criteria:**
- [ ] `POST /predictions` — requires auth.
- [ ] Body: `{ marketId, outcomeId, confidence }`.
- [ ] Validates market is open and user has not already predicted on this market.
- [ ] Saves via `prediction.service.ts` and `prediction.repository.ts`.
- [ ] Returns `201` with the prediction record.
- [ ] Returns `409` if user has already predicted on this market.

**Files:** `src/routes/predictions.routes.ts`, `src/controllers/predictions.controller.ts`, `src/services/prediction.service.ts`, `src/repositories/prediction.repository.ts`

---

## Issue #20 — Predictions: settle predictions after resolution

**Title:** `[Predictions] Implement prediction settlement after market resolution`

**Tags:** `backend`, `predictions`, `feature`

**Description:**
After a market resolves, mark all predictions as won/lost and award points to correct predictors.

**Acceptance Criteria:**
- [ ] Triggered by market resolution event (via cron or webhook).
- [ ] For each prediction on the resolved market: compare `outcomeId` with `winningOutcomeId`.
- [ ] Mark prediction as `won` or `lost`, award accuracy points.
- [ ] Updates user's leaderboard score via `leaderboard.service.ts`.
- [ ] Sends notification via `notification.service.ts`.
- [ ] Integration test: resolve market → predictions settled → leaderboard updated.

**Files:** `src/services/prediction.service.ts`, `src/services/leaderboard.service.ts`

---

## Issue #21 — Predictions: get user predictions

**Title:** `[Predictions] Implement get predictions for authenticated user`

**Tags:** `backend`, `predictions`, `feature`, `good first issue`

**Description:**
Return all predictions placed by the authenticated user with their settlement status.

**Acceptance Criteria:**
- [ ] `GET /predictions` — requires auth; returns paginated predictions.
- [ ] Filter by `status`: `pending`, `won`, `lost`.
- [ ] Each prediction includes: market question, outcome label, confidence, points earned.
- [ ] Supports `page` and `limit` query params.

**Files:** `src/routes/predictions.routes.ts`, `src/repositories/prediction.repository.ts`

---

## Issue #22 — Disputes: submit dispute

**Title:** `[Disputes] Implement dispute submission endpoint`

**Tags:** `backend`, `disputes`, `feature`, `security`

**Description:**
User challenges an oracle report by posting a bond and proposing an alternative outcome.

**Acceptance Criteria:**
- [ ] `POST /disputes` — requires auth.
- [ ] Body: `{ marketId, proposedOutcomeId, reason }`.
- [ ] Validates market is in `reported` state and dispute window is active.
- [ ] Checks no existing dispute for this market (`409` if one already exists).
- [ ] Deducts bond from user wallet via `wallet.service.ts`.
- [ ] Calls Stellar contract `dispute_outcome`.
- [ ] Saves dispute record via `dispute.service.ts` and `dispute.repository.ts`.
- [ ] Returns `201` with dispute record.

**Files:** `src/routes/disputes.routes.ts`, `src/controllers/disputes.controller.ts`, `src/services/dispute.service.ts`, `src/repositories/dispute.repository.ts`

---

## Issue #23 — Disputes: resolve dispute (admin)

**Title:** `[Disputes] Implement admin dispute resolution endpoint`

**Tags:** `backend`, `disputes`, `admin`, `feature`, `security`

**Description:**
Admin rules on an active dispute — upholding it refunds the bond; rejecting it slashes it.

**Acceptance Criteria:**
- [ ] `PATCH /disputes/:id/resolve` (admin only).
- [ ] Body: `{ upheld: boolean, finalOutcomeId?: number }`.
- [ ] Calls Stellar contract `resolve_dispute`.
- [ ] If upheld: refunds bond to disputer via `wallet.service.ts`.
- [ ] If rejected: sends bond to treasury.
- [ ] Updates dispute status in DB.
- [ ] Sends notification to disputer.
- [ ] Integration test: upheld → bond refunded; rejected → bond slashed.

**Files:** `src/controllers/disputes.controller.ts`, `src/services/dispute.service.ts`

---

## Issue #24 — Disputes: list disputes

**Title:** `[Disputes] Implement list disputes endpoint`

**Tags:** `backend`, `disputes`, `feature`, `good first issue`

**Description:**
Fetch all disputes with optional filtering by status and market.

**Acceptance Criteria:**
- [ ] `GET /disputes` (admin only) — paginated list of all disputes.
- [ ] Filter by `status`: `pending`, `upheld`, `rejected`.
- [ ] Filter by `marketId`.
- [ ] `GET /disputes/:id` — fetch single dispute with full details.

**Files:** `src/routes/disputes.routes.ts`, `src/repositories/dispute.repository.ts`

---

## Issue #25 — Wallet: get balance

**Title:** `[Wallet] Implement get wallet balance endpoint`

**Tags:** `backend`, `wallet`, `feature`, `good first issue`

**Description:**
Return the authenticated user's on-chain and off-chain balance.

**Acceptance Criteria:**
- [ ] `GET /wallet/balance` — requires auth.
- [ ] Returns: `{ onChainBalance, offChainBalance, lockedBalance, currency }`.
- [ ] Fetches on-chain balance from Stellar via `stellar.service.ts`.
- [ ] Fetches off-chain/locked balance from DB via `wallet.service.ts`.
- [ ] Response cached per user for 10 seconds.

**Files:** `src/routes/wallet.routes.ts`, `src/controllers/wallet.controller.ts`, `src/services/wallet.service.ts`

---

## Issue #26 — Wallet: deposit & withdraw

**Title:** `[Wallet] Implement deposit and withdrawal endpoints`

**Tags:** `backend`, `wallet`, `feature`, `security`

**Description:**
Allow users to deposit collateral (USDC/XLM) into the platform and withdraw to their Stellar wallet.

**Acceptance Criteria:**
- [ ] `POST /wallet/deposit` — initiates an on-chain deposit transaction; listens for Stellar event to confirm.
- [ ] `POST /wallet/withdraw` — validates sufficient balance; submits withdrawal tx to Stellar; deducts from DB balance.
- [ ] Validates amounts > 0 and <= user balance (for withdraw).
- [ ] Returns `202 Accepted` with transaction ID for async operations.
- [ ] Sends notification on success/failure.
- [ ] Integration test: deposit → balance increases; withdraw → balance decreases.

**Files:** `src/controllers/wallet.controller.ts`, `src/services/wallet.service.ts`, `src/services/stellar.service.ts`

---

## Issue #27 — Wallet: transaction history

**Title:** `[Wallet] Implement wallet transaction history endpoint`

**Tags:** `backend`, `wallet`, `feature`, `good first issue`

**Description:**
Return paginated transaction history for the authenticated user.

**Acceptance Criteria:**
- [ ] `GET /wallet/transactions` — requires auth.
- [ ] Filter by `type`: `deposit`, `withdrawal`, `trade`, `fee`, `refund`, `winnings`.
- [ ] Supports `page`, `limit`, `from`, `to` date filters.
- [ ] Returns `{ data: Transaction[], total, page, limit }`.

**Files:** `src/routes/wallet.routes.ts`, `src/services/wallet.service.ts`

---

## Issue #28 — Treasury: collect protocol fees

**Title:** `[Treasury] Implement protocol fee collection endpoint`

**Tags:** `backend`, `treasury`, `admin`, `feature`

**Description:**
Admin triggers on-chain collection of accumulated protocol fees from a settled market to the treasury.

**Acceptance Criteria:**
- [ ] `POST /treasury/collect/:marketId` (admin only).
- [ ] Validates market is `resolved` or `cancelled`.
- [ ] Calls Stellar contract `collect_protocol_fees`.
- [ ] Records the collection in DB via `treasury.service.ts`.
- [ ] Returns `200` with amount collected.
- [ ] Returns `400` if fee pool is empty.

**Files:** `src/routes/treasury.routes.ts`, `src/controllers/treasury.controller.ts`, `src/services/treasury.service.ts`

---

## Issue #29 — Treasury: get treasury stats

**Title:** `[Treasury] Implement treasury stats endpoint`

**Tags:** `backend`, `treasury`, `feature`, `good first issue`

**Description:**
Return aggregated treasury metrics — total collected fees, balance, and per-market breakdown.

**Acceptance Criteria:**
- [ ] `GET /treasury/stats` (admin only).
- [ ] Returns: `{ totalCollected, pendingFees, balance, perMarket: [...] }`.
- [ ] `GET /treasury/history` — paginated fee collection history.

**Files:** `src/routes/treasury.routes.ts`, `src/controllers/treasury.controller.ts`

---

## Issue #30 — Notifications: send notification

**Title:** `[Notifications] Implement notification creation and delivery`

**Tags:** `backend`, `notifications`, `feature`

**Description:**
Internal service to create and deliver notifications to users (in-app + WebSocket push).

**Acceptance Criteria:**
- [ ] `notification.service.ts` exposes `sendNotification(userId, type, payload)`.
- [ ] Saves notification to DB via `notification.repository.ts`.
- [ ] Pushes real-time notification via WebSocket (`realtime.ts`) if user is connected.
- [ ] Notification types: `market_resolved`, `dispute_filed`, `dispute_resolved`, `trade_filled`, `winnings_available`, `refund_available`, `system`.
- [ ] Unit test: `sendNotification` → DB record created → WebSocket push attempted.

**Files:** `src/services/notification.service.ts`, `src/repositories/notification.repository.ts`, `src/websocket/realtime.ts`

---

## Issue #31 — Notifications: list & mark read

**Title:** `[Notifications] Implement list and mark-as-read notification endpoints`

**Tags:** `backend`, `notifications`, `feature`, `good first issue`

**Description:**
Fetch unread notifications for the authenticated user and mark them read.

**Acceptance Criteria:**
- [ ] `GET /notifications` — requires auth; returns paginated notifications, newest first.
- [ ] `PATCH /notifications/:id/read` — marks a single notification as read.
- [ ] `PATCH /notifications/read-all` — marks all unread notifications as read.
- [ ] Returns unread count in response headers: `X-Unread-Count`.
- [ ] Integration test in `src/routes/__tests__/notifications.routes.test.ts`.

**Files:** `src/routes/notifications.routes.ts`, `src/controllers/notifications.controller.ts`

---

## Issue #32 — Notifications: user preferences

**Title:** `[Notifications] Implement notification preference management`

**Tags:** `backend`, `notifications`, `feature`

**Description:**
Users can opt in/out of specific notification types.

**Acceptance Criteria:**
- [ ] `GET /notifications/preferences` — returns current preferences.
- [ ] `PATCH /notifications/preferences` — updates preferences (e.g. disable `trade_filled` emails).
- [ ] Preferences persisted in DB (migration: `add_notification_preferences`).
- [ ] `notification.service.ts` respects preferences before sending.

**Files:** `src/routes/notifications.routes.ts`, `src/services/notification.service.ts`

---

## Issue #33 — Leaderboard: global rankings

**Title:** `[Leaderboard] Implement global leaderboard endpoint`

**Tags:** `backend`, `leaderboard`, `feature`

**Description:**
Return ranked list of users by prediction accuracy, total profit, and win rate.

**Acceptance Criteria:**
- [ ] `GET /leaderboard` — public; returns top 100 users.
- [ ] Query params: `metric` (`profit`, `accuracy`, `wins`), `period` (`all`, `weekly`, `monthly`).
- [ ] Each entry: `{ rank, username, avatarUrl, totalProfit, accuracy, winCount, totalPredictions }`.
- [ ] Leaderboard cached in Redis, refreshed every 5 minutes.
- [ ] `leaderboard.service.ts` handles score computation.
- [ ] `leaderboard.repository.ts` handles DB reads.

**Files:** `src/routes/leaderboard.routes.ts`, `src/controllers/leaderboard.controller.ts`, `src/services/leaderboard.service.ts`, `src/repositories/leaderboard.repository.ts`

---

## Issue #34 — Leaderboard: user rank

**Title:** `[Leaderboard] Implement get authenticated user's current rank`

**Tags:** `backend`, `leaderboard`, `feature`, `good first issue`

**Description:**
Return the authenticated user's rank and stats without fetching the entire leaderboard.

**Acceptance Criteria:**
- [ ] `GET /leaderboard/me` — requires auth.
- [ ] Returns `{ rank, totalProfit, accuracy, winCount, percentile }`.
- [ ] Returns `null` rank if user has no predictions yet.

**Files:** `src/routes/leaderboard.routes.ts`, `src/services/leaderboard.service.ts`

---

## Issue #35 — Users: get profile

**Title:** `[Users] Implement get user profile endpoint`

**Tags:** `backend`, `users`, `feature`, `good first issue`

**Description:**
Return public profile data for any user, and full profile for the authenticated user.

**Acceptance Criteria:**
- [ ] `GET /users/:id` — public; returns `{ username, avatarUrl, joinedAt, totalPredictions, winRate }`.
- [ ] `GET /users/me` — requires auth; returns full profile including email, walletAddress, referralCode.
- [ ] Returns `404` if user not found.

**Files:** `src/routes/users.routes.ts`, `src/controllers/users.controller.ts`, `src/services/user.service.ts`, `src/repositories/user.repository.ts`

---

## Issue #36 — Users: update profile

**Title:** `[Users] Implement update user profile endpoint`

**Tags:** `backend`, `users`, `feature`, `good first issue`

**Description:**
Allow authenticated users to update their display name and avatar.

**Acceptance Criteria:**
- [ ] `PATCH /users/me` — requires auth.
- [ ] Allows updating: `username`, `avatarUrl`.
- [ ] Validates username uniqueness and length (3–30 chars, alphanumeric + underscore).
- [ ] Returns `200` with updated user object.
- [ ] Returns `409` on duplicate username.

**Files:** `src/routes/users.routes.ts`, `src/controllers/users.controller.ts`

---

## Issue #37 — Users: admin user management

**Title:** `[Users] Implement admin user management endpoints`

**Tags:** `backend`, `users`, `admin`, `feature`, `security`

**Description:**
Admin tools to list users, suspend accounts, and assign roles.

**Acceptance Criteria:**
- [ ] `GET /users` (admin only) — paginated user list with filters (`role`, `status`, `search`).
- [ ] `PATCH /users/:id/suspend` (admin only) — suspends a user account (invalidates all sessions).
- [ ] `PATCH /users/:id/role` (admin only) — updates user role (`user`, `oracle`, `admin`).
- [ ] Suspended users get `403` on any authenticated request.

**Files:** `src/routes/users.routes.ts`, `src/controllers/users.controller.ts`

---

## Issue #38 — Referrals: generate & track referral

**Title:** `[Referrals] Implement referral code generation and tracking`

**Tags:** `backend`, `referrals`, `feature`

**Description:**
Each user gets a unique referral code. When a new user registers with it, both users get rewarded.

**Acceptance Criteria:**
- [ ] Referral code generated at registration and stored on user record.
- [ ] `GET /referrals/code` — returns authenticated user's referral code and link.
- [ ] `POST /auth/register` accepts optional `referralCode`; validates it and links the relationship.
- [ ] On first trade by the referred user: reward both via `referral.service.ts`.
- [ ] `GET /referrals` — returns list of users referred with their status and rewards earned.

**Files:** `src/routes/referrals.routes.ts`, `src/controllers/referrals.controller.ts`, `src/services/referral.service.ts`

---

## Issue #39 — Achievements: award achievements

**Title:** `[Achievements] Implement achievement detection and awarding`

**Tags:** `backend`, `achievements`, `feature`

**Description:**
Award badges and achievements to users based on milestones (first trade, 10-win streak, high accuracy, etc.)

**Acceptance Criteria:**
- [ ] `achievement.service.ts` exposes `checkAndAward(userId, event)`.
- [ ] Called after every prediction settlement, trade, and referral conversion.
- [ ] Achievement types: `first_trade`, `first_win`, `streak_5`, `streak_10`, `accuracy_80`, `top_10_leaderboard`, `100_trades`.
- [ ] Each achievement awarded only once per user.
- [ ] Sends notification on new achievement.
- [ ] `GET /users/me/achievements` — returns all earned achievements.
- [ ] Unit test: trigger `first_trade` event → achievement awarded once → second trigger ignored.

**File:** `src/services/achievement.service.ts`

---

## Issue #40 — WebSocket: real-time price feed

**Title:** `[WebSocket] Implement real-time outcome price feed`

**Tags:** `backend`, `websocket`, `feature`

**Description:**
Push live outcome price updates to connected clients whenever a trade is made.

**Acceptance Criteria:**
- [ ] Client subscribes to a market: `{ type: 'subscribe', marketId }`.
- [ ] On every trade for that market, server pushes: `{ type: 'price_update', marketId, outcomeId, newPriceBps, volume }`.
- [ ] Client unsubscribes: `{ type: 'unsubscribe', marketId }`.
- [ ] Handles client disconnect gracefully (removes from subscription map).

**File:** `src/websocket/realtime.ts`

---

## Issue #41 — WebSocket: real-time notifications

**Title:** `[WebSocket] Implement real-time notification push over WebSocket`

**Tags:** `backend`, `websocket`, `notifications`, `feature`

**Description:**
Push notifications to the authenticated user's WebSocket connection in real time.

**Acceptance Criteria:**
- [ ] On connection, client authenticates with JWT: `{ type: 'auth', token }`.
- [ ] Authenticated connection is registered in user-socket map.
- [ ] `notification.service.ts` looks up user socket and pushes directly.
- [ ] On disconnect, user is removed from the map.
- [ ] Integration test: connect → trigger notification → message received on socket.

**File:** `src/websocket/realtime.ts`

---

## Issue #42 — Blockchain: submit signed transaction

**Title:** `[Blockchain] Implement user-signed transaction submission`

**Tags:** `backend`, `blockchain`, `feature`, `security`

**Description:**
Users sign Stellar transactions client-side; the backend submits them to the network.

**Acceptance Criteria:**
- [ ] `POST /trading/submit-tx` — accepts `{ signedXdr }`.
- [ ] Validates XDR is well-formed.
- [ ] Submits to Stellar network via `stellar.service.ts`.
- [ ] Returns `{ transactionHash, status }` on success.
- [ ] Returns `400` for malformed XDR; `502` for network errors.
- [ ] Unit test: valid XDR submitted → success response; invalid XDR → `400`.

**Files:** `src/services/stellar.service.ts`, `src/services/blockchain.service.ts`

---

## Issue #43 — Blockchain: event listener / sync

**Title:** `[Blockchain] Implement Stellar event listener for on-chain state sync`

**Tags:** `backend`, `blockchain`, `feature`

**Description:**
Listen for on-chain contract events (trades, resolutions, disputes) and sync state to the DB.

**Acceptance Criteria:**
- [ ] Background process polls Stellar for contract events on a configurable interval.
- [ ] Handles events: `shares_bought`, `shares_sold`, `market_finalized`, `outcome_disputed`, `position_redeemed`.
- [ ] On each event: update relevant DB records and trigger notifications.
- [ ] Idempotent — replaying an already-processed event has no effect.
- [ ] Errors are logged and retried (max 3 attempts).

**Files:** `src/services/blockchain.service.ts`, `src/services/stellar.service.ts`

---

## Issue #44 — Cron: market lifecycle automation

**Title:** `[Cron] Implement scheduled market lifecycle jobs`

**Tags:** `backend`, `cron`, `feature`

**Description:**
Background jobs that automate market state transitions on schedule.

**Acceptance Criteria:**
- [ ] **Close betting** — every minute: find markets where `bettingCloseTime` has passed and status is `open`; set status to `closed`.
- [ ] **Finalize resolution** — every minute: find markets in `reported` state where dispute window has passed; call `finalize_resolution` on-chain.
- [ ] **Settle predictions** — after resolution: trigger prediction settlement for resolved markets.
- [ ] **Expire notifications** — daily: clean up notifications older than 90 days.
- [ ] All jobs log start, completion, and any errors.
- [ ] Unit test in `tests/services/cron.service.test.ts`.

**File:** `src/services/cron.service.ts`

---

## Issue #45 — Repository: base repository pattern

**Title:** `[Repository] Implement base repository with common CRUD operations`

**Tags:** `backend`, `repository`, `feature`, `good first issue`

**Description:**
Generic base repository that all other repositories extend, providing common DB operations via Prisma.

**Acceptance Criteria:**
- [ ] `BaseRepository<T>` implements: `findById`, `findMany`, `create`, `update`, `delete`, `count`.
- [ ] All methods accept Prisma `where`, `select`, `orderBy`, and `include` options.
- [ ] Throws typed `RepositoryError` on DB failures (not raw Prisma errors).
- [ ] All repositories (`market`, `user`, `trade`, `prediction`, `dispute`, `share`, `notification`, `leaderboard`, `distribution`) extend `BaseRepository`.
- [ ] Unit test: `findById` with non-existent ID returns `null`.

**File:** `src/repositories/base.repository.ts`

---

## Issue #46 — Repository: distribution repository

**Title:** `[Repository] Implement distribution repository for winnings payouts`

**Tags:** `backend`, `repository`, `feature`

**Description:**
Track winnings distributions for resolved markets so payouts are auditable and idempotent.

**Acceptance Criteria:**
- [ ] `distribution.repository.ts` provides: `createDistribution`, `markPaid`, `findByMarket`, `findByUser`.
- [ ] Each distribution record: `userId`, `marketId`, `amount`, `status` (`pending`, `paid`, `failed`), `txHash`.
- [ ] `markPaid` is idempotent — calling twice has no effect.
- [ ] Integration test: create distribution → mark paid → verify status.

**File:** `src/repositories/distribution.repository.ts`

---

## Issue #47 — Metrics: Prometheus endpoint

**Title:** `[Metrics] Implement Prometheus metrics endpoint`

**Tags:** `backend`, `feature`

**Description:**
Expose application metrics for monitoring via Prometheus scraping.

**Acceptance Criteria:**
- [ ] `GET /metrics` — returns Prometheus-formatted metrics (no auth required from internal network).
- [ ] Tracks: request count by route + status, response time p50/p95/p99, active WebSocket connections, trade volume, DB query time.
- [ ] `metrics.middleware.ts` instruments every request automatically.
- [ ] `metrics.routes.ts` exposes the `/metrics` endpoint.

**Files:** `src/routes/metrics.routes.ts`, `src/middleware/metrics.middleware.ts`

---

## Issue #48 — Integration test suite

**Title:** `[Testing] Write full backend integration test suite`

**Tags:** `backend`, `testing`, `feature`

**Description:**
End-to-end integration tests covering all major API flows against a real test database.

**Acceptance Criteria:**
- [ ] **Auth flow**: register → login → refresh → logout.
- [ ] **Market flow**: create market → list → get → close → resolve.
- [ ] **Trading flow**: buy shares → check position → sell shares → check balance.
- [ ] **Dispute flow**: resolve market → dispute → admin upholds → bond refunded.
- [ ] **Prediction flow**: predict → market resolves → prediction settled → points awarded.
- [ ] **Notification flow**: action triggers notification → WebSocket delivers it.
- [ ] **Wallet flow**: deposit → buy → withdraw.
- [ ] **Leaderboard flow**: trades → predictions settled → leaderboard updated.
- [ ] All tests use a dedicated `boxmeout_test` database and clean up after themselves.
- [ ] All tests pass with `npm test`.

**Files:** `backend/tests/`
