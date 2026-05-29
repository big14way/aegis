// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAaveV3Pool} from "../interfaces/IAaveV3Pool.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Minimal Aave V3 Pool stand-in: `withdraw` burns the caller's aTokens
///         and mints the underlying to `to`, modelling a 1:1 redemption.
contract MockAaveV3Pool is IAaveV3Pool {
    using SafeERC20 for IERC20;

    mapping(address => address) public aTokenOf; // underlying => aToken

    function setAToken(address underlying, address aToken) external {
        aTokenOf[underlying] = aToken;
    }

    function withdraw(address asset, uint256 amount, address to) external override returns (uint256) {
        // Adapter (caller) holds aTokens; burn them and mint the underlying.
        // In this mock the adapter passes the aToken in as the source, so we burn
        // from the caller and mint the underlying out.
        MockERC20(aTokenOf[asset]).burnFrom(msg.sender, amount);
        MockERC20(asset).mint(to, amount);
        return amount;
    }

    function repay(address, uint256 amount, uint256, address) external pure override returns (uint256) {
        return amount;
    }

    function getUserAccountData(address)
        external
        pure
        override
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        // Return a healthy-but-declining position by default.
        return (0, 0, 0, 8000, 7500, 1.05e18);
    }
}
