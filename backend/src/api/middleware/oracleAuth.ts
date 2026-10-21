import { config } from "../../config";
import { apiKeyAuth } from "./apiKeyAuth";

/**
 * Oracle authentication middleware.
 *
 * Scheme: static API key in the `X-Oracle-Key` request header, checked against
 * ORACLE_API_KEY from the validated config (see .env.example).
 *
 * Returns 401 { error, code } on any failure.
 */
export const oracleAuth = apiKeyAuth({
  header: "x-oracle-key",
  getKey: () => config.ORACLE_API_KEY,
});
