const base = require("./hardhat.config");

module.exports = {
  ...base,
  networks: {
    ...base.networks,
    hardhat: { chainId: 31338 },
  },
};
