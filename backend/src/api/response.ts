import type { Response } from "express";

/**
 * Standard response envelope (#1392).
 *
 * Success:  { data, meta? }
 * Error:    { error: { code, message, details?, requestId? } }
 *
 * `meta` carries pagination and other response-level values, for example
 * { page, limit, total } or { nextCursor }.
 */

export interface SuccessEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export interface ErrorEnvelope {
  error: ErrorBody;
}

export interface OkOptions {
  /** HTTP status. Defaults to 200. */
  status?: number;
  meta?: Record<string, unknown>;
}

export function ok<T>(res: Response, data: T, options: OkOptions = {}): void {
  const body: SuccessEnvelope<T> = options.meta ? { data, meta: options.meta } : { data };
  res.status(options.status ?? 200).json(body);
}

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  options: { details?: unknown; requestId?: string } = {},
): void {
  const error: ErrorBody = { code, message };
  if (options.details !== undefined) error.details = options.details;
  if (options.requestId !== undefined) error.requestId = options.requestId;

  const body: ErrorEnvelope = { error };
  res.status(status).json(body);
}
