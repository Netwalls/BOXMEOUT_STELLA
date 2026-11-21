import en from "../messages/en.json";
import es from "../messages/es.json";

/**
 * #1554 — minimal i18n groundwork.
 *
 * Messages live in `messages/<locale>.json`. `en` is the source of truth: every
 * other locale must define the same keys, and lookups fall back to `en` when a
 * key is missing at runtime.
 */

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export type Messages = typeof en;

const catalogs: Record<Locale, unknown> = { en, es };

/** Flattens a nested message object into dotted keys, e.g. `nav.home`. */
export function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flattenKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

function lookup(catalog: unknown, key: string): string | undefined {
  let node: unknown = catalog;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/** Translates a dotted key for the locale, falling back to English. */
export function translate(locale: Locale, key: string): string {
  return lookup(catalogs[locale], key) ?? lookup(catalogs[DEFAULT_LOCALE], key) ?? key;
}

/** Locale-aware number formatting. */
export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Locale-aware date formatting. */
export function formatDate(locale: Locale, value: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, options).format(date);
}
