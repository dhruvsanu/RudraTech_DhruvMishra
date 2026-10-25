require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    // Source-chain node: npx hardhat node --config hardhat.chainA.config.js --port 8545
    chainA: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Destination-chain node: npx hardhat node --config hardhat.chainB.config.js --port 9545
    chainB: {
      url: "http://127.0.0.1:9545",
      chainId: 31338,
    },
  },
};
