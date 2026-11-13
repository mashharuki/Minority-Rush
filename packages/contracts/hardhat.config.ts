import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import * as dotenv from "dotenv";
import "hardhat-gas-reporter";
import type { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";
import "solidity-coverage";

import "./tasks/accounts";

dotenv.config();

// Values are read from `.env` (loaded by dotenv above) or the shell environment first, then from
// `npx hardhat vars set <NAME>`, then fall back to the defaults below.
function getConfigValue(name: string, fallback: string): string {
  const fromEnv = process.env[name];
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  return vars.get(name, fallback);
}

// Public test mnemonic: the in-process `hardhat` network needs several funded signers (deployer/alice/bob in tests).
const HARDHAT_TEST_MNEMONIC = "test test test test test test test test test test test junk";
// Fallback is the well-known public dev key of account #0 of the mnemonic above. Never use it with real funds:
// remote networks only get accounts when a different key is supplied.
const PUBLIC_DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const PRIVATE_KEY: string = getConfigValue("PRIVATE_KEY", PUBLIC_DEV_KEY);
// Optional second funded key: the Sepolia smoke test needs two players.
const PRIVATE_KEY_2: string = getConfigValue("PRIVATE_KEY_2", "");
const REMOTE_ACCOUNTS: string[] = PRIVATE_KEY === PUBLIC_DEV_KEY ? [] : [PRIVATE_KEY, PRIVATE_KEY_2].filter(Boolean);
const INFURA_API_KEY: string = getConfigValue("INFURA_API_KEY", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
const ETHERSCAN_API_KEY: string = getConfigValue("ETHERSCAN_API_KEY", "");
const SEPOLIA_RPC_URL: string = getConfigValue("SEPOLIA_RPC_URL", `https://sepolia.infura.io/v3/${INFURA_API_KEY}`);

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  etherscan: {
    // Etherscan API V2: a single key works for all supported chains (per-network keys use the removed V1).
    apiKey: ETHERSCAN_API_KEY,
  },
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: HARDHAT_TEST_MNEMONIC,
      },
      chainId: 31337,
    },
    anvil: {
      accounts: [PUBLIC_DEV_KEY],
      chainId: 31337,
      url: "http://localhost:8545",
    },
    sepolia: {
      accounts: REMOTE_ACCOUNTS,
      chainId: 11155111,
      url: SEPOLIA_RPC_URL,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.27",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/hardhat-template/issues/31
        bytecodeHash: "none",
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 800,
      },
      evmVersion: "cancun",
    },
  },
  sourcify: {
    // The installed hardhat-verify uses Sourcify API v1, which has been removed (404); Etherscan only for now.
    enabled: false,
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
