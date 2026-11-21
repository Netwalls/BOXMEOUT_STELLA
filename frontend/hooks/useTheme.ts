"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ResolvedTheme,
  ThemePreference,
  applyResolvedTheme,
  readStoredPreference,
  resolveTheme,
  writeStoredPreference,
} from "@/lib/theme";

export type { ThemePreference, ResolvedTheme };

export interface UseThemeResult {
  /** What the user chose: light, dark or system. */
  preference: ThemePreference;
  /** What is shown right now after resolving `system` against the OS. */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function useTheme(): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);
  const [ready, setReady] = useState(false);

  // Read the stored choice and OS setting after mount, then follow OS changes live.
  useEffect(() => {
    setPreferenceState(readStoredPreference());
    const media = window.matchMedia(DARK_QUERY);
    setSystemDark(media.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    setReady(true);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const theme = resolveTheme(preference, systemDark);

  // Wait until the stored choice is read so we never paint the default first.
  useEffect(() => {
    if (ready) applyResolvedTheme(theme);
  }, [ready, theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStoredPreference(next);
    setPreferenceState(next);
  }, []);

  return { preference, theme, setPreference };
}
