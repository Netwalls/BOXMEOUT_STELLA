/**
 * E2E: Core user flows (Issue #803)
 *
 * Tests run against a mock API — no real blockchain calls.
 *
 * Flows covered:
 *  1. Home page → market list → click market → see detail
 *  2. Portfolio page shows wallet connect prompt when not connected
 *  3. Market detail shows "Connect Wallet" in BetForm when not connected
 *  4. Filter by "Open" status shows only open markets
 */

import { test, expect, Page } from '@playwright/test';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const OPEN_MARKET = {
  market_id: 'mkt-open-1',
  match_id: 'match-open-1',
  fighter_a: 'Canelo Alvarez',
  fighter_b: 'Gennady Golovkin',
  weight_class: 'Super Middleweight',
  title_fight: true,
  venue: 'T-Mobile Arena',
  scheduled_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  status: 'open',
  outcome: null,
  pool_a: '500000000',
  pool_b: '300000000',
  pool_draw: '200000000',
  total_pool: '1000000000',
  odds_a: 5000,
  odds_b: 3000,
  odds_draw: 2000,
  fee_bps: 200,
};

const RESOLVED_MARKET = {
  ...OPEN_MARKET,
  market_id: 'mkt-resolved-1',
  match_id: 'match-resolved-1',
  fighter_a: 'Anthony Joshua',
  fighter_b: 'Tyson Fury',
  weight_class: 'Heavyweight',
  status: 'resolved',
  outcome: 'fighter_a',
  scheduled_at: new Date(Date.now() - 86_400_000).toISOString(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function mockApiRoutes(page: Page, markets = [OPEN_MARKET, RESOLVED_MARKET]) {
  // GET /api/markets (with optional status filter)
  await page.route('**/api/markets*', (route) => {
    const url = new URL(route.request().url());
    const statusFilter = url.searchParams.get('status');
    const filtered = statusFilter
      ? markets.filter((m) => m.status === statusFilter)
      : markets;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ markets: filtered, total: filtered.length, page: 1, limit: 20 }),
    });
  });

  // GET /api/markets/:id
  await page.route(`**/api/markets/${OPEN_MARKET.market_id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OPEN_MARKET),
    }),
  );

  await page.route(`**/api/markets/${OPEN_MARKET.market_id}/bets`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Core user flows', () => {
  test('1. Home page → market list → click market → see detail', async ({ page }) => {
    await mockApiRoutes(page);

    // Navigate to home
    await page.goto('/');

    // Market list renders both fighters
    await expect(page.getByText('Canelo Alvarez')).toBeVisible();
    await expect(page.getByText('Gennady Golovkin')).toBeVisible();

    // Click the market card link
    await page.getByRole('link', { name: /Canelo Alvarez/i }).first().click();

    // Should navigate to market detail
    await page.waitForURL(`**/markets/${OPEN_MARKET.market_id}`);

    // Detail page shows fighter names
    await expect(page.getByText('Canelo Alvarez')).toBeVisible();
    await expect(page.getByText('Gennady Golovkin')).toBeVisible();
  });

  test('2. Portfolio page shows wallet connect prompt when not connected', async ({ page }) => {
    // No Freighter mock → wallet not connected
    await page.goto('/portfolio');

    // Should show a connect wallet prompt
    await expect(page.getByText(/connect/i)).toBeVisible();
  });

  test('3. Market detail shows "Connect Wallet" in BetForm when not connected', async ({ page }) => {
    await mockApiRoutes(page);

    // Navigate directly to market detail without connecting wallet
    await page.goto(`/markets/${OPEN_MARKET.market_id}`);

    // BetPanel renders ConnectPrompt when wallet is not connected
    await expect(page.getByText(/connect/i)).toBeVisible();

    // The "Place Bet" button should NOT be visible
    await expect(page.getByRole('button', { name: /place bet/i })).not.toBeVisible();
  });

  test('4. Filter by "Open" status shows only open markets', async ({ page }) => {
    await mockApiRoutes(page);

    await page.goto('/');

    // Both markets visible initially
    await expect(page.getByText('Canelo Alvarez')).toBeVisible();
    await expect(page.getByText('Anthony Joshua')).toBeVisible();

    // Click the "Open" status filter button
    await page.getByRole('button', { name: 'Open' }).click();

    // Only the open market should be visible
    await expect(page.getByText('Canelo Alvarez')).toBeVisible();
    await expect(page.getByText('Anthony Joshua')).not.toBeVisible();
  });
});
