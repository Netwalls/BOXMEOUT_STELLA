# Frontend Issues — `/frontend`

> 40 open issues for frontend contributors.
> Stack: Next.js 14 · TypeScript · Tailwind CSS · Zustand · Freighter Wallet
>
> **Labels guide**
> - `good first issue` — HTML/CSS/React basics sufficient
> - `intermediate` — requires React hooks + TypeScript knowledge
> - `advanced` — requires Stellar SDK, wallet integration, or complex state management
> - `frontend` — applies to all frontend issues
> - `admin` — admin-only pages/components
> - `testing` — test-only issues
> - `devops` — tooling, CI, Storybook
> - `a11y` — accessibility improvements

---

## Issue #1 — Set up Next.js 14 project with TypeScript

**Labels:** `good first issue` `frontend`

**Description**
Initialize the frontend project with all required tooling.

**What to implement**
- `npx create-next-app@latest` with TypeScript, Tailwind CSS, App Router, src/ directory
- Configure `tsconfig.json` with `strict: true`
- Add ESLint with `@typescript-eslint` rules
- Add Prettier
- Add path alias: `@/*` → `./src/*`

**Acceptance Criteria**
- [ ] `npm run build` succeeds on a fresh clone
- [ ] `npm run lint` passes on stub files
- [ ] `npm run dev` starts on port 3000
- [ ] TypeScript strict mode enabled

---

## Issue #2 — Implement `Header` component

**Labels:** `good first issue` `frontend`

**Description**
Implement `frontend/src/components/layout/Header.tsx`.

**What to render**
- Left: BOXMEOUT text logo linked to `/`
- Center: nav links — "Markets" → `/`, "Portfolio" → `/portfolio`
- Right: `WalletButton` component
- Network indicator badge: "TESTNET" (amber) or "MAINNET" (green) from `NEXT_PUBLIC_STELLAR_NETWORK` env

**Responsive behavior**
- Desktop: horizontal layout
- Mobile: hamburger menu; nav links in a dropdown drawer

**Acceptance Criteria**
- [ ] Renders correctly on 375px and 1280px viewports
- [ ] Active nav link is visually highlighted
- [ ] WalletButton shown on all breakpoints
- [ ] Network badge visible

---

## Issue #3 — Implement `WalletButton` component

**Labels:** `frontend` `intermediate`

**Description**
Implement `frontend/src/components/layout/WalletButton.tsx`.

**Disconnected state**
- Show "Connect Wallet" button
- On click: call `useWallet().connect()`
- Show loading spinner while `isConnecting === true`

**Connected state**
- Show truncated address: first 4 + "..." + last 4 chars (e.g. `GABC...WXYZ`)
- Show XLM balance next to address
- On click: open dropdown with [Copy Address] [View on Explorer] [Disconnect]

**Acceptance Criteria**
- [ ] Connect flow works with Freighter
- [ ] Dropdown closes on outside click or Escape key
- [ ] Copy address writes to clipboard and shows "Copied!" feedback

---

## Issue #4 — Implement `useWallet` hook

**Labels:** `frontend` `intermediate`

**Description**
Implement `frontend/src/hooks/useWallet.ts`.

**What to implement**
- On mount: read address from `localStorage.getItem("boxmeout_wallet_address")`; if found, fetch balance
- `connect()`: call `wallet.connectWallet()`, store returned address in localStorage, fetch balance
- `disconnect()`: clear localStorage key, reset state
- Expose: `address`, `balance`, `isConnected`, `isConnecting`, `error`, `connect`, `disconnect`

**Acceptance Criteria**
- [ ] Connection persists across page refreshes
- [ ] Disconnecting clears localStorage
- [ ] `isConnecting` is true only during the wallet connection flow
- [ ] Balance updates after connect

---

## Issue #5 — Implement `connectWallet()` in wallet.ts

**Labels:** `frontend` `intermediate`

**Description**
Implement `connectWallet()` in `frontend/src/services/wallet.ts`.

**What to implement**
- Check if `window.freighter` is available; if not, check `window.albedo`
- For Freighter: call `freighter.requestAccess()` then `freighter.getPublicKey()`
- For Albedo: call `albedo.publicKey({ token: "boxmeout" })`
- If neither wallet found, throw `WalletNotInstalledError` with a message linking to Freighter install page

