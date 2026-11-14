// Fixtures are input to the analyzer, not application code: they must be free to contain shapes
// the repo's rules reject (unresolvable values, odd imports, unused exports). They are parsed so
// that the pre-commit hook can run over them, but no rule is applied.
module.exports = {
  root: true,
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  rules: {},
};
