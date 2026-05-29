// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice A pluggable, protocol-specific unwind routine. The vault holds the
///         pulled `sourceAsset`, approves the adapter, then calls `exit`. The
///         adapter performs the protocol-specific consolidation and sends the
///         resulting `targetAsset` to `beneficiary`.
interface IExitAdapter {
    /// @return proceeds The amount of `targetAsset` delivered to `beneficiary`.
    function exit(
        address sourceAsset,
        uint256 amount,
        address targetAsset,
        address beneficiary
    ) external returns (uint256 proceeds);

    /// @notice Human-readable adapter name for events / UIs.
    function name() external view returns (string memory);
}
