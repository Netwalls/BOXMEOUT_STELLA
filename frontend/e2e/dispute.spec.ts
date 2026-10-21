import { test, expect } from "./fixtures";

const truncatedAddress = "GE2ET...WXYZ";

test.describe("dispute a result", () => {
  test("files a dispute from a market the wallet bet on", async ({ page, freighterCalls }) => {
    await page.goto("/markets/e2e-disputable");
    await page.getByRole("button", { name: "Connect Wallet" }).first().click();
    await expect(page.getByRole("button", { name: truncatedAddress }).first()).toBeVisible();

    await page.getByRole("button", { name: "Dispute Result" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByPlaceholder(/Describe why this result is incorrect/)
      .fill("The fight was stopped in round two, not three as the result records.");
    await dialog.getByRole("button", { name: "Submit Dispute" }).click();

    await expect(page.getByText("Dispute submitted successfully.")).toBeVisible();
    await expect(dialog).toBeHidden();

    const signCalls = (await freighterCalls()).filter((c) => c.method === "signTransaction");
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0].args[0]).toBe("E2E_UNSIGNED:dispute_resolution");
  });
});
