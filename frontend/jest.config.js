const sharedTransform = {
  '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  '^.+\\.mjs$': 'babel-jest',
};

const sharedModuleNameMapper = { '^@/(.*)$': '<rootDir>/src/$1' };

module.exports = {
  projects: [
    // Component tests — no MSW setup
    {
      displayName: 'components',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/src/components'],
      testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      transform: sharedTransform,
      moduleNameMapper: {
        ...sharedModuleNameMapper,
        '^@stellar/stellar-sdk$': '<rootDir>/src/__tests__/mocks/stellar-sdk.js',
      },
      testPathIgnorePatterns: ['/node_modules/'],
      globals: { 'ts-jest': { isolatedModules: true } },
    },
    // Hook / service / integration tests — with MSW setup
    {
      displayName: 'hooks-services',
      testEnvironment: 'node',
      roots: ['<rootDir>/src/__tests__', '<rootDir>/src/hooks', '<rootDir>/src/services'],
      testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/*.test.[jt]s?(x)'],
      testPathIgnorePatterns: ['/node_modules/', 'src/services/__tests__/api\\.test\\.ts'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      transform: sharedTransform,
      moduleNameMapper: {
        ...sharedModuleNameMapper,
        '^msw$': '<rootDir>/node_modules/msw/lib/core/index.js',
        '^msw/node$': '<rootDir>/node_modules/msw/lib/node/index.js',
      },
      setupFiles: ['<rootDir>/src/__tests__/fetchPolyfill.js'],
      setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
      transformIgnorePatterns: ['/node_modules/(?!(rettime|msw|@mswjs|@open-draft|outvariant|strict-event-emitter|until-async)/)'],
      globals: { 'ts-jest': { isolatedModules: true } },
    },
    // API service unit tests — fetch-spy based, no MSW
    {
      displayName: 'api-unit',
      testEnvironment: 'node',
      roots: ['<rootDir>/src/services'],
      testMatch: ['**/__tests__/api.test.[jt]s?(x)'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      transform: sharedTransform,
      moduleNameMapper: sharedModuleNameMapper,
      testPathIgnorePatterns: ['/node_modules/'],
      globals: { 'ts-jest': { isolatedModules: true } },
    },
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
};
