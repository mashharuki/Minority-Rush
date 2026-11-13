// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {
    ERC7984ObserverAccess
} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ObserverAccess.sol";

/// @title RushChip
/// @notice Confidential (ERC-7984) play-money chip for Minority Rush. Balances and transfer amounts are encrypted.
/// @dev Public: holder addresses, observers, faucet claim timing. Private: balances and amounts. No real-world value.
///      A smart-account holder registers its owner EOA as `observer` (`setObserver(self, owner)`), which gets
///      permanent ACL access to that holder's balance and transfer amounts so the owner can user-decrypt them.
contract RushChip is ZamaEthereumConfig, ERC7984ObserverAccess {
    uint64 public constant FAUCET_AMOUNT = 20;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    mapping(address => uint256) public lastFaucetAt;

    error FaucetCoolingDown(uint256 availableAt);

    constructor() ERC7984("Rush Chip", "RUSH", "") {}

    /// @notice Whole-number chips: 1 RUSH = 1 unit.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /// @notice Mint starter chips to the caller (rate limited).
    function faucet() external {
        uint256 last = lastFaucetAt[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) {
            revert FaucetCoolingDown(last + FAUCET_COOLDOWN);
        }
        lastFaucetAt[msg.sender] = block.timestamp;
        // Public constant amount: trivial encryption is fine here.
        _mint(msg.sender, FHE.asEuint64(FAUCET_AMOUNT));
    }
}