**Acceptance Criteria**
- [ ] Returns G... address on success
- [ ] Throws `WalletNotInstalledError` if no wallet extension found
- [ ] Throws `WalletConnectionError` if user rejects the permission request

---

## Issue #6 — Implement `fetchMarkets()` in api.ts

**Labels:** `good first issue` `frontend`

**Description**
Implement `fetchMarkets()` in `frontend/src/services/api.ts`.

**What to implement**
- Build query string from filters and pagination params
- Call `fetch(`${API_BASE}/api/markets?${queryString}`)`
- Parse JSON response as `MarketListResponse`
- Throw `NetworkError` on non-200 status

**Acceptance Criteria**
- [ ] Returns correct typed response
- [ ] Filters correctly appended as query params
- [ ] Throws on network error or non-200 response

---

## Issue #7 — Implement `useMarkets` hook

**Labels:** `frontend` `intermediate`

**Description**
Implement `frontend/src/hooks/useMarkets.ts`.

**What to implement**
- Call `fetchMarkets(filters)` on mount
- Set up `setInterval` to refetch every 30 seconds
- On refetch: update markets in background (no loading flash — keep stale data visible)
- `refetch()`: manually trigger an immediate fetch and reset the 30s timer
- Clean up interval on unmount

**Acceptance Criteria**
- [ ] Markets load on mount
- [ ] Auto-refresh every 30s without layout flash
- [ ] Interval cleared on component unmount (no memory leak)
- [ ] Error state set on failed fetch; previous data retained

---

## Issue #8 — Implement `HomePage`

**Labels:** `frontend` `intermediate`

**Description**
Implement `frontend/src/app/page.tsx`.

**What to render**
- Page title and subtitle
- Filter bar: weight class dropdown, status tabs (All / Open / Resolved), sort control
- Market grid: `MarketCard` for each market
- Loading: skeleton grid (3x4) while `isLoading === true` and no data
- Empty state: "No markets found. Try changing your filters." when markets array is empty
- Pagination: prev/next buttons when total > limit
- Filter state synced to URL query params

**Acceptance Criteria**
- [ ] Filters update market list without page reload
- [ ] Filter state survives browser back/forward navigation
- [ ] Empty state shown correctly
- [ ] Loading skeleton shown on initial load

---

## Issue #9 — Implement `MarketCard` component

**Labels:** `good first issue` `frontend`

**Description**
Implement `frontend/src/components/market/MarketCard.tsx`.

**What to render**
- Fighter A vs Fighter B heading
- Weight class badge; title fight crown icon if `title_fight === true`
- `MarketStatusBadge`
- `MarketOddsBar` (pool proportions)
- `CountdownTimer`
- Total pooled XLM (format: "12,400 XLM")
- Entire card wrapped in `<Link href={/markets/${market.market_id}}>`

**Acceptance Criteria**
- [ ] Clicking card navigates to correct market detail page
- [ ] All data points rendered
- [ ] Responsive: card readable on 375px viewport

---

## Issue #10 — Implement `MarketOddsBar` component

**Labels:** `frontend` `intermediate`

**Description**
Implement `frontend/src/components/market/MarketOddsBar.tsx`.

**What to render**
- Three-segment horizontal bar: [Fighter A][Draw][Fighter B]
- Segment widths proportional to pool sizes
- If total_pool == 0: render equal thirds (33/33/33)
- Show percentage label inside each segment (hide if segment < 10% wide)
- Animate width changes with `transition: width 0.4s ease`

**Acceptance Criteria**
- [ ] Correct proportions for known pool values
- [ ] Renders equal thirds for empty pools (no divide-by-zero)
- [ ] Animation smooth on odds change
- [ ] BigInt used for pool math (no floating point)

---

## Issue #11 — Implement `MarketStatusBadge` component

**Labels:** `good first issue` `frontend`

**Description**
Implement `frontend/src/components/market/MarketStatusBadge.tsx`.

**Color mapping**
- `open` → green
- `locked` → amber
- `resolved` → blue
- `cancelled` → gray
- `disputed` → red

**Acceptance Criteria**
- [ ] Correct color for each status
- [ ] Text is capitalized ("Open", "Locked", etc.)
- [ ] Pill/badge shape with readable contrast

---

## Issue #12 — Implement `CountdownTimer` component

**Labels:** `good first issue` `frontend`

**Description**
Implement `frontend/src/components/ui/CountdownTimer.tsx`.

Uses `useMarketCountdown` hook internally.

