#!/usr/bin/env node
// Measures the gzipped JavaScript each route loads, prints a table, and fails when a route with a
// budget in bundle-budget.json goes over it. Routes without a budget are reported, not failed.
// Run after `npm run build`. The table is also written to the GitHub job summary when available.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_DIR = path.join(FRONTEND_DIR, ".next");

const manifestPath = path.join(NEXT_DIR, "app-build-manifest.json");
if (!existsSync(manifestPath)) {
  console.error("Missing .next/app-build-manifest.json. Run `next build` first.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
const budgetPath = path.join(FRONTEND_DIR, "bundle-budget.json");
const { routes: budgets = {} } = existsSync(budgetPath)
  ? JSON.parse(readFileSync(budgetPath, "utf-8"))
  : { routes: {} };

function gzipKb(files) {
  const bytes = files
    .filter((file) => file.endsWith(".js"))
    .reduce((sum, file) => {
      const fullPath = path.join(NEXT_DIR, file);
      return existsSync(fullPath) ? sum + gzipSync(readFileSync(fullPath)).length : sum;
    }, 0);
  return bytes / 1024;
}

const rows = Object.entries(manifest.pages)
  .map(([route, files]) => {
    const kb = gzipKb(files);
    const normalizedRoute = route === "/page" ? "/" : route.replace(/\/page$/, "");
    const limit = budgets[route] ?? budgets[normalizedRoute];
    return { route, kb, limit, over: limit !== undefined && kb > limit };
  })
  .sort((a, b) => a.route.localeCompare(b.route));

const table = [
  "| Route | First-load JS (gzip) | Budget | Status |",
  "| --- | ---: | ---: | --- |",
  ...rows.map(
    (row) =>
      `| \`${row.route}\` | ${row.kb.toFixed(1)} kB | ${row.limit === undefined ? "not set" : `${row.limit} kB`} | ${row.over ? "over budget" : "ok"} |`,
  ),
].join("\n");

console.log(table);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Bundle budget\n\n${table}\n`);
}

const overBudget = rows.filter((row) => row.over);
if (overBudget.length > 0) {
  console.error(
    `[!] ${overBudget.length} route(s) over budget: ${overBudget
      .map((row) => `${row.route} (${row.kb.toFixed(1)} kB > ${row.limit} kB)`)
      .join(", ")}`
  );
  process.exitCode = 1;
}
