import { test, expect } from "./fixtures";

const CORE_PAGES = ["/", "/markets/e2e-open", "/portfolio"];

test.describe("security headers", () => {
  for (const path of CORE_PAGES) {
    test(`serves the CSP and frame policy on ${path} without violations`, async ({ page }) => {
      const violations: string[] = [];
      page.on("console", (message) => {
        if (message.text().includes("Content Security Policy")) violations.push(message.text());
      });
      page.on("securitypolicyviolation", (event) => violations.push(event.violatedDirective));

      const response = await page.goto(path);
      expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(response?.headers()["x-frame-options"]).toBe("DENY");

      await page.waitForLoadState("networkidle");
      expect(violations).toEqual([]);
    });
  }
});
