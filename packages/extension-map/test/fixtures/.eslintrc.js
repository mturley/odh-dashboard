// Fixture sources are data for the analysis tests: their own fixture
// tsconfigs deliberately exclude some files (that is what the ownership
// tests exercise), so lint them with the package tsconfig instead of the
// nearest one.
const path = require('node:path');

module.exports = {
  parserOptions: {
    tsconfigRootDir: path.resolve(__dirname, '../..'),
    project: ['./tsconfig.json'],
  },
};
