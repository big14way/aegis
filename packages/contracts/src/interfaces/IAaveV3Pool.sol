// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice The slice of the Aave V3 Pool the Aegis exit adapter relies on.
/// @dev    Verified Arbitrum addresses (One + Sepolia share them):
///         PoolAddressesProvider 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb
///         Pool (proxy)          0x794a61358D6845594F94dc1DB02A252b5b4814aD
interface IAaveV3Pool {
    /// @notice Withdraw `amount` of `asset` from the caller's supply position.
    /// @return The final amount withdrawn.
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);

    /// @notice Repay `amount` of `asset` debt for `onBehalfOf`.
    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)
        external
        returns (uint256);

    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );
}
