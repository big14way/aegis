//! # Aegis Risk Engine — Arbitrum Stylus contract
//!
//! The verifiable brain of the Aegis guardian. It holds the scoring
//! configuration on-chain (every weight and threshold is publicly auditable)
//! and exposes a deterministic `score()` view that turns a batch of threat
//! signals into a `(risk_score, tier, exit_flag)` decision.
//!
//! The Solidity executor (`AegisVault`) reads this decision via a static call
//! before it is allowed to move a single token, so the "should we exit?"
//! judgement lives in transparent, reproducible Rust rather than an opaque
//! off-chain backend. This is the core improvement over the reference design.
//!
//! Built with `stylus-sdk = 0.10.0`. See `scoring.rs` for the pure, separately
//! unit-tested math.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

mod scoring;

use alloc::vec::Vec;
use scoring::{compute_score, ScoringConfig, Signal, Tier, BPS, NUM_CLASSES};
use stylus_sdk::{
    alloy_primitives::{Address, U256},
    alloy_sol_types::sol,
    prelude::*,
};

sol_storage! {
    #[entrypoint]
    pub struct RiskEngine {
        /// Contract owner; the only address allowed to mutate configuration.
        address owner;
        /// One-time initialization guard.
        bool initialized;
        /// Emergency pause for configuration changes (scoring stays available).
        bool paused;
        /// Global threat-environment multiplier in bps (10_000 = 1.0x).
        uint256 threat_multiplier_bps;
        /// Score at/above which the engine returns T3 (auto-fire).
        uint256 tier3_threshold_bps;
        /// Score at/above which the engine returns T2 (confirm).
        uint256 tier2_threshold_bps;
        /// Number of configured signal sources (length of source_weight_bps).
        uint256 source_count;
        /// class id -> weight in bps.
        mapping(uint256 => uint256) class_weight_bps;
        /// source id -> trust weight in bps.
        mapping(uint256 => uint256) source_weight_bps;
        /// class id -> whether a corroborated signal of this class forces T3.
        mapping(uint256 => bool) auto_fire_class;
    }
}

sol! {
    /// Emitted by `evaluate` when a decision is explicitly recorded on-chain.
    event DecisionScored(uint256 score_bps, uint8 tier, bool exit_flag, uint256 signal_count);
    /// Emitted whenever configuration changes.
    event ConfigUpdated(address indexed by);
    /// Emitted once at initialization.
    event Initialized(address indexed owner);

    error AlreadyInitialized();
    error NotOwner();
    error Paused();
    error LengthMismatch();
    error InvalidThresholds();
}

/// Rich error type, ABI-encoded as Solidity custom errors.
#[derive(SolidityError)]
pub enum AegisError {
    AlreadyInitialized(AlreadyInitialized),
    NotOwner(NotOwner),
    Paused(Paused),
    LengthMismatch(LengthMismatch),
    InvalidThresholds(InvalidThresholds),
}

#[public]
impl RiskEngine {
    /// One-time initializer. Sets the caller as owner and writes the default
    /// scoring configuration. Stylus contracts have no Solidity-style
    /// constructor, so this must be called exactly once immediately after
    /// activation (the deploy script does this atomically).
    pub fn init(&mut self) -> Result<(), AegisError> {
        if self.initialized.get() {
            return Err(AegisError::AlreadyInitialized(AlreadyInitialized {}));
        }
        let caller = self.vm().msg_sender();
        self.owner.set(caller);
        self.initialized.set(true);

        let cfg = ScoringConfig::default_config();
        self.threat_multiplier_bps
            .set(U256::from(cfg.threat_multiplier_bps));
        self.tier3_threshold_bps
            .set(U256::from(cfg.tier3_threshold_bps));
        self.tier2_threshold_bps
            .set(U256::from(cfg.tier2_threshold_bps));
        for c in 0..NUM_CLASSES {
            self.class_weight_bps
                .setter(U256::from(c))
                .set(U256::from(cfg.class_weight_bps[c]));
            self.auto_fire_class
                .setter(U256::from(c))
                .set(cfg.auto_fire_class[c]);
        }
        self.source_count
            .set(U256::from(cfg.source_weight_bps.len()));
        for (i, w) in cfg.source_weight_bps.iter().enumerate() {
            self.source_weight_bps
                .setter(U256::from(i))
                .set(U256::from(*w));
        }

        self.vm().log(Initialized { owner: caller });
        Ok(())
    }

