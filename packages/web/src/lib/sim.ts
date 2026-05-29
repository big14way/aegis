import { AttackClass, Source, type Signal } from "./scoring";

let counter = 0;
const id = () => `sig_${Date.now()}_${counter++}`;

const mk = (
  source: Source,
  attackClass: AttackClass,
  severityBps: number,
  confidenceBps: number,
  ageSecs: number,
  note: string,
): Signal => ({ id: id(), source, attackClass, severityBps, confidenceBps, ageSecs, note });

export interface Scenario {
  key: string;
  label: string;
  blurb: string;
  signals: Signal[];
}

/**
 * Curated demo scenarios. Each maps to a recognizable real-world failure mode
 * and exercises a different branch of the on-chain scoring logic.
 */
export const SCENARIOS: Scenario[] = [
  {
    key: "nominal",
    label: "Nominal",
    blurb: "Background chatter only. No corroboration. Guardian stays armed and quiet.",
    signals: [mk(Source.Social, AttackClass.SpoofToken, 3500, 4000, 120, "twitter: rumor of fake airdrop")],
  },
  {
    key: "oracle",
    label: "Oracle manipulation",
    blurb: "Forta + a hard Chainlink deviation corroborate a flash-loan oracle attack → auto-fire.",
    signals: [
      mk(Source.Forta, AttackClass.FlashLoanOracle, 8200, 8500, 25, "forta: oracle manipulation suspected"),
      mk(Source.ChainlinkDeviation, AttackClass.FlashLoanOracle, 9000, 9500, 8, "chainlink: 9.0% deviation vs peg"),
    ],
  },
  {
    key: "bridge",
    label: "Bridge verifier exploit",
    blurb: "Two independent detectors flag a bridge verifier bug — a class with ~0% recovery → instant auto-fire.",
    signals: [
      mk(Source.Forta, AttackClass.BridgeVerifier, 8000, 8000, 40, "forta: invalid proof accepted"),
      mk(Source.Hypernative, AttackClass.BridgeVerifier, 8200, 8500, 15, "hypernative: anomalous bridge mint"),
    ],
  },
  {
    key: "confirm",
    label: "Single strong signal",
    blurb: "One high-confidence access-control alert, not yet corroborated → T2 confirmation window opens.",
    signals: [mk(Source.Cyvers, AttackClass.AccessControl, 7200, 8000, 20, "cyvers: admin key rotated unexpectedly")],
  },
  {
    key: "stale",
    label: "Stale intel",
    blurb: "A severe alert that is 31 minutes old. The engine decays it to zero — no false fire.",
    signals: [mk(Source.Forta, AttackClass.FlashLoanOracle, 10000, 10000, 1860, "forta: alert older than decay window")],
  },
];

export const baselineSignals = (): Signal[] => SCENARIOS[0].signals.map((s) => ({ ...s, id: id() }));
