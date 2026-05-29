/**
 * TypeScript mirror of the on-chain Rust scoring core
 * (`packages/risk-engine/src/scoring.rs`), used to drive the live gauge in DEMO
 * mode. In LIVE mode the dashboard reads the verdict from the Stylus engine
 * instead — this is only a faithful preview so the UI feels real offline.
 */

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

export enum Source {
  Forta = 0,
  Hypernative = 1,
  Cyvers = 2,
  ChainlinkDeviation = 3,
  OnchainUtilization = 4,
  GovernanceFeed = 5,
  Social = 6,
}

export interface Signal {
  id: string;
  source: Source;
  attackClass: AttackClass;
  severityBps: number;
  confidenceBps: number;
  ageSecs: number;
  note: string;
}

const BPS = 10_000;
const DECAY_WINDOW = 1_800;
const CORROB_BONUS = 15_000;
const CORROB_MIN = 2;
const T3 = 7_500;
const T2 = 4_500;
const THREAT_MULT = 10_000;

const CLASS_WEIGHT = [4_000, 9_000, 9_500, 10_000, 8_500, 6_000, 5_000, 10_000];
const SOURCE_WEIGHT = [9_000, 9_500, 9_500, 10_000, 8_000, 7_000, 4_000];
const AUTO_FIRE = [false, false, false, true, false, false, false, true];

const clamp = (v: number) => Math.max(0, Math.min(BPS, Math.floor(v)));
const decay = (age: number) => (age >= DECAY_WINDOW ? 0 : Math.floor(((DECAY_WINDOW - age) * BPS) / DECAY_WINDOW));
const popcount = (x: number) => {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
};

export interface Decision {
  scoreBps: number;
  tier: number;
  exitFlag: boolean;
  corroboratedClasses: number[];
}

/** Identical algorithm to `compute_score` in scoring.rs. */
export function computeScore(signals: Signal[], threatMultBps = THREAT_MULT): Decision {
  const agg = new Array(8).fill(0);
  const mask = new Array(8).fill(0);

  for (const s of signals) {
    const c = s.attackClass;
    if (c >= 8) continue;
    const sw = SOURCE_WEIGHT[s.source] ?? 0;
    if (s.source < 32) mask[c] |= 1 << s.source;
    let contribution = clamp(s.severityBps);
    contribution = Math.floor((contribution * clamp(s.confidenceBps)) / BPS);
    contribution = Math.floor((contribution * sw) / BPS);
    contribution = Math.floor((contribution * CLASS_WEIGHT[c]) / BPS);
    contribution = Math.floor((contribution * decay(s.ageSecs)) / BPS);
    agg[c] += contribution;
  }

  let autoFire = false;
  let total = 0;
  const corroboratedClasses: number[] = [];
  for (let c = 0; c < 8; c++) {
    const distinct = popcount(mask[c]);
    let a = agg[c];
    const corroborated = distinct >= CORROB_MIN;
    if (corroborated) {
      a = Math.floor((a * CORROB_BONUS) / BPS);
      if (agg[c] > 0) corroboratedClasses.push(c);
    }
    if (AUTO_FIRE[c] && a > 0 && (corroborated || a >= T3)) autoFire = true;
    total += a;
  }

  const scoreBps = clamp(Math.floor((total * threatMultBps) / BPS));
  let tier = 0;
  let exitFlag = false;
  if (autoFire || scoreBps >= T3) {
    tier = 3;
    exitFlag = true;
  } else if (scoreBps >= T2) {
    tier = 2;
  } else if (scoreBps > 0) {
    tier = 1;
  }
  return { scoreBps, tier, exitFlag, corroboratedClasses };
}

export const THRESHOLDS = { t3Bps: T3, t2Bps: T2 };

export const CLASS_LABEL: Record<number, string> = {
  0: "UNKNOWN",
  1: "FLASH-LOAN / ORACLE",
  2: "ACCESS CONTROL",
  3: "BRIDGE VERIFIER",
  4: "SUPPLY CHAIN",
  5: "GOVERNANCE",
  6: "SPOOF TOKEN",
  7: "DPRK / SANCTIONED",
};

export const SOURCE_LABEL: Record<number, string> = {
  0: "FORTA",
  1: "HYPERNATIVE",
  2: "CYVERS",
  3: "CHAINLINK",
  4: "ON-CHAIN",
  5: "GOVERNANCE",
  6: "SOCIAL",
};

export const tierLabel = (t: number) => ["NOMINAL", "ALERT", "CONFIRM", "FIRED"][t] ?? `T${t}`;
