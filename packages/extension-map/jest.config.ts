import baseConfig from '@odh-dashboard/jest-config';

export default {
  ...baseConfig,
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/test/fixtures/', '/test/repo/'],
};
