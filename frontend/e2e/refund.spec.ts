import { test, expect } from "./fixtures";

test.describe("refund a cancelled market", () => {
  test("claims a refund for a bet on a cancelled market", async ({ page, freighterCalls }) => {
    await page.goto("/portfolio");
    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await expect(page.getByRole("heading", { name: "My Portfolio" })).toBeVisible();

    await page.getByRole("button", { name: "Claim Refund" }).click();
    await expect(page.getByText("Bet claimed successfully!")).toBeVisible();

    const signCalls = (await freighterCalls()).filter((c) => c.method === "signTransaction");
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0].args[0]).toBe("E2E_UNSIGNED:claim_refund");
  });
});
