// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title  ScoringLib
/// @notice The Aegis risk-scoring core as a pure Solidity library — a faithful,
///         byte-for-byte port of `packages/risk-engine/src/scoring.rs`. It is the
///         single Solidity source of truth for the algorithm, shared by:
///           - `ReferenceScorerSol` (the Stylus-vs-Solidity gas benchmark), and
///           - `LocalRiskEngine` (the on-chain engine used on non-Stylus chains /
///             local anvil, exposing the identical `IRiskEngine` ABI as Stylus).
///
///         Keeping one implementation here means the gas baseline, the local
///         engine, and the Rust/Stylus engine cannot silently drift apart.
library ScoringLib {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant DECAY_WINDOW_SECS = 1_800;
    uint256 internal constant CORROBORATION_BONUS_BPS = 15_000;
    uint32 internal constant CORROBORATION_MIN_SOURCES = 2;
    uint256 internal constant NUM_CLASSES = 8;

    /// @notice Mutable scoring configuration (mirrors `ScoringConfig` in Rust).
    struct Config {
        uint256[8] classWeightBps;
        uint256[] sourceWeightBps;
        bool[8] autoFireClass;
        uint256 threatMultBps;
        uint256 t3Bps;
        uint256 t2Bps;
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

    function _sourceWeight(Config memory cfg, uint256 s) internal pure returns (uint256) {
        return s < cfg.sourceWeightBps.length ? cfg.sourceWeightBps[s] : 0;
    }

    /// @notice Identical algorithm to `compute_score` in scoring.rs.
    /// @dev    `sources/classes/severitiesBps/confidencesBps/agesSecs` are
    ///         parallel arrays; the caller validates equal lengths.
    function computeScore(
        uint8[] calldata sources,
        uint8[] calldata classes,
        uint256[] calldata severitiesBps,
        uint256[] calldata confidencesBps,
        uint256[] calldata agesSecs,
        Config memory cfg
    ) internal pure returns (uint256 scoreBps, uint8 tier, bool exitFlag) {
        uint256[8] memory classAgg;
        uint32[8] memory classMask;

        for (uint256 i = 0; i < sources.length; i++) {
            uint256 c = classes[i];
            if (c >= NUM_CLASSES) continue;
            uint256 s = sources[i];

            uint256 contribution = _clamp(severitiesBps[i]);
            contribution = (contribution * _clamp(confidencesBps[i])) / BPS;
            contribution = (contribution * _sourceWeight(cfg, s)) / BPS;
            contribution = (contribution * cfg.classWeightBps[c]) / BPS;
            contribution = (contribution * _decayBps(agesSecs[i])) / BPS;

            // Only a contributing signal counts toward corroboration (mirrors
            // scoring.rs): a zero-weight source or fully-decayed signal must not
            // forge a distinct-source corroboration bonus.
            if (contribution > 0 && s < 32) classMask[c] |= uint32(1) << uint32(s);

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
            if (cfg.autoFireClass[c] && agg > 0 && (corroborated || agg >= cfg.t3Bps)) {
                autoFire = true;
            }
            total += agg;
        }

        scoreBps = _clamp((total * cfg.threatMultBps) / BPS);

        if (autoFire || scoreBps >= cfg.t3Bps) {
            tier = 3;
            exitFlag = true;
        } else if (scoreBps >= cfg.t2Bps) {
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

    /// @notice The production-leaning genesis config (mirrors
    ///         `ScoringConfig::default_config()` in scoring.rs exactly).
    function defaultConfig() internal pure returns (Config memory cfg) {
        cfg.classWeightBps = [
            uint256(4_000), // 0 UNKNOWN
            9_000, // 1 FLASH_LOAN_ORACLE
            9_500, // 2 ACCESS_CONTROL
            10_000, // 3 BRIDGE_VERIFIER
            8_500, // 4 SUPPLY_CHAIN
            6_000, // 5 GOVERNANCE
            5_000, // 6 SPOOF_TOKEN
            10_000 // 7 DPRK
        ];
        cfg.sourceWeightBps = new uint256[](7);
        cfg.sourceWeightBps[0] = 9_000; // Forta
        cfg.sourceWeightBps[1] = 9_500; // Hypernative
        cfg.sourceWeightBps[2] = 9_500; // Cyvers
        cfg.sourceWeightBps[3] = 10_000; // Chainlink deviation
        cfg.sourceWeightBps[4] = 8_000; // on-chain utilization
        cfg.sourceWeightBps[5] = 7_000; // governance feed
        cfg.sourceWeightBps[6] = 4_000; // social / Twitter
        cfg.autoFireClass[3] = true; // BRIDGE_VERIFIER
        cfg.autoFireClass[7] = true; // DPRK
        cfg.threatMultBps = 10_000; // 1.0x
        cfg.t3Bps = 7_500; // 0.75
        cfg.t2Bps = 4_500; // 0.45
    }
}
