/** User-facing theme choice. `system` (the default) follows the OS setting. */
export type ThemePreference = "light" | "dark" | "system";
/** The theme actually painted. */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

/** Accepts only known values; anything else (including corrupt storage) means `system`. */
export function parsePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/** Reads the stored preference. Storage may throw (private mode, blocked site data). */
export function readStoredPreference(): ThemePreference {
  try {
    return parsePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeStoredPreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage unavailable: the choice still applies for this page view.
  }
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
