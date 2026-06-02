// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAggregatorV3} from "../interfaces/IAggregatorV3.sol";

/// @notice Settable Chainlink feed mock (also used as the sequencer uptime feed).
contract MockAggregatorV3 is IAggregatorV3 {
    int256 public answer;
    uint8 public immutable _decimals;
    uint256 public startedAt;
    /// @dev 0 => report `block.timestamp` (fresh); otherwise this fixed value.
    uint256 public updatedAtOverride;

    constructor(int256 answer_, uint8 decimals_) {
        answer = answer_;
        _decimals = decimals_;
        startedAt = block.timestamp;
    }

    function setAnswer(int256 a) external {
        answer = a;
    }

    function setStartedAt(uint256 t) external {
        startedAt = t;
    }

    function setUpdatedAt(uint256 t) external {
        updatedAtOverride = t;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        uint256 updatedAt = updatedAtOverride == 0 ? block.timestamp : updatedAtOverride;
        return (1, answer, startedAt, updatedAt, 1);
    }
}