**States**
- Counting down: "Starts in 2h 14m 32s"
- At scheduled_at: pulsing red "LIVE" badge
- After resolution window: gray "ENDED"

**Acceptance Criteria**
- [ ] Updates every second while counting down
- [ ] Shows LIVE state correctly
- [ ] Cleans up timer on unmount

---

## Issue #13 — Implement `useMarketCountdown` hook

**Labels:** `good first issue` `frontend`

**Description**
Implement `frontend/src/hooks/useMarketCountdown.ts`.

**What to implement**
- On mount: compute initial countdown string
- Set up `setInterval(fn, 1000)` to update every second
- Format: `Xh Ym Zs` — omit hours if 0, omit minutes if 0 and hours are 0
- Return "LIVE" when `Date.now() >= scheduled_at_ms && Date.now() < scheduled_at_ms + resolution_window_ms`
- Return "ENDED" after resolution window (use `scheduled_at + 24h` as a safe default)
- Return cleanup function in `useEffect`

**Acceptance Criteria**
- [ ] Accurate countdown with correct format
- [ ] State transitions to LIVE and ENDED at correct times
- [ ] No memory leak — interval cleaned up on unmount

---

## Issue #14 — Implement `fetchMarketById()` in api.ts

**Labels:** `good first issue` `frontend`

**Description**
Implement `fetchMarketById()` in `frontend/src/services/api.ts`.

**What to implement**
- Call `fetch(`${API_BASE}/api/markets/${market_id}`)`
- Parse JSON as `Market`
- Throw `NotFoundError` on 404
- Throw `NetworkError` on other non-200 responses

**Acceptance Criteria**
- [ ] Returns typed Market on success
- [ ] Throws NotFoundError on 404
- [ ] Handles network failures gracefully

---

## Issue #15 — Implement `useMarket` hook

**Labels:** `frontend` `intermediate`

**Description**
Implement `frontend/src/hooks/useMarket.ts`.

**What to implement**
- Fetch market on mount via `fetchMarketById(market_id)`
- If `market.status === 'open'`: poll every 10 seconds for updated odds
- If status changes to locked/resolved/cancelled: stop polling
- Return `{ market, isLoading, error }`

**Acceptance Criteria**
- [ ] Live odds update every 10s while market is open
- [ ] Polling stops automatically when market is no longer open
- [ ] 404 sets error state (does not crash page)

---

## Issue #16 — Implement `MarketDetailPage`

**Labels:** `frontend` `advanced`

**Description**
Implement `frontend/src/app/markets/[market_id]/page.tsx`.

**Page sections**
1. Fight header: fighter names, weight class badge, title fight indicator, venue
2. `CountdownTimer` + `MarketStatusBadge`
3. `MarketOddsBar` — updates live
4. Pool sizes: "12,400 XLM on Fury | 800 XLM Draw | 5,200 XLM on Usyk"
5. `BetPanel` — right column on desktop, below pools on mobile
6. Recent bets table: last 20 bets, newest first (bettor address truncated, side, amount, time)
7. Oracle info section: visible after resolution — oracle address, tx hash link, outcome

**Acceptance Criteria**
- [ ] All sections render with correct data
- [ ] 404 message shown for unknown market_id
- [ ] Two-column layout on desktop; single column on mobile

---

## Issue #17 — Implement `BetPanel` component

**Labels:** `frontend` `advanced`

**Description**
Implement `frontend/src/components/bet/BetPanel.tsx`.

**What to render**
- Three toggle buttons: [Fighter A] [Draw] [Fighter B] — selected state highlighted
- Amount input in XLM with min/max hints
- Estimated payout preview (updates live as inputs change)
- Fee display: "Platform fee: 2%"
- Submit button — disabled when: no wallet connected, amount invalid, isSubmitting
- "Connect Wallet to Bet" prompt when wallet not connected
- "Betting is closed" message when market is not Open
- `TxStatusToast` after submission

**Acceptance Criteria**
- [ ] Full bet flow works end-to-end on testnet
- [ ] Payout preview updates with each keystroke
- [ ] Submit button correctly disabled in all invalid states

---

## Issue #18 — Implement `useBet` hook

**Labels:** `frontend` `advanced`

**Description**
Implement `frontend/src/hooks/useBet.ts`.

