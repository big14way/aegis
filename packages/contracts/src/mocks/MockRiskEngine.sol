// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IRiskEngine} from "../interfaces/IRiskEngine.sol";

/// @notice Settable stand-in for the Stylus engine so vault tests run without
///         the Stylus toolchain. The real engine's behaviour is exercised by the
///         Rust unit tests in `packages/risk-engine`.
contract MockRiskEngine is IRiskEngine {
    uint256 public scoreBps;
    uint8 public tier;
    bool public exitFlag;

    event DecisionScored(uint256 scoreBps, uint8 tier, bool exitFlag, uint256 signalCount);

    function setDecision(uint256 scoreBps_, uint8 tier_, bool exitFlag_) external {
        scoreBps = scoreBps_;
        tier = tier_;
        exitFlag = exitFlag_;
    }

    function score(uint8[] calldata, uint8[] calldata, uint256[] calldata, uint256[] calldata, uint256[] calldata)
        external
        view
        override
        returns (uint256, uint8, bool)
    {
        return (scoreBps, tier, exitFlag);
    }

    function evaluate(
        uint8[] calldata sources,
        uint8[] calldata,
        uint256[] calldata,
        uint256[] calldata,
        uint256[] calldata
    ) external override returns (uint256, uint8, bool) {
        emit DecisionScored(scoreBps, tier, exitFlag, sources.length);
        return (scoreBps, tier, exitFlag);
    }

    function deviationBps(uint256 observed, uint256 expected) external pure override returns (uint256) {
        if (expected == 0) return 0;
        uint256 diff = observed > expected ? observed - expected : expected - observed;
        uint256 dev = (diff * 10_000) / expected;
        return dev > 10_000 ? 10_000 : dev;
    }

    function owner() external pure override returns (address) { return address(0); }
    function thresholds() external pure override returns (uint256, uint256) { return (7500, 4500); }
    function threatMultiplierBps() external pure override returns (uint256) { return 10_000; }
    function classWeight(uint256) external pure override returns (uint256) { return 10_000; }
    function sourceWeight(uint256) external pure override returns (uint256) { return 10_000; }
    function isAutoFireClass(uint256 classId) external pure override returns (bool) {
        return classId == 3 || classId == 7;
    }
}
