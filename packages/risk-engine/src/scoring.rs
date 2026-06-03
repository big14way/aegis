//! Pure, deterministic risk-scoring core for the Aegis guardian.
//!
//! This module is intentionally free of any Stylus / storage dependencies. It
//! operates only on `core` + `alloc` and plain integer arithmetic, which means:
//!
//!   1. It compiles to `wasm32-unknown-unknown` inside the Stylus contract.
//!   2. It is unit-testable with a plain `cargo test` (see the `#[cfg(test)]`
//!      block at the bottom) WITHOUT the Stylus toolchain or Docker.
//!   3. The exact same logic can be mirrored off-chain by the TypeScript agent
//!      for previewing decisions — but the on-chain result is the source of truth.
//!
//! All quantities are fixed-point in **basis points** (`bps`), where
//! `10_000 bps = 1.0`. Scores are clamped to the range `[0, 10_000]`.
//!
//! ## Why this belongs in Stylus
//!
//! The scoring routine performs nested iteration over every inbound signal,
//! per-attack-class aggregation, a distinct-source corroboration bonus computed
//! from a popcount over a source bitmask, linear time-decay math, and a global
//! threat-environment multiplier. That is precisely the "compute-heavy,
//! storage-light" workload Arbitrum's own guidance says to push into Stylus —
//! the EVM would pay dearly for the arithmetic, while Stylus prices compute
//! 10–100x cheaper. The reference project this improves upon ran all of this in
//! an opaque off-chain TypeScript backend; Aegis makes the decision verifiable.

#![allow(clippy::needless_range_loop)]

extern crate alloc;
use alloc::vec::Vec;

/// Number of attack classes the engine understands. Index = class id.
pub const NUM_CLASSES: usize = 8;

/// Basis-point scale: `10_000 == 1.0`.
pub const BPS: u128 = 10_000;

/// Linear time-decay window in seconds. A signal older than this contributes
/// nothing; a brand-new signal contributes at full weight. Crisis response is
/// inherently time-sensitive, so we never trust a stale alert at face value.
pub const DECAY_WINDOW_SECS: u128 = 1_800; // 30 minutes

/// Corroboration multiplier (in bps) applied to a class whose signals come from
/// at least `CORROBORATION_MIN_SOURCES` *distinct* sources. Two independent
/// detectors agreeing is far stronger evidence than one detector shouting twice.
pub const CORROBORATION_BONUS_BPS: u128 = 15_000; // 1.5x
pub const CORROBORATION_MIN_SOURCES: u32 = 2;

/// Response tiers returned alongside the score.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tier {
    /// No actionable risk.
    None = 0,
    /// T1 — notify the user.
    Alert = 1,
    /// T2 — request user confirmation within a time window.
    Confirm = 2,
    /// T3 — auto-fire the bounded exit immediately.
    AutoFire = 3,
}

impl Tier {
    pub const fn as_u8(self) -> u8 {
        self as u8
    }
}

/// Canonical attack-class ids. Kept in sync with `classes.ts` on the agent side.
pub mod class {
    pub const UNKNOWN: u8 = 0;
    pub const FLASH_LOAN_ORACLE: u8 = 1;
    pub const ACCESS_CONTROL: u8 = 2;
    pub const BRIDGE_VERIFIER: u8 = 3;
    pub const SUPPLY_CHAIN: u8 = 4;
    pub const GOVERNANCE: u8 = 5;
    pub const SPOOF_TOKEN: u8 = 6;
    pub const DPRK: u8 = 7;
}

/// Engine configuration, read from contract storage and passed into the pure core.
/// Holding this on-chain is what makes every decision auditable and reproducible.
#[derive(Clone, Debug)]
pub struct ScoringConfig {
    /// Per-attack-class weight in bps. Index = class id.
    pub class_weight_bps: [u128; NUM_CLASSES],
    /// Per-source trust weight in bps. Index = source id (0..32).
    pub source_weight_bps: Vec<u128>,
    /// If `auto_fire_class[c]` is true, a corroborated signal of class `c`
    /// forces T3 regardless of the numeric score. Used for attack classes whose
    /// historical fund-recovery rate is ~zero (bridge-verifier, DPRK-attributed),
    /// where waiting for a confirmation window is strictly worse than exiting.
    pub auto_fire_class: [bool; NUM_CLASSES],
    /// Global threat-environment multiplier in bps. Ratchets up after a major
    /// market-wide incident so borderline signals fire faster.
    pub threat_multiplier_bps: u128,
    /// Score at/above which the engine returns T3 (auto-fire).
    pub tier3_threshold_bps: u128,
    /// Score at/above which the engine returns T2 (confirm).
    pub tier2_threshold_bps: u128,
}

