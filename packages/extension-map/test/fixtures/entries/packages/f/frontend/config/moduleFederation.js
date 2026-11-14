module.exports = {
  moduleFederationPlugins: [
    {
      name: 'f',
      exposes: { './extensions': './src/odh/extensions' },
    },
  ],
};
