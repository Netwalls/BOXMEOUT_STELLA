#!/usr/bin/env node
/**
 * B-116 / #1414: renders coverage/coverage-summary.json as a Markdown table
 * and appends it to the GitHub Actions job summary ($GITHUB_STEP_SUMMARY).
 * Outside Actions it prints to stdout, so it can be run locally too.
 */
const fs = require("fs");
const path = require("path");

const summaryPath = path.resolve(__dirname, "..", "coverage", "coverage-summary.json");
if (!fs.existsSync(summaryPath)) {
  console.error(`No coverage summary at ${summaryPath}; run jest with --coverage first.`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const metrics = ["statements", "branches", "functions", "lines"];
const pct = (m) => `${m.pct.toFixed(2)}% (${m.covered}/${m.total})`;

const rows = [
  `| Scope | ${metrics.map((m) => m[0].toUpperCase() + m.slice(1)).join(" | ")} |`,
  `|---|${metrics.map(() => "---").join("|")}|`,
];

const total = summary.total;
rows.push(`| **Total** | ${metrics.map((m) => pct(total[m])).join(" | ")} |`);

// Per-directory rows make regressions visible in a single area of the tree.
const byDir = new Map();
for (const [file, data] of Object.entries(summary)) {
  if (file === "total") continue;
  const rel = path.relative(process.cwd(), file);
  const dir = path.dirname(rel).split(path.sep).slice(0, 2).join("/");
  const agg = byDir.get(dir) ?? Object.fromEntries(metrics.map((m) => [m, { covered: 0, total: 0 }]));
  for (const m of metrics) {
    agg[m].covered += data[m].covered;
    agg[m].total += data[m].total;
  }
  byDir.set(dir, agg);
}

for (const [dir, agg] of [...byDir.entries()].sort()) {
  const cells = metrics.map((m) => {
    const { covered, total: t } = agg[m];
    const p = t === 0 ? 100 : (covered / t) * 100;
    return `${p.toFixed(2)}% (${covered}/${t})`;
  });
  rows.push(`| \`${dir}\` | ${cells.join(" | ")} |`);
}

const markdown = `## Backend coverage\n\n${rows.join("\n")}\n`;

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
} else {
  process.stdout.write(markdown);
}
