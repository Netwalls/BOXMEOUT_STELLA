import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

const withOpacity = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
      },
      // Type scale. `amount` uses tabular numerals so stakes and odds align in columns.
      fontSize: {
        label: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
        title: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '700' }],
        amount: ['0.875rem', { lineHeight: '1.25rem', fontVariantNumeric: 'tabular-nums' }],
      },
      colors: {
        white: withOpacity('--color-fg'),
        gray: {
          50: withOpacity('--color-gray-50'),
          100: withOpacity('--color-gray-100'),
          200: withOpacity('--color-gray-200'),
          300: withOpacity('--color-gray-300'),
          400: withOpacity('--color-gray-400'),
          500: withOpacity('--color-gray-500'),
          600: withOpacity('--color-gray-600'),
          700: withOpacity('--color-gray-700'),
          800: withOpacity('--color-gray-800'),
          900: withOpacity('--color-gray-900'),
        },
      },
    },
  },
  plugins: [],
}
export default config
