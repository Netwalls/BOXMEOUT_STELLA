import pino from "pino";
import { Writable } from "stream";
import { Prisma } from "@prisma/client";
import { redactConfig, sanitizeErrorForLog } from "../logger";

/** Builds a pino instance with the production redact config that records output. */
function captureLogger() {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { log: pino({ redact: redactConfig }, sink), lines };
}

describe("B-100: logger redaction", () => {
  it("censors admin, oracle and wallet headers in request objects", () => {
    const { log, lines } = captureLogger();

    log.info({
      req: {
        headers: {
          "x-admin-key": "admin-secret-value",
          "x-oracle-key": "oracle-secret-value",
          "x-wallet-signature": "wallet-signature-value",
          "content-type": "application/json",
        },
      },
    }, "incoming request");

    const output = lines.join("");
    expect(output).toContain("[Redacted]");
    expect(output).not.toContain("admin-secret-value");
    expect(output).not.toContain("oracle-secret-value");
    expect(output).not.toContain("wallet-signature-value");
    expect(output).toContain("application/json");
  });

  it("censors ADMIN_SECRET_KEY and nested password fields", () => {
    const { log, lines } = captureLogger();

    log.error({
      ADMIN_SECRET_KEY: "SSECRETKEYVALUE",
      config: { ADMIN_SECRET_KEY: "SNESTEDSECRETVALUE" },
      user: { password: "hunter2-password" },
    }, "config dump");

    const output = lines.join("");
    expect(output).toContain("[Redacted]");
    expect(output).not.toContain("SSECRETKEYVALUE");
    expect(output).not.toContain("SNESTEDSECRETVALUE");
    expect(output).not.toContain("hunter2-password");
  });

  it("logs Prisma validation errors by name only, without query arguments", () => {
    const err = new Prisma.PrismaClientValidationError(
      "Invalid `prisma.user.create()` invocation: { address: 'GSECRETWALLETADDRESS' }",
      { clientVersion: "5.22.0" },
    );

    const sanitized = sanitizeErrorForLog(err) as { name: string; message?: string };

    expect(sanitized).toEqual({ name: "PrismaClientValidationError" });
    expect(JSON.stringify(sanitized)).not.toContain("GSECRETWALLETADDRESS");
  });

  it("logs Prisma known request errors by name and code only", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`id`) value 'market-123'",
      { code: "P2002", clientVersion: "5.22.0" },
    );

    expect(sanitizeErrorForLog(err)).toEqual({
      name: "PrismaClientKnownRequestError",
      code: "P2002",
    });
  });

  it("passes non-Prisma errors through unchanged", () => {
    const err = new Error("plain failure");

    expect(sanitizeErrorForLog(err)).toBe(err);
  });
});
