import Redis from "ioredis";
import { db as prisma } from "../db";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const CACHE_TTL = 10; // seconds

export interface SearchResult {
  data: Record<string, unknown>[];
  total: number;
}

/**
 * Full-text search across question + description using tsvector.
 * Uses websearch_to_tsquery, which accepts quoted phrases, "or" and "-" and
 * never raises a syntax error on arbitrary user input. q is always a bound
 * parameter. Results are sorted by relevance and cached in Redis for 10 s.
 */
export async function searchMarkets(
  q: string,
  page = 1,
  limit = 20
): Promise<SearchResult> {
  const cacheKey = `search:${q}:${page}:${limit}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as SearchResult;

  const offset = (page - 1) * limit;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT *, ts_rank("tsVector", websearch_to_tsquery('english', ${q})) AS rank
      FROM "Market"
      WHERE "tsVector" @@ websearch_to_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Market"
      WHERE "tsVector" @@ websearch_to_tsquery('english', ${q})
    `,
  ]);

  const result: SearchResult = {
    data: rows,
    total: Number(countRows[0].count),
  };

  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
  return result;
}

// ── B-158: autocomplete suggestions ──────────────────────────────────────────

const SUGGEST_LIMIT = 8;
const SUGGEST_CACHE_TTL = 10; // seconds

export interface MarketSuggestion {
  id: string;
  label: string;
}

interface SuggestRow {
  id: string;
  question: string | null;
  fighterAName: string | null;
  fighterBName: string | null;
}

/**
 * Escapes LIKE/ILIKE wildcards (`%`, `_`) and the escape character itself.
 * PostgreSQL's default LIKE escape is backslash, so the escaped text matches
 * literally. Exported so tests can pin the behaviour.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Returns true when `text` starts with `needle` or has a word starting with it. */
function matchesPrefix(text: string | null, needle: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return lower.startsWith(needle) || lower.includes(` ${needle}`);
}

/**
 * B-158: prefix-style suggestions from market questions and fighter names.
 * At most SUGGEST_LIMIT items as { id, label }. The label is the first field
 * (question, then fighter A, then fighter B) that matches the query. Every
 * user value is a bound parameter, and LIKE wildcards are escaped. Results are
 * cached in Redis for 10 s.
 */
export async function suggestMarkets(q: string): Promise<MarketSuggestion[]> {
  const needle = q.trim().toLowerCase();
  const cacheKey = `suggest:${needle}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as MarketSuggestion[];

  const escaped = escapeLikePattern(needle);
  const prefix = `${escaped}%`;
  const wordPrefix = `% ${escaped}%`;

  const rows = await prisma.$queryRaw<SuggestRow[]>`
    SELECT
      id,
      question,
      "fighterA"->>'name' AS "fighterAName",
      "fighterB"->>'name' AS "fighterBName"
    FROM "Market"
    WHERE question ILIKE ${prefix} OR question ILIKE ${wordPrefix}
       OR "fighterA"->>'name' ILIKE ${prefix} OR "fighterA"->>'name' ILIKE ${wordPrefix}
       OR "fighterB"->>'name' ILIKE ${prefix} OR "fighterB"->>'name' ILIKE ${wordPrefix}
    ORDER BY "scheduledAt" ASC
    LIMIT ${SUGGEST_LIMIT}
  `;

  const items: MarketSuggestion[] = rows.map((row) => {
    const candidates = [row.question, row.fighterAName, row.fighterBName];
    const label =
      candidates.find((text) => matchesPrefix(text, needle)) ?? row.question ?? "";
    return { id: row.id, label };
  });

  await redis.setex(cacheKey, SUGGEST_CACHE_TTL, JSON.stringify(items));
  return items;
}
