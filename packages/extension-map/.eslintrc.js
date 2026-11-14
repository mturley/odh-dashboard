/**
 * The test fixtures are linted with the project's rules like every other file in the package. The
 * only thing they need of their own is a project for the type-aware rules: the fixtures' own
 * tsconfigs are analyzer input (one is deliberately broken, one deliberately excludes a file, and
 * some fixture packages have none), so the parser is pointed at a lint-only project that covers
 * every fixture file instead. No rule is turned off or downgraded for them.
 */
module.exports = require('@odh-dashboard/eslint-config')
  .extend({
    overrides: [
      {
        files: ['test/fixtures/**/*.ts', 'test/fixtures/**/*.tsx'],
        parserOptions: {
          tsconfigRootDir: __dirname,
          project: ['test/fixtures/tsconfig.fixtures-lint.json'],
        },
      },
    ],
  })
  .recommendedTypescript(__dirname);
