module.exports = {
  moduleFederationPlugins: [
    {
      name: 'rem',
      exposes: {
        './extensions': './src/odh/extensions',
        './extension-points': './src/odh/extension-points/p',
      },
    },
  ],
};
