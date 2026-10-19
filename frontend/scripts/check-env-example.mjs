// Fails when `.env.example` and the zod schema in `lib/config.ts` disagree on
// which NEXT_PUBLIC_* variables exist. Run from the frontend directory.
import { readFileSync } from "node:fs";

const exampleKeys = new Set(
  readFileSync(".env.example", "utf8")
    .split("\n")
    .map((line) => line.match(/^#?\s*(NEXT_PUBLIC_[A-Z0-9_]+)=/)?.[1])
    .filter(Boolean)
);

// Schema and parse-input keys are the only lines that start with `NEXT_PUBLIC_X:`.
const schemaKeys = new Set(
  [...readFileSync("lib/config.ts", "utf8").matchAll(/^\s+(NEXT_PUBLIC_[A-Z0-9_]+):/gm)].map(
    (match) => match[1]
  )
);

const undocumented = [...schemaKeys].filter((key) => !exampleKeys.has(key));
const undeclared = [...exampleKeys].filter((key) => !schemaKeys.has(key));

if (undocumented.length > 0 || undeclared.length > 0) {
  if (undocumented.length > 0) {
    console.error(`Declared in lib/config.ts but missing from .env.example: ${undocumented.join(", ")}`);
  }
  if (undeclared.length > 0) {
    console.error(`Listed in .env.example but not declared in lib/config.ts: ${undeclared.join(", ")}`);
  }
  process.exit(1);
}

console.log(`.env.example and lib/config.ts agree on ${schemaKeys.size} variables.`);
