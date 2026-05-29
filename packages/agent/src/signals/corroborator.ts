import { encodeSignals, type EncodedSignals, type RawSignal } from "./types.js";

/**
 * Light off-chain pre-processing before the signals hit the verifiable engine.
 *
 * The corroboration *bonus* itself is computed on-chain (distinct-source popcount
 * in the Stylus engine) — that logic is deliberately NOT duplicated here, so the
 * trust boundary stays on-chain. This module only does cheap hygiene the chain
 * shouldn't pay for: dropping stale signals and de-duplicating exact repeats from
 * the same source so a single chatty detector cannot inflate a class.
 */
export interface CorroborateOptions {
  /** Discard signals older than this many seconds (engine also decays them). */
  maxAgeSecs?: number;
  nowSecs?: number;
}

export function prepareSignals(
  signals: RawSignal[],
  opts: CorroborateOptions = {},
): { signals: RawSignal[]; encoded: EncodedSignals } {
  const now = opts.nowSecs ?? Math.floor(Date.now() / 1000);
  const maxAge = opts.maxAgeSecs ?? 1_800;

  const fresh = signals.filter((s) => now - s.observedAt <= maxAge);

  // De-duplicate identical (source, class, severity bucket) tuples.
  const seen = new Set<string>();
  const deduped: RawSignal[] = [];
  for (const s of fresh) {
    const key = `${s.source}:${s.attackClass}:${Math.round(s.severityBps / 500)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }

  return { signals: deduped, encoded: encodeSignals(deduped, now) };
}

/** Count distinct sources per attack class (for UI display only). */
export function distinctSourcesByClass(signals: RawSignal[]): Map<number, number> {
  const sets = new Map<number, Set<number>>();
  for (const s of signals) {
    if (!sets.has(s.attackClass)) sets.set(s.attackClass, new Set());
    sets.get(s.attackClass)!.add(s.source);
  }
  const out = new Map<number, number>();
  for (const [k, v] of sets) out.set(k, v.size);
  return out;
}
