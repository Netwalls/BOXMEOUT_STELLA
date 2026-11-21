/**
 * #1554 — locale catalogs stay in sync with English.
 * Fails CI when a locale is missing a key that `en` defines.
 */
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { DEFAULT_LOCALE, LOCALES, flattenKeys, formatNumber, translate } from "@/lib/i18n";

const catalogs = { en, es } as const;

describe("message catalogs", () => {
  it("defines every locale listed in LOCALES", () => {
    expect([...LOCALES].sort()).toEqual(Object.keys(catalogs).sort());
  });

  it.each(LOCALES.filter((l) => l !== DEFAULT_LOCALE))(
    "%s has every key that en defines",
    (locale) => {
      const enKeys = flattenKeys(en);
      const localeKeys = new Set(flattenKeys(catalogs[locale]));
      const missing = enKeys.filter((k) => !localeKeys.has(k));
      expect(missing).toEqual([]);
    },
  );

  it.each(LOCALES.filter((l) => l !== DEFAULT_LOCALE))(
    "%s has no keys that en lacks",
    (locale) => {
      const enKeys = new Set(flattenKeys(en));
      const extra = flattenKeys(catalogs[locale]).filter((k) => !enKeys.has(k));
      expect(extra).toEqual([]);
    },
  );
});

describe("translate", () => {
  it("returns the locale string when present", () => {
    expect(translate("es", "nav.home")).toBe("Inicio");
  });

  it("falls back to English for a missing key and returns the key when absent everywhere", () => {
    expect(translate("es", "nav.home")).not.toBe("nav.home");
    expect(translate("en", "does.not.exist")).toBe("does.not.exist");
  });
});

describe("locale-aware formatting", () => {
  it("formats numbers using the locale's separators", () => {
    expect(formatNumber("en", 1234.5)).toBe("1,234.5");
    expect(formatNumber("es", 1234.5)).toMatch(/1[. ]?234,5/);
  });
});
