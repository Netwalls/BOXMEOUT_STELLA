/**
 * B-122 (#1558): server-side sort options for GET /api/markets.
 * Kept free of DB/Redis imports so the API layer can validate against it cheaply.
 */
export const MARKET_SORTS = ["soonest", "newest", "pool"] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];
export type SortOrder = "asc" | "desc";

const SORT_FIELD: Record<MarketSort, "scheduledAt" | "createdAt" | "totalPool"> = {
  soonest: "scheduledAt",
  newest: "createdAt",
  pool: "totalPool",
};

/**
 * Builds a deterministic Prisma orderBy: the chosen sort column first, then
 * `id` in the same direction as a tie-breaker so offset pagination is stable.
 */
export function buildMarketOrderBy(
  sort: MarketSort = "soonest",
  order: SortOrder = "asc"
): Array<Record<string, SortOrder>> {
  return [{ [SORT_FIELD[sort]]: order }, { id: order }];
}
