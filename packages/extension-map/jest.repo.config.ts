import baseConfig from '@odh-dashboard/jest-config';

export default {
  ...baseConfig,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/repo/**/*.repo.test.ts'],
  globalSetup: '<rootDir>/test/repo/globalSetup.ts',
  testTimeout: 600000,
  maxWorkers: 1,
};
