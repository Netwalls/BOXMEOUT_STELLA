/**
 * B-159: validation for profile updates (PUT /api/users/:address).
 *
 *   displayName: trimmed, NFC-normalised, 1-32 characters, with no control
 *                characters and no bidi override or isolate characters.
 *   avatarUrl:   https only, at most 512 characters, no credentials in the URL,
 *                and an optional host allowlist from config.
 *   Unknown body keys are rejected.
 */
import { z } from "zod";

export const DISPLAY_NAME_MAX_LENGTH = 32;
export const AVATAR_URL_MAX_LENGTH = 512;

/**
 * Characters that can hide or reorder text: Unicode control characters (Cc),
 * bidi embeddings and overrides (U+202A-U+202E), and bidi isolates
 * (U+2066-U+2069). Trimming happens first, so ordinary leading or trailing
 * whitespace never trips this check.
 */
const UNSAFE_DISPLAY_NAME_CHARS = /[\p{Cc}‪-‮⁦-⁩]/u;

/** Length in user-perceived code points, not UTF-16 units. */
function codePointLength(value: string): number {
  return [...value].length;
}

/** Normalises a display name: NFC first, then trim surrounding whitespace. */
export function normalizeDisplayName(raw: string): string {
  return raw.normalize("NFC").trim();
}

export const displayNameSchema = z
  .string({ invalid_type_error: "displayName must be a string" })
  .transform(normalizeDisplayName)
  .superRefine((value, ctx) => {
    const length = codePointLength(value);
    if (length < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "displayName must not be empty" });
      return;
    }
    if (length > DISPLAY_NAME_MAX_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `displayName must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`,
      });
    }
    if (UNSAFE_DISPLAY_NAME_CHARS.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "displayName must not contain control or bidi override characters",
      });
    }
  });

/**
 * Builds the avatarUrl schema. `allowedHosts` is a lowercase hostname list.
 * An empty list accepts any host.
 */
export function avatarUrlSchema(allowedHosts: readonly string[] = []) {
  return z
    .string({ invalid_type_error: "avatarUrl must be a string" })
    .transform((value) => value.trim())
    .superRefine((value, ctx) => {
      const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });

      if (value.length > AVATAR_URL_MAX_LENGTH) {
        fail(`avatarUrl must be at most ${AVATAR_URL_MAX_LENGTH} characters`);
        return;
      }

      let url: URL;
      try {
        url = new URL(value);
      } catch {
        fail("avatarUrl must be a valid URL");
        return;
      }

      if (url.protocol !== "https:") {
        fail("avatarUrl must use https");
        return;
      }
      if (url.username !== "" || url.password !== "") {
        fail("avatarUrl must not contain credentials");
        return;
      }
      if (allowedHosts.length > 0 && !allowedHosts.includes(url.hostname.toLowerCase())) {
        fail("avatarUrl host is not allowed");
      }
    });
}

export interface UpdateUserSchemaOptions {
  /** Lowercase hostnames allowed for avatarUrl. Empty means any host. */
  avatarHostAllowlist?: readonly string[];
}

/**
 * Schema for PUT /api/users/:address. Both fields are optional. Any key other
 * than displayName or avatarUrl is rejected.
 */
export function buildUpdateUserSchema(options: UpdateUserSchemaOptions = {}) {
  return z
    .object({
      displayName: displayNameSchema.optional(),
      avatarUrl: avatarUrlSchema(options.avatarHostAllowlist ?? []).optional(),
    })
    .strict();
}

export type UpdateUserBody = z.infer<ReturnType<typeof buildUpdateUserSchema>>;
