import { z } from "zod";
import { configSchema, type Config } from "./config.schema";

export type { Config } from "./config.schema";


function formatZodErrors(errors: z.ZodIssue[]): string {
  return errors
    .map((e) => {
      const path = e.path.length > 0 ? e.path.join(".") : "(root)";
      return `  ${path}: ${e.message}`;
    })
    .join("\n");
}

/**
 * Load and validate configuration from environment variables.
 * Throws a descriptive error if any required variable is missing or invalid.
 */
function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = formatZodErrors(result.error.issues);
    throw new Error(
      `❌ Configuration error — missing or invalid environment variables:\n${formatted}\n\n` +
        `Copy backend/.env.example to backend/.env and fill in all required values.\n` +
        `See docs/backend-setup.md for detailed instructions.`
    );
  }

  return result.data;
}

/** Typed, validated application configuration. */
export const config: Config = loadConfig();
