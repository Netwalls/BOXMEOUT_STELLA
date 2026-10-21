import { test, expect } from "./fixtures";

test.describe("admin resolution", () => {
  test("resolves a pending market and removes it from the queue", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await expect(page.getByRole("heading", { name: "Pending Resolutions" })).toBeVisible();

    await page.locator("#outcome-e2e-pending").selectOption("FighterB");
    await page.getByRole("button", { name: "Resolve" }).click();

    await expect(page.getByText("No markets pending resolution.")).toBeVisible();
  });
});