impl ScoringConfig {
    /// Sensible production-leaning defaults. The deployer can override every
    /// value on-chain after deployment.
    pub fn default_config() -> Self {
        let mut class_weight_bps = [0u128; NUM_CLASSES];
        class_weight_bps[class::UNKNOWN as usize] = 4_000; // 0.40
        class_weight_bps[class::FLASH_LOAN_ORACLE as usize] = 9_000; // 0.90
        class_weight_bps[class::ACCESS_CONTROL as usize] = 9_500; // 0.95
        class_weight_bps[class::BRIDGE_VERIFIER as usize] = 10_000; // 1.00
        class_weight_bps[class::SUPPLY_CHAIN as usize] = 8_500; // 0.85
        class_weight_bps[class::GOVERNANCE as usize] = 6_000; // 0.60
        class_weight_bps[class::SPOOF_TOKEN as usize] = 5_000; // 0.50
        class_weight_bps[class::DPRK as usize] = 10_000; // 1.00

        let mut auto_fire_class = [false; NUM_CLASSES];
        auto_fire_class[class::BRIDGE_VERIFIER as usize] = true;
        auto_fire_class[class::DPRK as usize] = true;

        // Default source trust weights (indices map to `source` ids in the agent).
        // 0 Forta, 1 Hypernative, 2 Cyvers, 3 Chainlink-deviation, 4 on-chain
        // utilization, 5 governance feed, 6 social/Twitter.
        let source_weight_bps = alloc::vec![
            9_000, // Forta
            9_500, // Hypernative
            9_500, // Cyvers
            10_000, // Chainlink oracle deviation (hard on-chain evidence)
            8_000, // on-chain utilization spike
            7_000, // governance feed
            4_000, // social / Twitter (weakest, easily spoofed)
        ];

        Self {
            class_weight_bps,
            source_weight_bps,
            auto_fire_class,
            threat_multiplier_bps: 10_000, // 1.0x baseline
            tier3_threshold_bps: 7_500,    // 0.75
            tier2_threshold_bps: 4_500,    // 0.45
        }
    }
}

/// A single inbound threat signal, decoded from the ABI parallel-array call args.
#[derive(Clone, Copy, Debug)]
pub struct Signal {
    /// Source id (0..32). Indexes `source_weight_bps` and the corroboration bitmask.
    pub source: u8,
    /// Attack-class id (0..NUM_CLASSES).
    pub class: u8,
    /// Reported severity in bps (0..10_000).
    pub severity_bps: u128,
    /// Detector confidence in bps (0..10_000).
    pub confidence_bps: u128,
    /// Age of the signal in seconds (drives time-decay).
    pub age_secs: u128,
}

/// Result of a scoring run.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ScoreResult {
    /// Final corroborated risk score in bps, clamped to `[0, 10_000]`.
    pub score_bps: u128,
    /// Response tier.
    pub tier: Tier,
    /// Whether the bounded exit should fire now (true iff tier == AutoFire).
    pub exit_flag: bool,
}

/// Linear time-decay factor in bps for a signal of the given age.
/// `age == 0` -> 10_000 (full); `age >= DECAY_WINDOW_SECS` -> 0.
#[inline]
fn decay_bps(age_secs: u128) -> u128 {
    if age_secs >= DECAY_WINDOW_SECS {
        0
    } else {
        // (window - age) / window, in bps
        ((DECAY_WINDOW_SECS - age_secs) * BPS) / DECAY_WINDOW_SECS
    }
}

/// Clamp a bps value into `[0, 10_000]`.
#[inline]
fn clamp_bps(v: u128) -> u128 {
    if v > BPS {
        BPS
    } else {
        v
    }
}