**What to implement**
- `side` state: null | 'fighter_a' | 'fighter_b' | 'draw'
- `amount` state: string (raw input value)
- `estimatedPayout`: recompute whenever side or amount changes using the parimutuel formula locally (do not call API for every keystroke)
- `submitBet()`: show confirmation modal → on confirm → call `wallet.submitBet()` → update `txStatus`
- `reset()`: clear all form state after successful bet

**Acceptance Criteria**
- [ ] Estimated payout recalculates on input change without API call
- [ ] `txStatus` transitions: idle → pending → success/error
- [ ] Reset clears form correctly

---

## Issue #19 — Implement `BetConfirmModal` component

**Labels:** `frontend` `intermediate`

**Description**
Implement `frontend/src/components/bet/BetConfirmModal.tsx`.

**What to render**
- Overlay backdrop (semi-transparent)
- Modal card with:
  - "Confirm your bet" title
  - Fighter chosen (translate side to fighter name)
  - Bet amount in XLM
  - Platform fee in XLM ("Fee: 0.24 XLM")
  - Estimated net payout in XLM
  - "Confirm Bet" button → calls `onConfirm()`
  - "Cancel" button → calls `onCancel()`

**Behavior**
- Close on backdrop click
- Close on Escape key
- Rendered as a React portal (`document.body`)

**Acceptance Criteria**
- [ ] Closes on backdrop click and Escape key
- [ ] Correct values displayed for all fields
- [ ] Accessible: focus trapped inside modal while open

---

## Issue #20 — Implement `submitBet()` in wallet.ts

**Labels:** `frontend` `advanced`

**Description**
Implement `submitBet()` in `frontend/src/services/wallet.ts`.

**What to implement**
- Convert `amount_xlm` to stroops using `xlmToStroops()`
- Build XDR for `InvokeContractHostFunction` calling `place_bet` on the market contract
- Pass XDR to Freighter for signing: `freighter.signTransaction(xdr, { network: STELLAR_NETWORK })`
- Submit signed XDR to Stellar network (via Horizon or backend proxy at `POST /api/tx/submit`)
- Poll for tx confirmation (max 30s)
- Return tx hash on SUCCESS; throw on FAILED

**Acceptance Criteria**
- [ ] Bet successfully placed and confirmed on Stellar testnet
- [ ] Throws `WalletSignError` if user rejects signing
- [ ] Throws `TxSubmissionError` on network rejection

---

## Issue #21 — Implement `TxStatusToast` component

**Labels:** `frontend` `intermediate`

**Description**
Implement `frontend/src/components/ui/TxStatusToast.tsx`.

**States**
- `idle`: render nothing
- `pending`: spinner + "Transaction pending..."
- `success`: green check + "Bet placed!" + Stellar Explorer link
- `error`: red X + error message + "Try again" suggestion

**Behavior**
- Fixed position: bottom-right of screen
- Auto-dismiss after 6 seconds on success
- Stays visible until dismissed on error
- Dismiss button (×) always visible

**Explorer link**
- Testnet: `https://stellar.expert/explorer/testnet/tx/{hash}`
- Mainnet: `https://stellar.expert/explorer/public/tx/{hash}`

**Acceptance Criteria**
- [ ] All four states render correctly
- [ ] Auto-dismiss timer clears on unmount (no setState on unmounted component)
- [ ] Explorer link opens in new tab

---

## Issue #22 — Implement `PortfolioPage`

**Labels:** `frontend` `intermediate`

**Description**
Implement `frontend/src/app/portfolio/page.tsx`.

**Page sections**
1. Stats row: Total Staked / Total Won / Total Lost / Win Rate % (in XLM)
2. "Pending Claims" section — golden highlight; Claim buttons
3. "Active Bets" — bets in open/locked markets
4. "Bet History" — `BetHistoryTable` with all past bets

**No wallet state**
- Full-page prompt: "Connect your wallet to view your portfolio"
- Connect button centered on page

**Empty portfolio**
- "No bets yet — find a fight to bet on" with a link to `/`

**Acceptance Criteria**
- [ ] Correct connect prompt when wallet not connected
- [ ] Correct empty state when portfolio is empty
- [ ] Claim buttons work and refresh portfolio after confirmation

---

## Issue #23 — Implement `usePortfolio` hook

**Labels:** `frontend` `advanced`

**Description**
Implement `frontend/src/hooks/usePortfolio.ts`.