    /// Pure, read-only scoring. Accepts threat signals as parallel arrays
    /// (cheapest, most robust ABI shape) and returns `(score_bps, tier, exit_flag)`.
    ///
    /// `tier`: 0 = none, 1 = alert (T1), 2 = confirm (T2), 3 = auto-fire (T3).
    ///
    /// This is the function the executor static-calls and the dashboard reads.
    pub fn score(
        &self,
        sources: Vec<u8>,
        classes: Vec<u8>,
        severities_bps: Vec<U256>,
        confidences_bps: Vec<U256>,
        ages_secs: Vec<U256>,
    ) -> Result<(U256, u8, bool), AegisError> {
        let signals = self.build_signals(
            &sources,
            &classes,
            &severities_bps,
            &confidences_bps,
            &ages_secs,
        )?;
        let cfg = self.load_config();
        let result = compute_score(&signals, &cfg);
        Ok((
            U256::from(result.score_bps),
            result.tier.as_u8(),
            result.exit_flag,
        ))
    }

    /// Same computation as `score`, but mutates nothing except emitting an
    /// on-chain `DecisionScored` event so a fired decision leaves an immutable
    /// audit trail. Returns the same tuple.
    pub fn evaluate(
        &mut self,
        sources: Vec<u8>,
        classes: Vec<u8>,
        severities_bps: Vec<U256>,
        confidences_bps: Vec<U256>,
        ages_secs: Vec<U256>,
    ) -> Result<(U256, u8, bool), AegisError> {
        let signal_count = sources.len();
        let signals = self.build_signals(
            &sources,
            &classes,
            &severities_bps,
            &confidences_bps,
            &ages_secs,
        )?;
        let cfg = self.load_config();
        let result = compute_score(&signals, &cfg);
        self.vm().log(DecisionScored {
            score_bps: U256::from(result.score_bps),
            tier: result.tier.as_u8(),
            exit_flag: result.exit_flag,
            signal_count: U256::from(signal_count),
        });
        Ok((
            U256::from(result.score_bps),
            result.tier.as_u8(),
            result.exit_flag,
        ))
    }

    /// Pure helper: absolute deviation between an observed and an expected price,
    /// expressed in bps. Used to convert a Chainlink reading (performed by the
    /// Solidity executor) into a severity score the engine understands.
    pub fn deviation_bps(&self, observed: U256, expected: U256) -> U256 {
        if expected.is_zero() {
            return U256::ZERO;
        }
        let diff = if observed > expected {
            observed - expected
        } else {
            expected - observed
        };
        let dev = (diff * U256::from(BPS)) / expected;
        if dev > U256::from(BPS) {
            U256::from(BPS)
        } else {
            dev
        }
    }

    // ----------------------------- views ---------------------------------

    pub fn owner(&self) -> Address {
        self.owner.get()
    }

    pub fn paused(&self) -> bool {
        self.paused.get()
    }

    pub fn threat_multiplier_bps(&self) -> U256 {
        self.threat_multiplier_bps.get()
    }

    pub fn thresholds(&self) -> (U256, U256) {
        (
            self.tier3_threshold_bps.get(),
            self.tier2_threshold_bps.get(),
        )
    }

    pub fn class_weight(&self, class_id: U256) -> U256 {
        self.class_weight_bps.get(class_id)
    }

    pub fn source_weight(&self, source_id: U256) -> U256 {
        self.source_weight_bps.get(source_id)
    }

    pub fn is_auto_fire_class(&self, class_id: U256) -> bool {
        self.auto_fire_class.get(class_id)
    }

    // -------------------------- owner setters -----------------------------

    /// Ratchet the global threat-environment multiplier up or down (bps).
    pub fn set_threat_multiplier(&mut self, value_bps: U256) -> Result<(), AegisError> {
        self.only_owner_when_active()?;
        self.threat_multiplier_bps.set(value_bps);
        self.emit_config_updated();
        Ok(())
    }

    /// Update the T3/T2 score thresholds (bps). Requires `t3 >= t2`.
    pub fn set_thresholds(&mut self, t3_bps: U256, t2_bps: U256) -> Result<(), AegisError> {
        self.only_owner_when_active()?;
        if t3_bps < t2_bps {
            return Err(AegisError::InvalidThresholds(InvalidThresholds {}));
        }
        self.tier3_threshold_bps.set(t3_bps);
        self.tier2_threshold_bps.set(t2_bps);
        self.emit_config_updated();
        Ok(())
    }

    pub fn set_class_weight(&mut self, class_id: U256, weight_bps: U256) -> Result<(), AegisError> {
        self.only_owner_when_active()?;
        self.class_weight_bps.setter(class_id).set(weight_bps);
        self.emit_config_updated();
        Ok(())
    }

    pub fn set_source_weight(
        &mut self,
        source_id: U256,
        weight_bps: U256,
    ) -> Result<(), AegisError> {
        self.only_owner_when_active()?;
        self.source_weight_bps.setter(source_id).set(weight_bps);
        if source_id >= self.source_count.get() {
            self.source_count.set(source_id + U256::from(1));
        }
        self.emit_config_updated();
        Ok(())
    }