/// The core scoring routine. Pure, deterministic, panic-free for valid inputs.
///
/// Algorithm:
///   1. For each signal, compute a weighted contribution:
///        severity x confidence x source_weight x class_weight x time_decay
///      (each factor in bps, normalized back down by BPS after each multiply).
///   2. Aggregate contributions per attack class, and track the set of distinct
///      sources per class via a 32-bit bitmask.
///   3. Apply the corroboration bonus to any class seen from >= 2 distinct sources.
///   4. Sum class aggregates, apply the global threat multiplier, clamp to 10_000.
///   5. Decide auto-fire: any corroborated signal in an `auto_fire_class` forces T3.
///      Otherwise derive the tier from the score thresholds.
pub fn compute_score(signals: &[Signal], cfg: &ScoringConfig) -> ScoreResult {
    let mut class_aggregate = [0u128; NUM_CLASSES];
    let mut class_source_mask = [0u32; NUM_CLASSES];

    for s in signals {
        let class_idx = s.class as usize;
        if class_idx >= NUM_CLASSES {
            continue; // ignore unknown class ids defensively
        }
        let source_idx = s.source as usize;
        let source_weight = if source_idx < cfg.source_weight_bps.len() {
            cfg.source_weight_bps[source_idx]
        } else {
            0
        };

        let severity = clamp_bps(s.severity_bps);
        let confidence = clamp_bps(s.confidence_bps);
        let class_weight = cfg.class_weight_bps[class_idx];
        let decay = decay_bps(s.age_secs);

        // Chained bps multiply, normalizing by BPS after each step to stay in range.
        let mut contribution = severity;
        contribution = (contribution * confidence) / BPS;
        contribution = (contribution * source_weight) / BPS;
        contribution = (contribution * class_weight) / BPS;
        contribution = (contribution * decay) / BPS;

        // Only a signal that actually contributes evidence counts toward the
        // distinct-source corroboration set. A zero-weight / unconfigured source
        // (or a fully-decayed signal) contributes nothing and must NOT be able to
        // flip a corroboration bit and forge a x1.5 bonus / auto-fire.
        if contribution > 0 && source_idx < 32 {
            class_source_mask[class_idx] |= 1u32 << source_idx;
        }

        class_aggregate[class_idx] = class_aggregate[class_idx].saturating_add(contribution);
    }

    // Corroboration bonus + auto-fire detection.
    let mut auto_fire = false;
    let mut total: u128 = 0;
    for c in 0..NUM_CLASSES {
        let distinct_sources = class_source_mask[c].count_ones();
        let mut agg = class_aggregate[c];
        let corroborated = distinct_sources >= CORROBORATION_MIN_SOURCES;
        if corroborated {
            agg = (agg * CORROBORATION_BONUS_BPS) / BPS;
        }
        // An auto-fire class fires when corroborated, OR when a single source is
        // already extremely confident (agg above the T3 threshold on its own).
        if cfg.auto_fire_class[c] && agg > 0 && (corroborated || agg >= cfg.tier3_threshold_bps) {
            auto_fire = true;
        }
        total = total.saturating_add(agg);
    }

    // Apply the global threat-environment multiplier and clamp.
    let score = clamp_bps((total * cfg.threat_multiplier_bps) / BPS);

    let (tier, exit_flag) = if auto_fire || score >= cfg.tier3_threshold_bps {
        (Tier::AutoFire, true)
    } else if score >= cfg.tier2_threshold_bps {
        (Tier::Confirm, false)
    } else if score > 0 {
        (Tier::Alert, false)
    } else {
        (Tier::None, false)
    };

    ScoreResult {
        score_bps: score,
        tier,
        exit_flag,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sig(source: u8, class: u8, sev: u128, conf: u128, age: u128) -> Signal {
        Signal {
            source,
            class,
            severity_bps: sev,
            confidence_bps: conf,
            age_secs: age,
        }
    }

    #[test]
    fn zzz_verify_zero_weight_corroboration() {
        let cfg = ScoringConfig::default_config();
        let one = compute_score(&[sig(0, class::BRIDGE_VERIFIER, 6_000, 6_000, 0)], &cfg);
        std::println!("ONE: score={} tier={:?} exit={}", one.score_bps, one.tier as u8, one.exit_flag);
        let two = compute_score(
            &[
                sig(0, class::BRIDGE_VERIFIER, 6_000, 6_000, 0),
                sig(10, class::BRIDGE_VERIFIER, 9_000, 9_000, 0),
            ],
            &cfg,
        );
        std::println!("TWO: score={} tier={:?} exit={}", two.score_bps, two.tier as u8, two.exit_flag);
        assert!(!one.exit_flag, "single signal should NOT fire");
        assert!(two.exit_flag, "junk zero-weight source flips exit to true");
    }

    #[test]
    fn empty_signals_yield_none() {
        let cfg = ScoringConfig::default_config();
        let r = compute_score(&[], &cfg);
        assert_eq!(r.score_bps, 0);
        assert_eq!(r.tier, Tier::None);
        assert!(!r.exit_flag);
    }

    #[test]
    fn decay_is_monotonic() {
        assert_eq!(decay_bps(0), 10_000);
        assert!(decay_bps(600) > decay_bps(1_200));
        assert_eq!(decay_bps(DECAY_WINDOW_SECS), 0);
        assert_eq!(decay_bps(DECAY_WINDOW_SECS + 10_000), 0);
    }

    #[test]
    fn single_weak_social_signal_is_only_an_alert() {
        let cfg = ScoringConfig::default_config();
        // Source 6 = social (weight 0.40), spoof-token class (weight 0.50).
        let r = compute_score(&[sig(6, class::SPOOF_TOKEN, 6_000, 5_000, 0)], &cfg);
        assert_eq!(r.tier, Tier::Alert);
        assert!(!r.exit_flag);
    }

    #[test]
    fn two_distinct_sources_corroborate_and_escalate() {
        let cfg = ScoringConfig::default_config();
        let one = compute_score(&[sig(0, class::FLASH_LOAN_ORACLE, 9_000, 9_000, 0)], &cfg);
        let two = compute_score(
            &[
                sig(0, class::FLASH_LOAN_ORACLE, 9_000, 9_000, 0),
                sig(2, class::FLASH_LOAN_ORACLE, 9_000, 9_000, 0),
            ],
            &cfg,
        );
        // The corroborated pair must score strictly higher than the lone signal.
        assert!(two.score_bps > one.score_bps);
        // Same source twice must NOT earn the corroboration bonus.
        let dup = compute_score(
            &[
                sig(0, class::FLASH_LOAN_ORACLE, 9_000, 9_000, 0),
                sig(0, class::FLASH_LOAN_ORACLE, 9_000, 9_000, 0),
            ],
            &cfg,
        );
        assert!(dup.score_bps < two.score_bps);
    }

    #[test]
    fn zero_weight_source_cannot_forge_corroboration() {
        let cfg = ScoringConfig::default_config();
        // Source 0 (Forta, weighted) plus source 9 (unconfigured -> weight 0).
        // The zero-weight source contributes nothing, so the class must be seen
        // from only ONE effective distinct source: no x1.5 bonus, no auto-fire.
        let forged = compute_score(
            &[
                sig(0, class::BRIDGE_VERIFIER, 8_000, 8_000, 0),
                sig(9, class::BRIDGE_VERIFIER, 8_000, 8_000, 0),
            ],
            &cfg,
        );
        let lone = compute_score(&[sig(0, class::BRIDGE_VERIFIER, 8_000, 8_000, 0)], &cfg);
        assert_eq!(
            forged.score_bps, lone.score_bps,
            "an unweighted source must not change the score"
        );
        assert!(!forged.exit_flag, "zero-weight source must not force auto-fire");
        assert_ne!(forged.tier, Tier::AutoFire);
    }

    #[test]
    fn corroborated_bridge_verifier_auto_fires() {
        let cfg = ScoringConfig::default_config();
        let r = compute_score(
            &[
                sig(0, class::BRIDGE_VERIFIER, 8_000, 8_000, 0),
                sig(1, class::BRIDGE_VERIFIER, 8_000, 8_000, 0),
            ],
            &cfg,
        );
        assert_eq!(r.tier, Tier::AutoFire);
        assert!(r.exit_flag);
    }

    #[test]
    fn dprk_class_is_treated_as_terminal() {
        let cfg = ScoringConfig::default_config();
        let r = compute_score(
            &[
                sig(1, class::DPRK, 9_000, 9_000, 0),
                sig(2, class::DPRK, 9_000, 9_000, 0),
            ],
            &cfg,
        );
        assert!(r.exit_flag);
        assert_eq!(r.tier, Tier::AutoFire);
    }

    #[test]
    fn threat_multiplier_pushes_borderline_over_the_line() {
        let mut cfg = ScoringConfig::default_config();
        let base = compute_score(&[sig(0, class::ACCESS_CONTROL, 6_000, 7_000, 0)], &cfg);
        cfg.threat_multiplier_bps = 15_000; // 1.5x ratchet after a market-wide incident
        let elevated = compute_score(&[sig(0, class::ACCESS_CONTROL, 6_000, 7_000, 0)], &cfg);
        assert!(elevated.score_bps > base.score_bps);
    }

    #[test]
    fn stale_signals_do_not_fire() {
        let cfg = ScoringConfig::default_config();
        let r = compute_score(
            &[sig(0, class::FLASH_LOAN_ORACLE, 10_000, 10_000, DECAY_WINDOW_SECS + 1)],
            &cfg,
        );
        assert_eq!(r.score_bps, 0);
        assert_eq!(r.tier, Tier::None);
    }

    #[test]
    fn score_never_exceeds_full_scale() {
        let cfg = ScoringConfig::default_config();
        let many = alloc::vec![sig(3, class::BRIDGE_VERIFIER, 10_000, 10_000, 0); 20];
        let r = compute_score(&many, &cfg);
        assert!(r.score_bps <= BPS);
    }
}
