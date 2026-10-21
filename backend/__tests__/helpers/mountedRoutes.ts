import fs from "fs";
import path from "path";

/**
 * Lists the HTTP routes the API mounts, read statically from `src/app.ts`
 * and the route files it imports. Static reading keeps the list available
 * even when the controllers behind the routes do not compile.
 *
 * Returns entries like `{ method: "get", path: "/api/markets/:id" }`, using
 * Express's `:param` syntax. The dev-only Swagger mount (`/docs`) is excluded.
 */

export interface MountedRoute {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
}

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const APP_FILE = path.join(BACKEND_ROOT, "src/app.ts");
const ROUTES_DIR = path.join(BACKEND_ROOT, "src/api/routes");

const EXCLUDED_MOUNTS = new Set(["/docs"]);

function joinPaths(prefix: string, routePath: string): string {
  const joined = `${prefix}${routePath}`.replace(/\/{2,}/g, "/");
  return joined.length > 1 ? joined.replace(/\/$/, "") : joined;
}

export function listMountedRoutes(): MountedRoute[] {
  const appSource = fs.readFileSync(APP_FILE, "utf8");

  // import marketRoutes from "./api/routes/market.routes";
  const importedFiles = new Map<string, string>();
  for (const match of appSource.matchAll(/import\s+(\w+)\s+from\s+"\.\/api\/routes\/([\w.-]+)"/g)) {
    importedFiles.set(match[1], match[2]);
  }

  // app.use("/api/markets", marketRoutes);
  const routes: MountedRoute[] = [];
  for (const match of appSource.matchAll(/app\.use\(\s*"([^"]+)",\s*(\w+)\s*\)/g)) {
    const [, prefix, identifier] = match;
    const file = importedFiles.get(identifier);
    if (!file || EXCLUDED_MOUNTS.has(prefix)) continue;

    const routeSource = fs.readFileSync(path.join(ROUTES_DIR, `${file}.ts`), "utf8");
    // router.get("/:id", handler) — the `\s*` allows multi-line calls.
    for (const route of routeSource.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
      routes.push({
        method: route[1] as MountedRoute["method"],
        path: joinPaths(prefix, route[2]),
      });
    }
  }
  return routes;
}

/** `/api/markets/:id` → `/api/markets/{id}`, the OpenAPI path syntax. */
export function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:(\w+)/g, "{$1}");
}

export function routeKey(route: MountedRoute): string {
  return `${route.method.toUpperCase()} ${route.path}`;
}
