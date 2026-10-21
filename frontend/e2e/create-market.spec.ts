import { test, expect, E2E_ADDRESS } from "./fixtures";

async function fillMarketForm(page: import("@playwright/test").Page, oracle: string) {
  await page.locator("#fighterAName").fill("Maya Chen");
  await page.locator("#fighterARecord").fill("19-1");
  await page.locator("#fighterANationality").fill("USA");
  await page.locator("#fighterAWeightClass").fill("Lightweight");
  await page.locator("#fighterBName").fill("Rico Alvarez");
  await page.locator("#fighterBRecord").fill("20-2");
  await page.locator("#fighterBNationality").fill("Mexico");
  await page.locator("#fighterBWeightClass").fill("Lightweight");
  await page.locator("#bettingEndsAt").fill("2030-06-01T12:00");
  await page.locator("#scheduledAt").fill("2030-06-01T18:00");
  await page.locator("#oracleAddress").fill(oracle);
}

test.describe("create market", () => {
  test("creates a market and opens its page", async ({ page, freighterCalls }) => {
    await page.goto("/create");
    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await expect(page.getByRole("heading", { name: "Create Market" })).toBeVisible();

    await fillMarketForm(page, E2E_ADDRESS);
    await page.getByRole("button", { name: "Create Market" }).click();

    await expect(page.getByText("Market created successfully!")).toBeVisible();
    await expect(page).toHaveURL(/\/markets\/e2e-created$/);

    const signCalls = (await freighterCalls()).filter((c) => c.method === "signTransaction");
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0].args[0]).toBe("E2E_UNSIGNED:create_market");
  });

  test("keeps Create Market disabled while the oracle address is not a G... address", async ({ page }) => {
    await page.goto("/create");
    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await expect(page.getByRole("heading", { name: "Create Market" })).toBeVisible();

    await fillMarketForm(page, "NOT-A-STELLAR-ADDRESS");

    await expect(page.getByRole("button", { name: "Create Market" })).toBeDisabled();
  });
});
