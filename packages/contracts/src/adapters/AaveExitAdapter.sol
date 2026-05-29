// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IExitAdapter} from "../interfaces/IExitAdapter.sol";
import {IAaveV3Pool} from "../interfaces/IAaveV3Pool.sol";

/// @title  AaveExitAdapter
/// @notice Unwinds an Aave V3 supply position during a crisis exit.
///
///         Usage: the user's `sourceAsset` is the Aave aToken; the vault pulls
///         the bounded amount of aTokens into this adapter, which then calls
///         `Pool.withdraw` to redeem the underlying directly to the user.
///
///         Verified Aave V3 addresses on Arbitrum (One + Sepolia share them):
///           Pool 0x794a61358D6845594F94dc1DB02A252b5b4814aD
///
/// @dev    If the redeemed underlying differs from `targetAsset`, wire a swap in
///         the marked integration point (or route through SwapExitAdapter). The
///         1:1 underlying == target path is the common "exit to the stablecoin I
///         already supplied" case.
contract AaveExitAdapter is IExitAdapter, Ownable {
    using SafeERC20 for IERC20;

    IAaveV3Pool public immutable pool;

    /// @notice aToken => underlying reserve asset.
    mapping(address => address) public underlyingOf;

    event UnderlyingSet(address indexed aToken, address indexed underlying);

    constructor(address pool_, address admin) Ownable(admin) {
        pool = IAaveV3Pool(pool_);
    }

    function setUnderlying(address aToken, address underlying) external onlyOwner {
        underlyingOf[aToken] = underlying;
        emit UnderlyingSet(aToken, underlying);
    }

    /// @inheritdoc IExitAdapter
    function exit(address sourceAsset, uint256 amount, address targetAsset, address beneficiary)
        external
        override
        returns (uint256 proceeds)
    {
        // Pull the aTokens the vault approved to us.
        IERC20(sourceAsset).safeTransferFrom(msg.sender, address(this), amount);

        address underlying = underlyingOf[sourceAsset];
        require(underlying != address(0), "Aegis/Aave: unknown aToken");

        // Burn aTokens, redeem the underlying straight to the beneficiary.
        proceeds = pool.withdraw(underlying, amount, beneficiary);

        // Integration point: if `underlying != targetAsset`, swap here.
        require(underlying == targetAsset, "Aegis/Aave: swap step not configured");
        return proceeds;
    }

    function name() external pure override returns (string memory) {
        return "AaveExitAdapter";
    }
}
