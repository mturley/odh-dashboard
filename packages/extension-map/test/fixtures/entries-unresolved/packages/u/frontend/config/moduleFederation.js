const target = './src/odh/extensions';
module.exports = { exposes: { './extensions': target } };
// The expose is read statically, never evaluated: requiring this module would fail here.
throw new Error('must never be executed');