**What to implement**
- Get address from `useWallet()`
- Fetch portfolio via `fetchPortfolio(address)` on mount and when address changes
- `claimWinnings(market_contract_address)`: call `wallet.submitClaim()`, then refetch portfolio
- `claimRefund(market_contract_address)`: call `wallet.submitRefund()`, then refetch portfolio
- Track claim tx status via `claimTxStatus`

**Acceptance Criteria**
- [ ] Portfolio null when wallet not connected
- [ ] Portfolio refreshes after successful claim
- [ ] claimTxStatus reflects pending/success/error

---

## Issue #24 — Implement `BetHistoryTable` component

**Labels:** `frontend` `intermediate`

**Description**
Implement `frontend/src/components/bet/BetHistoryTable.tsx`.

**Columns:** Market | Side | Amount (XLM) | Status | Payout (XLM) | Action

**Action column rules**
- Winning + unclaimed → "Claim" button (calls `onClaim`)
- Cancelled market + unclaimed → "Refund" button (calls `onRefund`)
- Already claimed → payout amount in green text
- Lost bet → "—" (no action)
- Market not yet resolved → "Pending" badge

**Acceptance Criteria**
- [ ] Correct action for each bet state
- [ ] Empty state shows "No bets yet" message
- [ ] Responsive: scrollable horizontally on mobile

---

## Issue #25 — Implement `fetchPortfolio()` in api.ts

**Labels:** `good first issue` `frontend`

**Description**
Implement `fetchPortfolio()` in `frontend/src/services/api.ts`.

**What to implement**
- Call `fetch(`${API_BASE}/api/portfolio/${address}`)`
- Parse JSON as `Portfolio`
- Throw `NetworkError` on non-200

**Acceptance Criteria**
- [ ] Returns typed Portfolio
- [ ] Handles network errors with informative message

---

## Issue #26 — Implement `submitClaim()` in wallet.ts

**Labels:** `frontend` `advanced`

**Description**
Implement `submitClaim()` in `frontend/src/services/wallet.ts`.

**What to implement**
- Build XDR for `InvokeContractHostFunction` calling `claim_winnings` on the market contract
- Use connected wallet address as the `bettor` argument
- Sign and submit via Freighter (same flow as `submitBet`)
- Return tx hash on confirmation

**Acceptance Criteria**
- [ ] Payout received in wallet after confirmation on testnet
- [ ] Throws on user rejection or network failure

---

## Issue #27 — Implement `submitRefund()` in wallet.ts

**Labels:** `frontend` `advanced`

**Description**
Implement `submitRefund()` in `frontend/src/services/wallet.ts`.

**What to implement**
- Build XDR for `InvokeContractHostFunction` calling `claim_refund` on the market contract
- Sign and submit via Freighter
- Return tx hash on confirmation

**Acceptance Criteria**
- [ ] Full stake refunded to wallet after confirmation
- [ ] Throws clearly on failure

---

## Issue #28 — Implement `CreateMarketPage` (admin)

**Labels:** `frontend` `advanced` `admin`

**Description**
Implement `frontend/src/app/create/page.tsx`.

**Form fields**
- Match ID, Fighter A, Fighter B, Weight Class (select), Venue, Title Fight (checkbox)
- Scheduled At (datetime-local input)
- Min Bet (XLM), Max Bet (XLM), Fee % (0–10), Lock Before Fight (minutes)

**Submit flow**
1. Validate all fields
2. Convert XLM values to stroops
3. Build `create_market` contract invocation
4. Sign + submit via `wallet.ts`
5. Show TxStatusToast
6. Redirect to `/markets/[new_market_id]` on success

**Access guard**
- Wallet not connected → show connect prompt
- Connected address not in `NEXT_PUBLIC_ADMIN_ADDRESSES` → show "Access denied"

**Acceptance Criteria**
- [ ] Form validation prevents submission of invalid data
- [ ] Admin guard works correctly
- [ ] Successful market creation redirects to detail page

---

## Issue #29 — Implement wallet connect prompt for unauthenticated actions

**Labels:** `good first issue` `frontend`

**Description**
Create a reusable `ConnectPrompt` component shown whenever a user tries to perform a wallet-required action without connecting.

**What to render**
- Message: "Connect your Freighter wallet to place bets"
- "Connect Wallet" button — triggers `useWallet().connect()`
- Link to Freighter install page: "Don't have Freighter? Get it here →"

