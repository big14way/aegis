/**
 * Signal taxonomy — kept in lock-step with the Rust scoring core
 * (`packages/risk-engine/src/scoring.rs`). The numeric ids MUST match, because
 * the engine indexes its on-chain class/source weight tables by these ids.
 */

/** Attack classes (index = on-chain class id). */
export enum AttackClass {
  Unknown = 0,
  FlashLoanOracle = 1,
  AccessControl = 2,
  BridgeVerifier = 3,
  SupplyChain = 4,
  Governance = 5,
  SpoofToken = 6,
  Dprk = 7,
}

/** Signal sources (index = on-chain source id; indexes the trust-weight table). */
export enum Source {
  Forta = 0,
  Hypernative = 1,
  Cyvers = 2,
  ChainlinkDeviation = 3,
  OnchainUtilization = 4,
  GovernanceFeed = 5,
  Social = 6,
}

/** Response tiers returned by the engine. */
export enum Tier {
  None = 0,
  Alert = 1,
  Confirm = 2,
  AutoFire = 3,
}

/** A single normalized threat signal as understood by the agent. */
export interface RawSignal {
  source: Source;
  attackClass: AttackClass;
  /** Severity in basis points (0..10_000). */
  severityBps: number;
  /** Detector confidence in basis points (0..10_000). */
  confidenceBps: number;
  /** Unix seconds at which the signal was observed. */
  observedAt: number;
  /** Free-form provenance for the UI / audit log. */
  note?: string;
}

/** The parallel-array shape the engine and vault accept. */
export interface EncodedSignals {
  sources: number[];
  classes: number[];
  severitiesBps: bigint[];
  confidencesBps: bigint[];
  agesSecs: bigint[];
}

const clampBps = (v: number) => Math.max(0, Math.min(10_000, Math.round(v)));

/**
 * Encode raw signals into the parallel arrays the contracts expect, computing
 * each signal's age relative to `nowSecs`. This is the single place the agent
 * converts its rich objects into the engine's calldata shape.
 */
export function encodeSignals(signals: RawSignal[], nowSecs?: number): EncodedSignals {
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  return {
    sources: signals.map((s) => s.source),
    classes: signals.map((s) => s.attackClass),
    severitiesBps: signals.map((s) => BigInt(clampBps(s.severityBps))),
    confidencesBps: signals.map((s) => BigInt(clampBps(s.confidenceBps))),
    agesSecs: signals.map((s) => BigInt(Math.max(0, now - s.observedAt))),
  };
}

export const tierLabel = (t: Tier | number): string =>
  ["NONE", "ALERT", "CONFIRM", "AUTO-FIRE"][t] ?? `T${t}`;
