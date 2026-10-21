import { config } from "../../config";
import { apiKeyAuth } from "./apiKeyAuth";

/**
 * Admin authentication middleware.
 *
 * Scheme: static API key in the `X-Admin-Key` request header, checked against
 * ADMIN_API_KEY from the validated config (see .env.example).
 *
 * Returns 401 { error, code } on any failure.
 */
export const adminAuth = apiKeyAuth({
  header: "x-admin-key",
  getKey: () => config.ADMIN_API_KEY,
});
