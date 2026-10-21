import { z } from "zod";

/**
 * Pagination rules shared by every list endpoint.
 *
 * - Cursor pagination is used for append-only feeds (bets, user bets): the
 *   cursor stays valid while new rows are appended.
 * - Page pagination is used for catalogue lists (markets, search): clients
 *   can jump to a page number and render page counts from `meta.total`.
 *
 * Every list response carries a `meta` block:
 *   page-based:   { total, hasMore }
 *   cursor-based: { hasMore, nextCursor }
 */

export const MAX_LIST_LIMIT = 100;
export const DEFAULT_LIST_LIMIT = 20;

/** The single `limit` rule: positive integer, default 20, capped at 100. */
export const limitSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(MAX_LIST_LIMIT)
  .default(DEFAULT_LIST_LIMIT);

/** Query params for page-based catalogue lists. */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: limitSchema,
});

/** Query params for cursor-based append-only feeds. */
export const cursorQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: limitSchema,
});

export interface PageMeta {
  total: number;
  hasMore: boolean;
}

export interface CursorMeta {
  hasMore: boolean;
  nextCursor: string | null;
}

export function pageMeta(page: number, limit: number, total: number): PageMeta {
  return { total, hasMore: page * limit < total };
}

export function cursorMeta(nextCursor: string | null): CursorMeta {
  return { hasMore: nextCursor !== null, nextCursor };
}