**Where to use it**
- Inside `BetPanel` when wallet not connected
- On `PortfolioPage` when wallet not connected

**Acceptance Criteria**
- [ ] Component is reusable (accepts optional `message` prop)
- [ ] Clicking connect triggers wallet flow
- [ ] Freighter install link opens in new tab

---

## Issue #30 — Add loading skeleton components

**Labels:** `good first issue` `frontend`

**Description**
Create skeleton placeholder components for the loading state.

**Skeletons to create**
- `MarketCardSkeleton`: same dimensions as MarketCard, pulsing gray blocks
- `BetPanelSkeleton`: placeholder for BetPanel content
- `StatsRowSkeleton`: placeholder for portfolio stats row

**Implementation note**
Use Tailwind's `animate-pulse` class on gray rounded blocks.
Do NOT use a third-party skeleton library.

**Acceptance Criteria**
- [ ] Skeletons match dimensions of their real components
- [ ] Home page shows `MarketCardSkeleton` grid on initial load
- [ ] No layout shift when real content loads

---

## Issue #31 — Implement weight class filter on Home page

**Labels:** `frontend` `intermediate`

**Description**
Add a weight class filter dropdown to the Home page market list.

**Weight classes to include**
Heavyweight, Light Heavyweight, Super Middleweight, Middleweight, Super Welterweight, Welterweight, Super Lightweight, Lightweight, Super Featherweight, Featherweight, Super Bantamweight, Bantamweight, Super Flyweight, Flyweight, Minimumweight

**What to implement**
- `<select>` dropdown with "All Weight Classes" as default
- On change: update filter state → triggers new `fetchMarkets()` call
- Selected filter persisted in URL query param `?weight_class=Heavyweight`

**Acceptance Criteria**
- [ ] Selecting a weight class filters the market list
- [ ] Refreshing the page restores the filter from URL
- [ ] "All Weight Classes" shows unfiltered list

---

## Issue #32 — Add Testnet / Mainnet network indicator

**Labels:** `frontend` `intermediate`

**Description**
Display a clear network indicator and warn users when on mainnet.

**What to implement**
- Read `NEXT_PUBLIC_STELLAR_NETWORK` env var
- Show badge in Header: "TESTNET" (amber) or "MAINNET" (green)
- On mainnet: show a dismissable banner at top of page: "You are betting with real XLM on mainnet"
- Store dismiss state in `sessionStorage` (reappears on new session)

**Acceptance Criteria**
- [ ] Testnet badge shown in development
- [ ] Mainnet banner appears and can be dismissed
- [ ] Banner reappears after closing and reopening the browser

---

## Issue #33 — Implement error boundary for market detail page

**Labels:** `frontend` `intermediate`

**Description**
Add a React error boundary around the `MarketDetailPage` content.

**What to implement**
- Create `frontend/src/components/ui/ErrorBoundary.tsx` as a class component
- Wrap main content of `MarketDetailPage` with it
- Fallback UI: "Something went wrong loading this market." with a "Try again" button that calls `window.location.reload()`

**Acceptance Criteria**
- [ ] App does not crash on unexpected render error
- [ ] Fallback UI shown with retry button
- [ ] Error logged to console (or error tracking service)

---

## Issue #34 — Implement responsive layout for mobile

**Labels:** `frontend` `intermediate`

**Description**
Ensure all pages are fully usable on a 375px viewport (iPhone SE size).

**Pages to verify and fix**
- Home page: market grid becomes single column
- Market Detail: BetPanel moves below odds bar; recent bets table scrolls horizontally
- Portfolio: stats row stacks vertically; BetHistoryTable scrolls horizontally
- Header: nav collapses to hamburger menu

**Acceptance Criteria**
- [ ] No horizontal scroll on any page at 375px
- [ ] All interactive elements reachable and tappable (min 44x44px touch targets)
- [ ] Text readable (min 14px)

---

## Issue #35 — Add XLM / stroops conversion utilities

**Labels:** `good first issue` `frontend`

**Description**
Implement `xlmToStroops()` and `stroopsToXlm()` in `frontend/src/services/wallet.ts`.

**What to implement**
```typescript
// 1 XLM = 10_000_000 stroops
// Must use integer arithmetic — no floating point
xlmToStroops(xlm: number): bigint
stroopsToXlm(stroops: bigint | string): number
```

