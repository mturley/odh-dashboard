const moduleFederationConfig = {
  exposes: {
    './extensions': './src/odh/extensions',
  },
};

module.exports = {
  moduleFederationPlugins: [moduleFederationConfig],
};
