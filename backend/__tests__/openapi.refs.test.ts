/**
 * Checks that src/api/openapi.json is complete enough to generate client
 * types from (#1417): the required top-level fields exist and every local
 * `$ref` resolves to a component. Code generators fail or emit `unknown`
 * for broken references, so this catches that before generation runs.
 */

import fs from "fs";
import path from "path";

const SPEC_FILE = path.resolve(__dirname, "../src/api/openapi.json");

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const spec: Record<string, JsonValue> = JSON.parse(fs.readFileSync(SPEC_FILE, "utf8"));

/** Collects every `$ref` value found anywhere in the document. */
function collectRefs(node: JsonValue, refs: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((child) => collectRefs(child, refs));
  } else if (node !== null && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) {
      if (key === "$ref" && typeof child === "string") {
        refs.push(child);
      } else {
        collectRefs(child, refs);
      }
    }
  }
  return refs;
}

/** Resolves a local JSON pointer such as `#/components/schemas/Market`. */
function resolvePointer(pointer: string): unknown {
  if (!pointer.startsWith("#/")) return undefined;
  return pointer
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>(
      (node, segment) =>
        node !== null && typeof node === "object"
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      spec,
    );
}

describe("#1417 openapi.json is complete enough for client type generation", () => {
  it("declares an OpenAPI 3.x version", () => {
    expect(typeof spec.openapi).toBe("string");
    expect(spec.openapi as string).toMatch(/^3\./);
  });

  it("has info.title and info.version", () => {
    const info = spec.info as Record<string, unknown>;
    expect(typeof info?.title).toBe("string");
    expect(typeof info?.version).toBe("string");
  });

  it("has a non-empty paths object", () => {
    const paths = spec.paths as Record<string, unknown>;
    expect(paths).toBeDefined();
    expect(Object.keys(paths).length).toBeGreaterThan(0);
  });

  it("resolves every local $ref to a defined component", () => {
    const unresolved = [...new Set(collectRefs(spec))]
      .filter((ref) => resolvePointer(ref) === undefined)
      .sort();
    expect(unresolved).toEqual([]);
  });
});