**Acceptance Criteria**
- [ ] `xlmToStroops(1)` returns `10000000n`
- [ ] `xlmToStroops(0.0000001)` returns `1n`
- [ ] `stroopsToXlm(10000000n)` returns `1`
- [ ] `stroopsToXlm("123456789")` returns `12.3456789`
- [ ] Unit tests for edge cases (very small amounts, very large amounts)

---

## Issue #36 — Add Stellar Explorer deep links

**Labels:** `good first issue` `frontend`

**Description**
Create a `stellarExplorerUrl()` utility and use it throughout the app.

**What to implement**
```typescript
// Returns the correct explorer URL based on NEXT_PUBLIC_STELLAR_NETWORK
function stellarExplorerUrl(type: 'tx' | 'account' | 'contract', id: string): string
```

**Where to use**
- `TxStatusToast`: link on tx hash
- Market detail page: oracle address link, resolution tx link
- Portfolio page: tx hash links in bet history

**Acceptance Criteria**
- [ ] Testnet links point to `stellar.expert/explorer/testnet/`
- [ ] Mainnet links point to `stellar.expert/explorer/public/`
- [ ] All explorer links open in new tab with `rel="noopener noreferrer"`

---

## Issue #37 — Write unit tests for `useMarkets` and `useMarket` hooks

**Labels:** `frontend` `testing` `intermediate`

**Description**
Write unit tests for both hooks using `@testing-library/react` and `msw` (Mock Service Worker).

**Test cases for `useMarkets`**
- [ ] Initial loading state is true
- [ ] Markets populated after successful fetch
- [ ] Error state set on failed fetch
- [ ] `refetch()` triggers a new fetch

**Test cases for `useMarket`**
- [ ] Loading state transitions correctly
- [ ] Polling starts for open market
- [ ] Polling stops when market becomes locked

**Acceptance Criteria**
- [ ] Tests pass with mocked API (no real backend needed)
- [ ] No real timers (use `jest.useFakeTimers()`)

---

## Issue #38 — Write E2E test for bet placement flow

**Labels:** `frontend` `testing` `advanced`

**Description**
Write a Playwright end-to-end test covering the complete bet placement flow.

**Flow to test**
1. Navigate to home page — verify market list loads
2. Click a market card — verify detail page loads
3. Click "Connect Wallet" — mock Freighter connection
4. Select Fighter A in BetPanel
5. Enter 10 XLM
6. Verify estimated payout appears
7. Click "Place Bet" — verify confirm modal opens
8. Click "Confirm Bet" — mock Stellar tx submission
9. Verify `TxStatusToast` shows success with tx hash

**Acceptance Criteria**
- [ ] E2E test passes against a running dev environment
- [ ] Freighter wallet mocked (no real browser extension required)
- [ ] Tx submission mocked (no real Stellar network required)

---

## Issue #39 — Implement Zustand store for global app state

**Labels:** `frontend` `intermediate`

**Description**
Implement `frontend/src/store/index.ts` — the stub currently has a `TODO` body.

**What to implement**
- Initial state: `walletAddress: null`, `walletBalance: null`, `isConnecting: false`, `network: "testnet"`, `lastTxStatus: { hash: null, status: "idle", error: null }`
- `setWallet(address, balance)`: update wallet state
- `clearWallet()`: reset wallet state to null
- `setNetwork(network)`: update network
- `setTxStatus(status)`: update lastTxStatus

**Acceptance Criteria**
- [ ] Store accessible across all components without prop drilling
- [ ] State persists within a session (not to localStorage — wallet hook handles that)
- [ ] All actions produce correct state

---

## Issue #40 — Set up Storybook for UI components

**Labels:** `frontend` `devops` `intermediate`

**Description**
Set up Storybook 8 and add stories for the core UI components.

**What to implement**
- `npx storybook@latest init` in the frontend directory
- Add stories for:
  - `MarketCard` (with open, locked, resolved, cancelled variants)
  - `MarketOddsBar` (equal pools, dominant one side, empty pools)
  - `MarketStatusBadge` (all 5 statuses)
  - `CountdownTimer` (counting down, LIVE, ENDED)
  - `TxStatusToast` (all 4 states)
  - `BetPanel` (wallet connected, wallet disconnected, market locked)

**Acceptance Criteria**
- [ ] `npm run storybook` launches Storybook at port 6006
- [ ] All listed stories render without errors
- [ ] Stories work without a backend connection (all data hardcoded in story args)
