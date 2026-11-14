module.exports = require('@odh-dashboard/eslint-config')
  .extend({
    ignorePatterns: ['test/fixtures/**'],
  })
  .recommendedTypescript(__dirname);
