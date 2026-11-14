// Fixture stand-in for the repo's scripts/query-workspace-packages.js: prints
// the fixture's workspace packages (plus entries the analysis must exclude)
// as JSON, without invoking pnpm.
const packages = [
  { name: '@fx/root', version: '0.0.0', private: true, path: '.', location: '.' },
  { name: '@fx/a', version: '1.0.0', private: true, path: 'packages/a', location: 'packages/a' },
  {
    name: '@fx/a-ui',
    version: '1.0.0',
    private: true,
    path: 'packages/a/frontend',
    location: 'packages/a/frontend',
  },
  {
    name: '@fx/a-tests',
    version: '1.0.0',
    private: true,
    path: 'packages/a/__tests__',
    location: 'packages/a/__tests__',
  },
  {
    name: '@fx/a-cy',
    version: '1.0.0',
    private: true,
    path: 'packages/a/cypress',
    location: 'packages/a/cypress',
  },
  { name: '@fx-backend', version: '1.0.0', private: true, path: 'backend', location: 'backend' },
  {
    name: '@odh-dashboard/tsconfig',
    version: '1.0.0',
    private: true,
    path: 'packages/tsconfig',
    location: 'packages/tsconfig',
  },
  {
    name: '@odh-dashboard/eslint-plugin-fx',
    version: '1.0.0',
    private: true,
    path: 'packages/eslint-plugin-fx',
    location: 'packages/eslint-plugin-fx',
  },
  {
    name: '@odh-dashboard/extension-map',
    version: '0.0.0',
    private: true,
    path: 'packages/extension-map',
    location: 'packages/extension-map',
  },
];
process.stdout.write(JSON.stringify(packages));
