/**
 * Checks that the written docs cover what the code exposes (#1418):
 *   - docs/api.md names every mounted endpoint as `METHOD /path`
 *   - docs/backend-setup.md mentions every env var declared in src/config.ts
 */

import fs from "fs";
import path from "path";
import { listMountedRoutes, routeKey } from "./helpers/mountedRoutes";

const REPO_ROOT = path.resolve(__dirname, "../..");
const API_DOC = path.join(REPO_ROOT, "docs/api.md");
const SETUP_DOC = path.join(REPO_ROOT, "docs/backend-setup.md");
const CONFIG_FILE = path.resolve(__dirname, "../src/config.ts");

/** Env var names come from the `configSchema` object: `  NAME: z...`. */
function listEnvVars(): string[] {
  const source = fs.readFileSync(CONFIG_FILE, "utf8");
  const schemaBody = source.slice(
    source.indexOf("const configSchema = z.object({"),
    source.indexOf("});", source.indexOf("const configSchema = z.object({")),
  );
  return [...schemaBody.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]);
}

describe("#1418 docs cover the mounted API and configuration", () => {
  const apiDoc = fs.readFileSync(API_DOC, "utf8");
  const setupDoc = fs.readFileSync(SETUP_DOC, "utf8");

  it("documents every mounted endpoint in docs/api.md", () => {
    const undocumented = listMountedRoutes()
      .map(routeKey)
      .filter((key) => !apiDoc.includes(key))
      .sort();
    expect(undocumented).toEqual([]);
  });

  it("documents every env var from config.ts in docs/backend-setup.md", () => {
    const envVars = listEnvVars();
    expect(envVars.length).toBeGreaterThan(0);

    const undocumented = envVars.filter((name) => !setupDoc.includes(name)).sort();
    expect(undocumented).toEqual([]);
  });
});
