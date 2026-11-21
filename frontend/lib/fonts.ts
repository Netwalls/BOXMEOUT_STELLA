import { Inter } from 'next/font/google';

/**
 * UI font, self-hosted by next/font at build time (no runtime request to a
 * third party, no layout shift). Inter is a variable font under the SIL OFL.
 * `display: swap` shows fallback text immediately; the CSS variable is wired
 * into Tailwind's `font-sans` family in tailwind.config.ts.
 */
export const uiFont = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});
