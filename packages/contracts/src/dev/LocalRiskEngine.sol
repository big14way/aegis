// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IRiskEngine} from "../interfaces/IRiskEngine.sol";
import {ScoringLib} from "../lib/ScoringLib.sol";

/// @title  LocalRiskEngine
/// @notice A full Solidity implementation of the Aegis risk engine for chains
///         where Arbitrum Stylus is not available (local anvil / Nitro devnode,
///         or any plain EVM). It exposes the EXACT `IRiskEngine` ABI the Stylus
///         engine does and runs the identical algorithm via `ScoringLib`, so the
///         vault, agent, and dashboard wire against it unchanged — moving to the
///         production Stylus engine is a one-line address swap.
///
///         Configuration lives in storage and is owner-mutable (the genuine
///         source of truth), mirroring the Stylus engine — including the fix that
///         a paused engine can always still be unpaused or handed over.
contract LocalRiskEngine is IRiskEngine {
    address public owner;
    bool public paused;

    uint256 public threatMultiplierBps;
    uint256 public tier3ThresholdBps;
    uint256 public tier2ThresholdBps;

    uint256[8] public classWeightBps;
    uint256[] public sourceWeightBps;
    bool[8] public autoFireClassFlag;

    event DecisionScored(uint256 scoreBps, uint8 tier, bool exitFlag, uint256 signalCount);
    event ConfigUpdated(address indexed by);
    event Initialized(address indexed owner);

    error NotOwner();
    error EnginePaused();
    error LengthMismatch();
    error InvalidThresholds();

    constructor() {
        owner = msg.sender;
        ScoringLib.Config memory cfg = ScoringLib.defaultConfig();
        classWeightBps = cfg.classWeightBps;
        sourceWeightBps = cfg.sourceWeightBps;
        autoFireClassFlag = cfg.autoFireClass;
        threatMultiplierBps = cfg.threatMultBps;
        tier3ThresholdBps = cfg.t3Bps;
        tier2ThresholdBps = cfg.t2Bps;
        emit Initialized(msg.sender);
    }

    // ------------------------------ scoring -------------------------------

    /// @inheritdoc IRiskEngine
    function score(
        uint8[] calldata sources,
        uint8[] calldata classes,
        uint256[] calldata severitiesBps,
        uint256[] calldata confidencesBps,
        uint256[] calldata agesSecs
    ) external view override returns (uint256 scoreBps, uint8 tier, bool exitFlag) {
        _requireEqualLengths(sources, classes, severitiesBps, confidencesBps, agesSecs);
        return ScoringLib.computeScore(sources, classes, severitiesBps, confidencesBps, agesSecs, _config());
    }

    /// @inheritdoc IRiskEngine
    function evaluate(
        uint8[] calldata sources,
        uint8[] calldata classes,
        uint256[] calldata severitiesBps,
        uint256[] calldata confidencesBps,
        uint256[] calldata agesSecs
    ) external override returns (uint256 scoreBps, uint8 tier, bool exitFlag) {
        _requireEqualLengths(sources, classes, severitiesBps, confidencesBps, agesSecs);
        (scoreBps, tier, exitFlag) =
            ScoringLib.computeScore(sources, classes, severitiesBps, confidencesBps, agesSecs, _config());
        emit DecisionScored(scoreBps, tier, exitFlag, sources.length);
    }

    /// @inheritdoc IRiskEngine
    function deviationBps(uint256 observed, uint256 expected) external pure override returns (uint256) {
        if (expected == 0) return 0;
        uint256 diff = observed > expected ? observed - expected : expected - observed;
        uint256 dev = (diff * ScoringLib.BPS) / expected;
        return dev > ScoringLib.BPS ? ScoringLib.BPS : dev;
    }

    // ------------------------------- views --------------------------------

    /// @inheritdoc IRiskEngine
    function thresholds() external view override returns (uint256 t3Bps, uint256 t2Bps) {
        return (tier3ThresholdBps, tier2ThresholdBps);
    }

    /// @inheritdoc IRiskEngine
    function classWeight(uint256 classId) external view override returns (uint256) {
        return classId < 8 ? classWeightBps[classId] : 0;
    }

    /// @inheritdoc IRiskEngine
    function sourceWeight(uint256 sourceId) external view override returns (uint256) {
        return sourceId < sourceWeightBps.length ? sourceWeightBps[sourceId] : 0;
    }

    /// @inheritdoc IRiskEngine
    function isAutoFireClass(uint256 classId) external view override returns (bool) {
        return classId < 8 ? autoFireClassFlag[classId] : false;
    }

    // -------------------------- owner setters -----------------------------

    function setThreatMultiplier(uint256 valueBps) external {
        _onlyOwnerWhenActive();
        threatMultiplierBps = valueBps;
        emit ConfigUpdated(msg.sender);
    }

    function setThresholds(uint256 t3Bps, uint256 t2Bps) external {
        _onlyOwnerWhenActive();
        if (t3Bps < t2Bps) revert InvalidThresholds();
        tier3ThresholdBps = t3Bps;
        tier2ThresholdBps = t2Bps;
        emit ConfigUpdated(msg.sender);
    }

    function setClassWeight(uint256 classId, uint256 weightBps) external {
        _onlyOwnerWhenActive();
        require(classId < 8, "classId");
        classWeightBps[classId] = weightBps;
        emit ConfigUpdated(msg.sender);
    }

    function setSourceWeight(uint256 sourceId, uint256 weightBps) external {
        _onlyOwnerWhenActive();
        while (sourceWeightBps.length <= sourceId) {
            sourceWeightBps.push(0);
        }
        sourceWeightBps[sourceId] = weightBps;
        emit ConfigUpdated(msg.sender);
    }

    function setAutoFireClass(uint256 classId, bool enabled) external {
        _onlyOwnerWhenActive();
        require(classId < 8, "classId");
        autoFireClassFlag[classId] = enabled;
        emit ConfigUpdated(msg.sender);
    }

    /// @dev Pause-independent (a paused engine must still be unpausable).
    function setPaused(bool value) external {
        _onlyOwner();
        paused = value;
    }

    /// @dev Pause-independent (ownership can always be transferred).
    function transferOwnership(address newOwner) external {
        _onlyOwner();
        owner = newOwner;
        emit ConfigUpdated(msg.sender);
    }

    // ------------------------------ internal ------------------------------

    function _onlyOwner() internal view {
        if (msg.sender != owner) revert NotOwner();
    }

    function _onlyOwnerWhenActive() internal view {
        if (msg.sender != owner) revert NotOwner();
        if (paused) revert EnginePaused();
    }

    function _config() internal view returns (ScoringLib.Config memory cfg) {
        cfg.classWeightBps = classWeightBps;
        cfg.sourceWeightBps = sourceWeightBps;
        cfg.autoFireClass = autoFireClassFlag;
        cfg.threatMultBps = threatMultiplierBps;
        cfg.t3Bps = tier3ThresholdBps;
        cfg.t2Bps = tier2ThresholdBps;
    }

    function _requireEqualLengths(
        uint8[] calldata sources,
        uint8[] calldata classes,
        uint256[] calldata severitiesBps,
        uint256[] calldata confidencesBps,
        uint256[] calldata agesSecs
    ) internal pure {
        if (
            classes.length != sources.length || severitiesBps.length != sources.length
                || confidencesBps.length != sources.length || agesSecs.length != sources.length
        ) revert LengthMismatch();
    }
}
