const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const customConfig = {
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}", "**/*.test.{ts,tsx}"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  // Allow Jest to transform MSW and its ESM dependencies
  transformIgnorePatterns: [
    "/node_modules/(?!(msw|@mswjs|rettime|outvariant|strict-event-emitter|@open-draft)/).*/",
  ],
};

// createJestConfig wraps the config to handle Next.js transforms
module.exports = async () => {
  const jestConfig = await createJestConfig(customConfig)();
  // Override transformIgnorePatterns to allow MSW ESM
  jestConfig.transformIgnorePatterns = customConfig.transformIgnorePatterns;
  return jestConfig;
};
