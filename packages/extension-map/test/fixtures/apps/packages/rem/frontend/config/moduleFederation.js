module.exports = {
  moduleFederationPlugins: [
    {
      name: 'rem',
      exposes: { './extensions': './src/odh/extensions' },
    },
  ],
};
