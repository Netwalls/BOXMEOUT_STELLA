/**
 * Runs before first paint so the page never flashes the wrong theme.
 * Mirrors lib/theme.ts: a stored light/dark choice wins, otherwise `system`
 * (or any unknown/corrupt value) follows prefers-color-scheme.
 */
export const THEME_INIT = `
(function () {
  var dark = false;
  try { dark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) {}
  var theme = 'system';
  try {
    var stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') theme = stored;
  } catch (e) {}
  var resolved = theme === 'system' ? (dark ? 'dark' : 'light') : theme;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
})();
`;

export function ThemeScript(): JSX.Element {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />;
}
