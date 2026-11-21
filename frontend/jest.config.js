const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  coverageProvider: "v8",
  collectCoverageFrom: [
    "app/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "hooks/**/*.{ts,tsx}",
    "lib/**/*.{ts,tsx}",
    "!**/*.stories.{ts,tsx}",
    "!**/__mocks__/**",
    "!**/__tests__/**",
    "!**/*.test.{ts,tsx}",
    "!**/*.d.ts",
    "!e2e/**",
    "!.next/**",
  ],
  coverageReporters: ["text", "text-summary", "lcov"],
  // Floors set just below the measured baseline (see F-143). Raise them as coverage grows.
  coverageThreshold: {
    global: { statements: 26, branches: 79, functions: 55, lines: 26 },
    "./lib/": { statements: 9, branches: 66, functions: 45, lines: 9 },
    "./hooks/": { statements: 20, branches: 79, functions: 42, lines: 20 },
  },
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^zod$": "<rootDir>/node_modules/next/dist/compiled/zod",
  },
  // Fixture modules live beside the tests that use them and must not run as suites
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.next/", "<rootDir>/e2e/"],
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
};

module.exports = createJestConfig(config);
