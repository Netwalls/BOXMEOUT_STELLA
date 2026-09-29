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
};

export default config;
