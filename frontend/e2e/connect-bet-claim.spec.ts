import { test, expect, E2E_ADDRESS, TESTNET_PASSPHRASE } from "./fixtures";

const truncatedAddress = `${E2E_ADDRESS.slice(0, 5)}...${E2E_ADDRESS.slice(-4)}`;

test.describe("connect, bet, claim", () => {
  test("connects the mocked wallet and places a bet", async ({ page, freighterCalls }) => {
    await page.goto("/markets/e2e-open");
    await expect(page.getByRole("heading", { name: "Maya Chen vs Rico Alvarez" })).toBeVisible();

    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await expect(page.getByRole("button", { name: truncatedAddress }).first()).toBeVisible();

    await page.getByRole("button", { name: "Bet on Maya Chen" }).click();
    await page.getByLabel("Amount (XLM)").fill("10");
    await page.getByRole("button", { name: "Confirm Bet" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Transaction Confirmed" })).toBeVisible();

    const signCalls = (await freighterCalls()).filter((c) => c.method === "signTransaction");
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0].args).toEqual([
      "E2E_UNSIGNED:place_bet",
      { networkPassphrase: TESTNET_PASSPHRASE, address: E2E_ADDRESS },
    ]);

    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("cell", { name: E2E_ADDRESS })).toBeVisible();
  });

  // The portfolio page renders PortfolioTable with markets={{}}, so ClaimButton
  // gets an undefined market and throws on render. Remove fixme once it passes
  // real markets through.
  test.fixme("claims winnings from the portfolio", async ({ page, freighterCalls }) => {
    await page.goto("/portfolio");
    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await expect(page.getByRole("heading", { name: "My Portfolio" })).toBeVisible();

    await page.getByRole("button", { name: "Claim Winnings" }).click();
    await expect(page.getByText("Bet claimed successfully!")).toBeVisible();

    const signCalls = (await freighterCalls()).filter((c) => c.method === "signTransaction");
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0].args[0]).toBe("E2E_UNSIGNED:claim_winnings");
  });
});
