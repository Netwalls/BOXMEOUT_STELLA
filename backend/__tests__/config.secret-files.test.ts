import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { resolveFileSecrets, SecretFileError } from "../src/config.secrets";

// B-127 / #1563: <NAME>_FILE secrets (Docker / Kubernetes secret mounts).

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "boxmeout-secrets-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function secretFile(name: string, contents: string): string {
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

describe("B-127 / #1563 — _FILE secret variants", () => {
  it("reads the file, trims it, and exposes it under the plain name", () => {
    const path = secretFile("admin_api_key", "  file-admin-key\n");
    const resolved = resolveFileSecrets({ ADMIN_API_KEY_FILE: path });
    expect(resolved.ADMIN_API_KEY).toBe("file-admin-key");
  });

  it("leaves the input object untouched", () => {
    const path = secretFile("oracle_key", "oracle-key");
    const env = { ORACLE_API_KEY_FILE: path };
    const resolved = resolveFileSecrets(env);
    expect(resolved.ORACLE_API_KEY).toBe("oracle-key");
    expect(env).not.toHaveProperty("ORACLE_API_KEY");
  });

  it("is a no-op when no _FILE variable is set", () => {
    const resolved = resolveFileSecrets({ ADMIN_API_KEY: "plain" });
    expect(resolved.ADMIN_API_KEY).toBe("plain");
  });

  it("rejects a _FILE path that does not exist, naming the variable only", () => {
    const missing = join(dir, "does-not-exist");
    let error: unknown;
    try {
      resolveFileSecrets({ DATABASE_URL_FILE: missing });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SecretFileError);
    expect((error as Error).message).toMatch(/DATABASE_URL_FILE .*cannot be read/);
    expect((error as Error).message).not.toContain(missing);
  });

  it("rejects an empty (or whitespace-only) secret file", () => {
    const path = secretFile("empty", "  \n");
    expect(() => resolveFileSecrets({ ADMIN_SECRET_KEY_FILE: path })).toThrow(
      /ADMIN_SECRET_KEY_FILE points to an empty file/
    );
  });

  it("rejects setting both NAME and NAME_FILE", () => {
    const path = secretFile("key", "from-file");
    expect(() =>
      resolveFileSecrets({ ORACLE_API_KEY: "from-env", ORACLE_API_KEY_FILE: path })
    ).toThrow(/ORACLE_API_KEY and ORACLE_API_KEY_FILE are both set/);
  });

  it("never includes the secret value in an error message", () => {
    const path = secretFile("key", "   ");
    const value = "super-secret-value-123";
    let message = "";
    try {
      resolveFileSecrets({
        ORACLE_API_KEY: value,
        ORACLE_API_KEY_FILE: secretFile("other", value),
      });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/both set/);
    expect(message).not.toContain(value);

    expect(() => resolveFileSecrets({ ADMIN_API_KEY_FILE: path })).toThrow(/empty file/);
  });
});
