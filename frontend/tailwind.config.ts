import type { Config } from 'tailwindcss'

const withOpacity = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
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
