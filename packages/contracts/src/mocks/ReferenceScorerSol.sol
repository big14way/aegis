// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title  ReferenceScorerSol
/// @notice A faithful Solidity re-implementation of the Aegis risk-scoring core
///         (`packages/risk-engine/src/scoring.rs`), used ONLY as the baseline in
///         the Stylus-vs-Solidity gas benchmark. It is deliberately not wired
///         into the protocol — the Stylus engine is the production scorer.
///
///         Keeping the two implementations byte-for-byte equivalent in behaviour
///         is what makes the gas comparison fair: identical inputs, identical
///         outputs, identical algorithm — only the execution environment differs.
contract ReferenceScorerSol {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant DECAY_WINDOW_SECS = 1_800;
    uint256 internal constant CORROBORATION_BONUS_BPS = 15_000;
    uint32 internal constant CORROBORATION_MIN_SOURCES = 2;
    uint256 internal constant NUM_CLASSES = 8;

    uint256 internal constant T3 = 7_500;
    uint256 internal constant T2 = 4_500;
    uint256 internal constant THREAT_MULT = 10_000;

    function _classWeight(uint256 c) internal pure returns (uint256) {
        if (c == 0) return 4_000;
        if (c == 1) return 9_000;
        if (c == 2) return 9_500;
        if (c == 3) return 10_000;
        if (c == 4) return 8_500;
        if (c == 5) return 6_000;
        if (c == 6) return 5_000;
        if (c == 7) return 10_000;
        return 0;
    }

    function _sourceWeight(uint256 s) internal pure returns (uint256) {
        if (s == 0) return 9_000;
        if (s == 1) return 9_500;
        if (s == 2) return 9_500;
        if (s == 3) return 10_000;
        if (s == 4) return 8_000;
        if (s == 5) return 7_000;
        if (s == 6) return 4_000;
        return 0;
    }

    function _autoFire(uint256 c) internal pure returns (bool) {
        return c == 3 || c == 7;
    }

    function _decayBps(uint256 age) internal pure returns (uint256) {
        if (age >= DECAY_WINDOW_SECS) return 0;
        return ((DECAY_WINDOW_SECS - age) * BPS) / DECAY_WINDOW_SECS;
    }

    function _clamp(uint256 v) internal pure returns (uint256) {
        return v > BPS ? BPS : v;
    }

    function _popcount(uint32 x) internal pure returns (uint32 count) {
        while (x != 0) {
            x &= (x - 1);
            count++;
        }
    }

    /// @notice Identical algorithm to `compute_score` in the Rust core.
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

        uint256[8] memory classAgg;
        uint32[8] memory classMask;

        for (uint256 i = 0; i < sources.length; i++) {
            uint256 c = classes[i];
            if (c >= NUM_CLASSES) continue;
            uint256 s = sources[i];
            uint256 sw = _sourceWeight(s);
            if (s < 32) classMask[c] |= uint32(1) << uint32(s);

            uint256 contribution = _clamp(severitiesBps[i]);
            contribution = (contribution * _clamp(confidencesBps[i])) / BPS;
            contribution = (contribution * sw) / BPS;
            contribution = (contribution * _classWeight(c)) / BPS;
            contribution = (contribution * _decayBps(agesSecs[i])) / BPS;

            classAgg[c] += contribution;
        }

        bool autoFire = false;
        uint256 total = 0;
        for (uint256 c = 0; c < NUM_CLASSES; c++) {
            uint32 distinct = _popcount(classMask[c]);
            uint256 agg = classAgg[c];
            bool corroborated = distinct >= CORROBORATION_MIN_SOURCES;
            if (corroborated) {
                agg = (agg * CORROBORATION_BONUS_BPS) / BPS;
            }
            if (_autoFire(c) && agg > 0 && (corroborated || agg >= T3)) {
                autoFire = true;
            }
            total += agg;
        }

        scoreBps = _clamp((total * THREAT_MULT) / BPS);

        if (autoFire || scoreBps >= T3) {
            tier = 3;
            exitFlag = true;
        } else if (scoreBps >= T2) {
            tier = 2;
            exitFlag = false;
        } else if (scoreBps > 0) {
            tier = 1;
            exitFlag = false;
        } else {
            tier = 0;
            exitFlag = false;
        }
    }
}
