const THEME_INIT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch (e) {}
})();
`;

export function ThemeScript(): JSX.Element {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />;
}
