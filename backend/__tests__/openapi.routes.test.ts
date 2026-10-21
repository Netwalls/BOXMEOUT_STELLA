/**
 * Keeps src/api/openapi.json in step with the routes the API mounts (#1416).
 *
 * Fails when a mounted route is missing from the spec (undocumented) or when
 * the spec lists a method + path that is no longer mounted (stale).
 */

import fs from "fs";
import path from "path";
import { listMountedRoutes, routeKey, toOpenApiPath, MountedRoute } from "./helpers/mountedRoutes";

const SPEC_FILE = path.resolve(__dirname, "../src/api/openapi.json");
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

type OpenApiSpec = { paths: Record<string, Record<string, unknown>> };

function listSpecOperations(): MountedRoute[] {
  const spec: OpenApiSpec = JSON.parse(fs.readFileSync(SPEC_FILE, "utf8"));
  const operations: MountedRoute[] = [];
  for (const [specPath, item] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      if (method in item) {
        operations.push({ method, path: specPath });
      }
    }
  }
  return operations;
}

describe("#1416 openapi.json matches the mounted Express routes", () => {
  const mounted = listMountedRoutes().map((route) => ({
    method: route.method,
    path: toOpenApiPath(route.path),
  }));
  const documented = listSpecOperations();

  const mountedKeys = new Set(mounted.map(routeKey));
  const documentedKeys = new Set(documented.map(routeKey));

  it("finds routes to compare against", () => {
    expect(mounted.length).toBeGreaterThan(0);
    expect(documented.length).toBeGreaterThan(0);
  });

  it("documents every mounted route (no undocumented endpoints)", () => {
    const undocumented = [...mountedKeys].filter((key) => !documentedKeys.has(key)).sort();
    expect(undocumented).toEqual([]);
  });

  it("has no spec operations for routes that are not mounted (no stale endpoints)", () => {
    const stale = [...documentedKeys].filter((key) => !mountedKeys.has(key)).sort();
    expect(stale).toEqual([]);
  });
});