    pub fn set_auto_fire_class(
        &mut self,
        class_id: U256,
        enabled: bool,
    ) -> Result<(), AegisError> {
        self.only_owner_when_active()?;
        self.auto_fire_class.setter(class_id).set(enabled);
        self.emit_config_updated();
        Ok(())
    }

    pub fn set_paused(&mut self, value: bool) -> Result<(), AegisError> {
        self.only_owner()?;
        self.paused.set(value);
        Ok(())
    }

    pub fn transfer_ownership(&mut self, new_owner: Address) -> Result<(), AegisError> {
        self.only_owner()?;
        self.owner.set(new_owner);
        self.emit_config_updated();
        Ok(())
    }
}

impl RiskEngine {
    /// Internal: assert the caller is the owner (independent of pause state).
    /// Pause and ownership controls use this guard so that a paused engine can
    /// always be unpaused or handed over — config mutators use
    /// `only_owner_when_active` instead.
    fn only_owner(&self) -> Result<(), AegisError> {
        if self.vm().msg_sender() != self.owner.get() {
            return Err(AegisError::NotOwner(NotOwner {}));
        }
        Ok(())
    }

    /// Internal: owner-only AND not paused. Used by every scoring-config mutator
    /// so that pausing freezes configuration without ever locking out the
    /// owner's ability to unpause (`set_paused`) or transfer ownership.
    fn only_owner_when_active(&self) -> Result<(), AegisError> {
        self.only_owner()?;
        if self.paused.get() {
            return Err(AegisError::Paused(Paused {}));
        }
        Ok(())
    }

    fn emit_config_updated(&self) {
        self.vm().log(ConfigUpdated {
            by: self.vm().msg_sender(),
        });
    }

    /// Validate parallel-array lengths and assemble `Signal`s.
    fn build_signals(
        &self,
        sources: &[u8],
        classes: &[u8],
        severities_bps: &[U256],
        confidences_bps: &[U256],
        ages_secs: &[U256],
    ) -> Result<Vec<Signal>, AegisError> {
        let n = sources.len();
        if classes.len() != n
            || severities_bps.len() != n
            || confidences_bps.len() != n
            || ages_secs.len() != n
        {
            return Err(AegisError::LengthMismatch(LengthMismatch {}));
        }
        let mut signals = Vec::with_capacity(n);
        for i in 0..n {
            signals.push(Signal {
                source: sources[i],
                class: classes[i],
                severity_bps: u256_to_u128_clamped(severities_bps[i]),
                confidence_bps: u256_to_u128_clamped(confidences_bps[i]),
                age_secs: u256_to_u128_clamped(ages_secs[i]),
            });
        }
        Ok(signals)
    }

    /// Read the full scoring configuration out of storage.
    fn load_config(&self) -> ScoringConfig {
        let mut class_weight_bps = [0u128; NUM_CLASSES];
        let mut auto_fire_class = [false; NUM_CLASSES];
        for c in 0..NUM_CLASSES {
            class_weight_bps[c] = self.class_weight_bps.get(U256::from(c)).to::<u128>();
            auto_fire_class[c] = self.auto_fire_class.get(U256::from(c));
        }
        let source_count = self.source_count.get().to::<usize>();
        let mut source_weight_bps = Vec::with_capacity(source_count);
        for s in 0..source_count {
            source_weight_bps.push(self.source_weight_bps.get(U256::from(s)).to::<u128>());
        }
        ScoringConfig {
            class_weight_bps,
            source_weight_bps,
            auto_fire_class,
            threat_multiplier_bps: self.threat_multiplier_bps.get().to::<u128>(),
            tier3_threshold_bps: self.tier3_threshold_bps.get().to::<u128>(),
            tier2_threshold_bps: self.tier2_threshold_bps.get().to::<u128>(),
        }
    }
}

/// Saturating conversion from U256 to u128 (our bps quantities never exceed
/// 10_000, so saturation only ever guards against malformed input).
fn u256_to_u128_clamped(v: U256) -> u128 {
    let max = U256::from(u128::MAX);
    if v > max {
        u128::MAX
    } else {
        v.to::<u128>()
    }
}

// Re-export the tier enum discriminants for downstream tests/consumers.
#[allow(dead_code)]
const _: () = {
    assert!(Tier::None.as_u8() == 0);
};

// Note: the `#[public]` macro auto-generates `pub fn print_from_args()` under the
// `export-abi` feature; the `src/main.rs` bin target calls it. We deliberately do
// NOT define one here (that would be a duplicate — E0428).
