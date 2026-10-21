import { Request, Response, NextFunction } from "express";
import { z, ZodTypeAny } from "zod";
import { StrKey } from "@stellar/stellar-sdk";
import { fail } from "../response";

/**
 * Shared zod schema for Stellar Ed25519 public keys (G... addresses).
 */
export const stellarAddress = z
  .string()
  .refine((value) => StrKey.isValidEd25519PublicKey(value), {
    message: "INVALID_ADDRESS",
  });

/**
 * Shared zod schema for Soroban contract addresses (C... addresses).
 */
export const stellarContractAddress = z
  .string()
  .refine((value) => StrKey.isValidContract(value), {
    message: "INVALID_ADDRESS",
  });

/**
 * Validates request body and/or query against zod schemas.
 * Responds with 400 and VALIDATION_ERROR details on failure; on success the
 * parsed (coerced and defaulted) values replace the raw ones on the request.
 */
export function validate(schemas: { body?: ZodTypeAny; query?: ZodTypeAny }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: result.error.flatten(),
        });
        return;
      }
      req.body = result.data;
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        res.status(400).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: result.error.flatten(),
        });
        return;
      }
      req.query = result.data;
    }

    next();
  };
}

/**
 * Validates a single route param against the given zod schema.
 * Responds with 400 and the schema's error code on failure.
 */
export function validateParam(
  paramName: string,
  schema: ZodTypeAny,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params[paramName]);
    if (!result.success) {
      const code = result.error.issues[0]?.message ?? "INVALID_ADDRESS";
      fail(res, 400, code, "Invalid request parameter");
      return;
    }
    next();
  };
}

/**
 * Validates request parts against zod schemas. On success the parsed values
 * replace the originals so handlers receive coerced/defaulted data.
 * Responds with 400 VALIDATION_ERROR and zod's flattened issues on failure.
 */
export function validate(schemas: {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const part of ["body", "query", "params"] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        res.status(400).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: result.error.flatten(),
        });
        return;
      }
      (req as unknown as Record<string, unknown>)[part] = result.data;
    }
    next();
  };
}
