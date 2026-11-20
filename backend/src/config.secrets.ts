import { readFileSync } from "fs";

/**
 * B-127 / #1563: secrets may be supplied as files (Docker / Kubernetes secret
 * mounts) instead of plain environment variables. For each supported name,
 * `<NAME>_FILE` is read (trimmed) and used as `<NAME>` when `<NAME>` is unset.
 *
 * Errors name the variables and the file path, never the secret value.
 */
export const FILE_SECRET_NAMES = [
  "DATABASE_URL",
  "ADMIN_SECRET_KEY",
  "ADMIN_API_KEY",
  "ORACLE_API_KEY",
] as const;

export class SecretFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretFileError";
  }
}

export type ReadFile = (path: string) => string;

const defaultReadFile: ReadFile = (path) => readFileSync(path, "utf8");

/**
 * Returns a copy of `env` in which each `<NAME>_FILE` has been resolved into
 * `<NAME>`. The input object is not mutated.
 *
 * @throws {SecretFileError} when both `<NAME>` and `<NAME>_FILE` are set, when
 *   the file cannot be read, or when the file's contents are empty.
 */
export function resolveFileSecrets(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  readFile: ReadFile = defaultReadFile
): Record<string, string | undefined> {
  const resolved: Record<string, string | undefined> = { ...env };

  for (const name of FILE_SECRET_NAMES) {
    const fileVar = `${name}_FILE`;
    const filePath = env[fileVar];
    if (filePath === undefined || filePath === "") continue;

    if (env[name] !== undefined && env[name] !== "") {
      throw new SecretFileError(
        `${name} and ${fileVar} are both set; set only one of them`
      );
    }

    let contents: string;
    try {
      contents = readFile(filePath);
    } catch {
      throw new SecretFileError(`${fileVar} points to a file that cannot be read (${name})`);
    }

    const value = contents.trim();
    if (value.length === 0) {
      throw new SecretFileError(`${fileVar} points to an empty file (${name})`);
    }

    resolved[name] = value;
  }

  return resolved;
}
