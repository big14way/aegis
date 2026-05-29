import type { PublicClient } from "viem";
import { aegisVaultAbi } from "../lib/abi.js";
import { AttackClass, Source, type RawSignal } from "./types.js";

/**
 * Derives a *trustless, on-chain* oracle-deviation signal by calling
 * `AegisVault.checkOracle`, which reads a Chainlink feed (guarded by the L2
 * sequencer uptime feed) and returns the deviation from an expected price in
 * bps — with the deviation math performed inside the Stylus engine.
 *
 * Unlike off-chain detector feeds, this signal is computed from hard on-chain
 * data, so it carries maximum source trust (`Source.ChainlinkDeviation`).
 */
export interface OracleSignalParams {
  client: PublicClient;
  vault: `0x${string}`;
  feed: `0x${string}`;
  expectedPrice: bigint;
  /** Deviation (bps) below which we emit nothing. */
  minDeviationBps?: number;
}

export async function getOracleDeviationSignal(
  params: OracleSignalParams,
): Promise<RawSignal[]> {
  const { client, vault, feed, expectedPrice, minDeviationBps = 100 } = params;
  let deviationBps: bigint;
  try {
    deviationBps = await client.readContract({
      address: vault,
      abi: aegisVaultAbi,
      functionName: "checkOracle",
      args: [feed, expectedPrice],
    });
  } catch (err) {
    console.warn(`[chainlink] checkOracle failed: ${(err as Error).message}`);
    return [];
  }

  const dev = Number(deviationBps);
  if (dev < minDeviationBps) return [];

  // Map deviation magnitude to severity: a 10%+ deviation is a near-certain depeg.
  const severityBps = Math.min(10_000, dev * 10);
  return [
    {
      source: Source.ChainlinkDeviation,
      attackClass: AttackClass.FlashLoanOracle,
      severityBps,
      confidenceBps: 9_500,
      observedAt: Math.floor(Date.now() / 1000),
      note: `chainlink:deviation:${dev}bps`,
    },
  ];
}
