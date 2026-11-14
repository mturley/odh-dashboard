const exposePath = './src/odh/extensions';

const moduleFederationConfig = {
  exposes: {
    './extensions': exposePath,
  },
};

module.exports = {
  moduleFederationPlugins: [moduleFederationConfig],
};
