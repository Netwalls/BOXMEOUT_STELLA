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
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/src/__tests__', '<rootDir>/src/hooks', '<rootDir>/src/services'],
      testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/*.test.[jt]s?(x)'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      transform: sharedTransform,
      moduleNameMapper: sharedModuleNameMapper,
      setupFiles: ['<rootDir>/src/__tests__/fetchPolyfill.js'],
      setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
      testPathIgnorePatterns: ['/node_modules/'],
      transformIgnorePatterns: ['/node_modules/(?!(rettime)/)'],
      globals: { 'ts-jest': { isolatedModules: true } },
    },
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
};
