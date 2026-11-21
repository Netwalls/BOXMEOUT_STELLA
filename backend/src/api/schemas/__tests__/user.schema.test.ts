/**
 * B-159: unit tests for profile validation rules. Pure functions, no I/O.
 */
import { buildUpdateUserSchema, normalizeDisplayName } from "../user.schema";

const schema = buildUpdateUserSchema();
const schemaWithAllowlist = buildUpdateUserSchema({ avatarHostAllowlist: ["cdn.boxmeout.app"] });

function firstMessage(input: unknown, s = schema): string | undefined {
  const result = s.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("displayName", () => {
  it("accepts a plain name", () => {
    expect(schema.parse({ displayName: "Iron Mike" })).toEqual({ displayName: "Iron Mike" });
  });

  it("trims surrounding whitespace", () => {
    expect(schema.parse({ displayName: "   Ali  \n" }).displayName).toBe("Ali");
  });

  it("normalises to NFC (composed é)", () => {
    const decomposed = "José"; // "José" with a combining accent
    expect(schema.parse({ displayName: decomposed }).displayName).toBe("José");
    expect(normalizeDisplayName(decomposed)).toBe("José");
  });

  it("accepts exactly 32 characters", () => {
    const name = "a".repeat(32);
    expect(schema.parse({ displayName: name }).displayName).toBe(name);
  });

  it("rejects 33 characters", () => {
    expect(firstMessage({ displayName: "a".repeat(33) })).toBe(
      "displayName must be at most 32 characters",
    );
  });

  it("counts code points, not UTF-16 units", () => {
    // Each emoji is one code point but two UTF-16 units; 32 of them is still valid.
    const thirtyTwoEmoji = "😀".repeat(32);
    expect(schema.parse({ displayName: thirtyTwoEmoji }).displayName).toBe(thirtyTwoEmoji);
    expect(firstMessage({ displayName: "😀".repeat(33) })).toBe(
      "displayName must be at most 32 characters",
    );
  });

  it("rejects an empty name and a whitespace-only name", () => {
    expect(firstMessage({ displayName: "" })).toBe("displayName must not be empty");
    expect(firstMessage({ displayName: "   " })).toBe("displayName must not be empty");
  });

  it("rejects control characters", () => {
    expect(firstMessage({ displayName: "Bob\u0007" })).toBe(
      "displayName must not contain control or bidi override characters",
    );
    expect(firstMessage({ displayName: "Bo\u0000b" })).toBe(
      "displayName must not contain control or bidi override characters",
    );
  });

  it("rejects the right-to-left override (U+202E) used to spoof text", () => {
    // "abc" with RLO before it renders differently from its byte order.
    expect(firstMessage({ displayName: "‮evil" })).toBe(
      "displayName must not contain control or bidi override characters",
    );
  });

  it("rejects the other bidi embeddings and isolates", () => {
    for (const ch of ["‪", "‫", "‬", "‭", "⁦", "⁧", "⁨", "⁩"]) {
      expect(firstMessage({ displayName: `x${ch}y` })).toBe(
        "displayName must not contain control or bidi override characters",
      );
    }
  });

  it("rejects a non-string value", () => {
    expect(firstMessage({ displayName: 42 })).toBe("displayName must be a string");
  });
});

describe("avatarUrl", () => {
  it("accepts an https URL", () => {
    expect(schema.parse({ avatarUrl: "https://images.example.com/a.png" }).avatarUrl).toBe(
      "https://images.example.com/a.png",
    );
  });

  it("trims whitespace around the URL", () => {
    expect(schema.parse({ avatarUrl: "  https://example.com/a.png " }).avatarUrl).toBe(
      "https://example.com/a.png",
    );
  });

  it("rejects javascript: URLs", () => {
    expect(firstMessage({ avatarUrl: "javascript:alert(1)" })).toBe("avatarUrl must use https");
  });

  it("rejects data: URLs", () => {
    expect(firstMessage({ avatarUrl: "data:image/png;base64,AAAA" })).toBe(
      "avatarUrl must use https",
    );
  });

  it("rejects plain http", () => {
    expect(firstMessage({ avatarUrl: "http://example.com/a.png" })).toBe("avatarUrl must use https");
  });

  it("rejects a value that is not a URL", () => {
    expect(firstMessage({ avatarUrl: "not a url" })).toBe("avatarUrl must be a valid URL");
  });

  it("rejects credentials in the URL", () => {
    expect(firstMessage({ avatarUrl: "https://user:pass@example.com/a.png" })).toBe(
      "avatarUrl must not contain credentials",
    );
    expect(firstMessage({ avatarUrl: "https://user@example.com/a.png" })).toBe(
      "avatarUrl must not contain credentials",
    );
  });

  it("accepts exactly 512 characters and rejects 513", () => {
    const base = "https://example.com/";
    const at512 = base + "a".repeat(512 - base.length);
    expect(at512.length).toBe(512);
    expect(schema.parse({ avatarUrl: at512 }).avatarUrl).toBe(at512);

    const at513 = base + "a".repeat(513 - base.length);
    expect(firstMessage({ avatarUrl: at513 })).toBe("avatarUrl must be at most 512 characters");
  });

  it("allows any https host when no allowlist is configured", () => {
    expect(schema.safeParse({ avatarUrl: "https://anywhere.test/a.png" }).success).toBe(true);
  });

  it("enforces the host allowlist when one is configured", () => {
    expect(
      schemaWithAllowlist.safeParse({ avatarUrl: "https://cdn.boxmeout.app/a.png" }).success,
    ).toBe(true);
    expect(firstMessage({ avatarUrl: "https://evil.test/a.png" }, schemaWithAllowlist)).toBe(
      "avatarUrl host is not allowed",
    );
  });
});

describe("request body", () => {
  it("rejects unknown keys", () => {
    const result = schema.safeParse({ displayName: "Ali", role: "admin" });
    expect(result.success).toBe(false);
  });

  it("accepts an empty body", () => {
    expect(schema.parse({})).toEqual({});
  });

  it("rejects a non-object body", () => {
    expect(schema.safeParse("displayName=Ali").success).toBe(false);
    expect(schema.safeParse(["Ali"]).success).toBe(false);
  });
});
