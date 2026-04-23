/**
 * E2E: Full bet placement flow
 *
 * Mocks:
 *   - GET /api/markets          → returns a single open market
 *   - GET /api/markets/:id      → returns the same market
 *   - window.freighter          → simulates Freighter extension
 *   - POST /api/tx (or Horizon) → mocked via route interception
 */

import { test, expect, Page } from '@playwright/test';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_MARKET = {
  market_id: 'mkt-001',
  match_id: 'match-001',
  fighter_a: 'Canelo Alvarez',
  fighter_b: 'Gennady Golovkin',
  weight_class: 'Super-Middleweight',
  title_fight: true,
  venue: 'T-Mobile Arena',
  scheduled_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // 3h from now
  status: 'open',
  outcome: null,
  pool_a: '500000000',   // 50 XLM
  pool_b: '300000000',   // 30 XLM
  pool_draw: '200000000', // 20 XLM
  total_pool: '1000000000',
  odds_a: 5000,
  odds_b: 3000,
  odds_draw: 2000,
  fee_bps: 200,
};

const MOCK_TX_HASH = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1';
const MOCK_ADDRESS = 'GABC1234WXYZ5678GABC1234WXYZ5678GABC1234WXYZ5678GABC1234WXYZ';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function mockApiRoutes(page: Page) {
  await page.route('**/api/markets', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ markets: [MOCK_MARKET], total: 1, page: 1, limit: 20 }),
    }),
  );

  await page.route(`**/api/markets/${MOCK_MARKET.market_id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_MARKET),
    }),
  );

  // Mock any Stellar/Horizon tx submission
  await page.route('**/transactions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hash: MOCK_TX_HASH, successful: true }),
    }),
  );
}

async function mockFreighter(page: Page) {
  await page.addInitScript((address) => {
    (window as any).freighter = {
      isConnected: () => Promise.resolve(true),
      getPublicKey: () => Promise.resolve(address),
      signTransaction: (_xdr: string) => Promise.resolve('SIGNED_XDR_PLACEHOLDER'),
      getNetwork: () => Promise.resolve('TESTNET'),
    };
  }, MOCK_ADDRESS);
}

// ── Test ──────────────────────────────────────────────────────────────────────

test('complete bet placement flow', async ({ page }) => {
  await mockApiRoutes(page);
  await mockFreighter(page);

  // 1. Navigate to home — verify market list loads
  await page.goto('/');
  await expect(page.getByText('Canelo Alvarez')).toBeVisible();
  await expect(page.getByText('Gennady Golovkin')).toBeVisible();

  // 2. Click market card — verify detail page loads
  await page.getByRole('link', { name: /Canelo Alvarez/i }).first().click();
  await page.waitForURL(`**/markets/${MOCK_MARKET.market_id}`);
  await expect(page.getByText('Canelo Alvarez')).toBeVisible();
  await expect(page.getByText('Gennady Golovkin')).toBeVisible();

  // 3. Connect wallet — mock Freighter connection
  await page.getByRole('button', { name: /connect wallet/i }).first().click();
  // Wait for address to appear (truncated: first4...last4)
  await expect(page.getByText(/GABC.*WXYZ/i)).toBeVisible({ timeout: 5000 });

  // 4. Select Fighter A in BetPanel
  await page.getByRole('button', { name: /Canelo Alvarez/i }).click();

  // 5. Enter 10 XLM
  await page.getByPlaceholder('0.00').fill('10');

  // 6. Verify estimated payout appears
  await expect(page.getByText(/Est\. payout/i)).toBeVisible();
  await expect(page.getByText(/XLM/)).toBeVisible();

  // 7. Click "Place Bet" — verify confirm modal opens
  await page.getByRole('button', { name: /place bet/i }).click();
  await expect(page.getByRole('heading', { name: /confirm bet/i })).toBeVisible();
  await expect(page.getByText('Canelo Alvarez')).toBeVisible();
  await expect(page.getByText('10 XLM')).toBeVisible();

  // 8. Click "Confirm Bet" — mock Stellar tx submission
  await page.getByRole('button', { name: /confirm bet/i }).click();

  // 9. Verify TxStatusToast shows success with tx hash
  await expect(page.getByText(/bet placed/i)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(MOCK_TX_HASH.slice(0, 12))).toBeVisible();
});
