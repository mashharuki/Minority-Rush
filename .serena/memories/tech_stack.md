# Tech stack

- Package manager: bun (per-package `bun.lock`; root only declares workspaces). Node 24 locally, `>=20` required.
- Contracts: Solidity 0.8.27 (evm cancun), Hardhat 2.28, ethers 6, typechain, Mocha/Chai, solhint. Versions pinned: see `mem:contracts/core`.
- Web: React 19, Vite 8, TypeScript 7 (`tsc -b`), viem 2, `@zama-fhe/sdk` 3.7.2, oxlint.
- Target chain: Ethereum Sepolia (11155111); local = Hardhat mock FHEVM (31337).
- Planned (not present): Privy, ERC-4337/Pimlico, Turborepo, PWA, Lism CSS, Biome/Knip/jscpd.
