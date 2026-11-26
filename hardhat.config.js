// file: hardhat.config.js
// description: main hardhat configuration file. sets up the solidity compiler,
// network connections (ganache for live demo, hardhat network for automated tests),
// and the gas reporter plugin used to measure gas usage before and after optimizations.

require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      // optimizer reduces deployed contract size and runtime gas cost
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // ganache: used for live demo with metamask
    // make sure ganache is running on port 7545 before deploying here
    ganache: {
      url: "http://127.0.0.1:7545",
      chainId: 1337,
      ...(process.env.DEPLOYER_PRIVATE_KEY
        ? { accounts: [process.env.DEPLOYER_PRIVATE_KEY] }
        : {})
    },
    // hardhat: built-in local network used for automated tests (no setup needed)
    hardhat: {
      chainId: 31337
    }
  },
  // gas reporter: prints a gas usage table after running tests
  gasReporter: {
    enabled: true,
    currency: "USD",
    outputFile: "gas-report/gas-report.txt",
    noColors: true
  }
};
