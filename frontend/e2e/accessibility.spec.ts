import { AxeBuilder } from "@axe-core/playwright";
import { test, expect } from "./fixtures";
import { A11Y_ALLOWLIST } from "./a11y-allowlist";

// One market page; the id matches the mock API in e2e/mock-api.mjs
const ROUTES = ["/", "/create", "/portfolio", "/leaderboard", "/admin", "/markets/e2e-open"];
const THEMES = ["light", "dark"] as const;
const BLOCKING_IMPACTS = ["serious", "critical"];

for (const theme of THEMES) {
  for (const path of ROUTES) {
    test(`has no serious or critical axe violations on ${path} (${theme})`, async ({ page }, testInfo) => {
      // ThemeScript reads localStorage before first paint, so set it before any app code runs
      await page.addInitScript((value) => window.localStorage.setItem("theme", value), theme);

      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page }).analyze();
      await testInfo.attach(`axe-${theme}${path.replace(/\//g, "_") || "_root"}`, {
        body: JSON.stringify(results, null, 2),
        contentType: "application/json",
      });

      const allowed = (rule: string) =>
        A11Y_ALLOWLIST.some((entry) => entry.rule === rule && (entry.path === "*" || entry.path === path));

      const blocking = results.violations
        .filter((v) => BLOCKING_IMPACTS.includes(v.impact ?? ""))
        .filter((v) => !allowed(v.id))
        .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) - ${v.helpUrl}`);

      expect(blocking, `axe violations on ${path} (${theme})`).toEqual([]);
    });
  }
}
