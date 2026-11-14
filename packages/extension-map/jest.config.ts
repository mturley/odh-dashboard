import config from '@odh-dashboard/jest-config';

export default {
  ...config,
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/test/fixtures/', '/test/repo/'],
};
