import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/src", "<rootDir>/__tests__"],
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/*.test.ts",
  ],
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  globalSetup: "<rootDir>/__tests__/globalSetup.ts",
  setupFiles: ["<rootDir>/__tests__/setupEnv.ts"],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/index.ts",
  ],
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["text", "text-summary", "lcov", "json-summary"],
  // B-116 / #1414: floors are set just below the measured baseline so the
  // suite fails on regressions. Raise them as coverage grows.
  coverageThreshold: {
    global: {
      statements: 33,
      branches: 36,
      functions: 30,
      lines: 33,
    },
    // Modules written with full unit coverage (#1411, #1412) hold a higher bar.
    "./src/services/external-provider.client.ts": {
      statements: 95,
      branches: 90,
      functions: 85,
      lines: 95,
    },
    "./src/services/market-reconciliation.service.ts": {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
  },
};

export default config;
