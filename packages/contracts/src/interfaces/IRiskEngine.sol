// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IRiskEngine
/// @notice Solidity view of the Aegis Stylus risk engine. The Stylus SDK maps
///         Rust snake_case method names to Solidity camelCase selectors, so the
///         on-chain selectors match exactly the names below.
/// @dev    `score` is a pure view (cheap, used for gating + the dashboard);
///         `evaluate` performs the identical computation but emits an on-chain
///         `DecisionScored` event for an immutable audit trail.
interface IRiskEngine {
    /// @notice Compute a corroborated risk decision from parallel signal arrays.
    /// @param sources       per-signal source id (indexes the engine's source weights)
    /// @param classes       per-signal attack-class id (0..7)
    /// @param severitiesBps  per-signal severity in basis points (0..10_000)
    /// @param confidencesBps per-signal detector confidence in bps (0..10_000)
    /// @param agesSecs      per-signal age in seconds (drives time decay)
    /// @return scoreBps  final corroborated risk score in bps (0..10_000)
    /// @return tier      0 = none, 1 = alert, 2 = confirm, 3 = auto-fire
    /// @return exitFlag  true iff the bounded exit should fire now
    function score(
        uint8[] calldata sources,
        uint8[] calldata classes,
        uint256[] calldata severitiesBps,
        uint256[] calldata confidencesBps,
        uint256[] calldata agesSecs
    ) external view returns (uint256 scoreBps, uint8 tier, bool exitFlag);

    /// @notice Same as `score` but logs a `DecisionScored` event on-chain.
    function evaluate(
        uint8[] calldata sources,
        uint8[] calldata classes,
        uint256[] calldata severitiesBps,
        uint256[] calldata confidencesBps,
        uint256[] calldata agesSecs
    ) external returns (uint256 scoreBps, uint8 tier, bool exitFlag);

    /// @notice Absolute price deviation between observed and expected, in bps.
    function deviationBps(uint256 observed, uint256 expected) external view returns (uint256);

    function owner() external view returns (address);
    function thresholds() external view returns (uint256 t3Bps, uint256 t2Bps);
    function threatMultiplierBps() external view returns (uint256);
    function classWeight(uint256 classId) external view returns (uint256);
    function sourceWeight(uint256 sourceId) external view returns (uint256);
    function isAutoFireClass(uint256 classId) external view returns (bool);
}
