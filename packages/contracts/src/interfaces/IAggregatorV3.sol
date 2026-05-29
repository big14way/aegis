// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Chainlink AggregatorV3 interface (price feeds + the L2 sequencer
///         uptime feed). On Arbitrum One, ETH/USD lives at
///         0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612 and the sequencer uptime
///         feed at 0xFdB631F5EE196F0ed6FAa767959853A9F217697D.
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
