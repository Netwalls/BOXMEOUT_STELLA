import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 3000;
const API_PORT = 3001;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/mock-api.mjs",
      url: `http://localhost:${API_PORT}/api/markets`,
      env: { PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      // Always a fresh build: NEXT_PUBLIC_E2E swaps in the wallet and chain mocks at build time
      command: `npm run build && npm run start -- -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      env: {
        NEXT_PUBLIC_E2E: "true",
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
        // Must match E2E_ADDRESS in e2e/fixtures.ts so the wallet passes the admin check
        NEXT_PUBLIC_ADMIN_ADDRESSES: "GE2ETESTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWXYZ",
      },
      timeout: 240_000,
      reuseExistingServer: false,
    },
  ],
});
