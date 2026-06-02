// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ScoringLib} from "../lib/ScoringLib.sol";

/// @title  ReferenceScorerSol
/// @notice The Solidity baseline used ONLY in the Stylus-vs-Solidity gas
///         benchmark. It runs the exact Aegis scoring algorithm via the shared
///         `ScoringLib` (the single Solidity source of truth) against the genesis
///         config, so the gas comparison is fair: identical inputs, identical
///         outputs, identical algorithm — only the execution environment differs.
///         It is deliberately not wired into the protocol; the Stylus engine
///         (production) and `LocalRiskEngine` (local/non-Stylus chains) are the
///         real scorers.
contract ReferenceScorerSol {
    /// @notice Identical algorithm to `compute_score` in scoring.rs.
    function score(
        uint8[] calldata sources,
        uint8[] calldata classes,
        uint256[] calldata severitiesBps,
        uint256[] calldata confidencesBps,
        uint256[] calldata agesSecs
    ) external pure returns (uint256 scoreBps, uint8 tier, bool exitFlag) {
        require(
            classes.length == sources.length && severitiesBps.length == sources.length
                && confidencesBps.length == sources.length && agesSecs.length == sources.length,
            "length mismatch"
        );
        ScoringLib.Config memory cfg = ScoringLib.defaultConfig();
        return ScoringLib.computeScore(sources, classes, severitiesBps, confidencesBps, agesSecs, cfg);
    }
}
