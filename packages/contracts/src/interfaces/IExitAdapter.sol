// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice A pluggable, protocol-specific unwind routine. The vault holds the
///         pulled `sourceAsset`, approves the adapter, then calls `exit`. The
///         adapter performs the protocol-specific consolidation and sends the
///         resulting `targetAsset` to `beneficiary`.
interface IExitAdapter {
    /// @param sourceAsset The asset pulled from the vault and unwound.
    /// @param amount      The bounded amount of `sourceAsset` to consolidate.
    /// @param targetAsset The asset delivered to `beneficiary`.
    /// @param beneficiary Recipient of the proceeds (the protected user).
    /// @param minOut      Slippage floor: the adapter MUST revert if the amount
    ///                    of `targetAsset` delivered is below this. The caller
    ///                    (keeper/vault) supplies a price-aware value; `0`
    ///                    disables the floor and accepts any output.
    /// @return proceeds The amount of `targetAsset` delivered to `beneficiary`.
    function exit(
        address sourceAsset,
        uint256 amount,
        address targetAsset,
        address beneficiary,
        uint256 minOut
    ) external returns (uint256 proceeds);

    /// @notice Human-readable adapter name for events / UIs.
    function name() external view returns (string memory);
}
