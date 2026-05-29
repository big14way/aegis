import { createPublicClient, http, type PublicClient } from "viem";
import { chainFromId } from "../lib/chains.js";
import { riskEngineAbi } from "../lib/abi.js";
import { Tier, type EncodedSignals } from "../signals/types.js";

/** Read-only client for the verifiable Stylus risk engine. */
export class EngineClient {
  readonly client: PublicClient;
  constructor(
    private readonly engine: `0x${string}`,
    chainId: number,
    rpcUrl?: string,
  ) {
    const chain = chainFromId(chainId);
    this.client = createPublicClient({
      chain,
      transport: http(rpcUrl ?? chain.rpcUrls.default.http[0]),
    });
  }

  /** Call the engine's pure `score` view and return a typed decision. */
  async score(signals: EncodedSignals): Promise<{ scoreBps: number; tier: Tier; exitFlag: boolean }> {
    const [scoreBps, tier, exitFlag] = await this.client.readContract({
      address: this.engine,
      abi: riskEngineAbi,
      functionName: "score",
      args: [
        signals.sources,
        signals.classes,
        signals.severitiesBps,
        signals.confidencesBps,
        signals.agesSecs,
      ],
    });
    return { scoreBps: Number(scoreBps), tier: tier as Tier, exitFlag };
  }

  async thresholds(): Promise<{ t3Bps: number; t2Bps: number }> {
    const [t3Bps, t2Bps] = await this.client.readContract({
      address: this.engine,
      abi: riskEngineAbi,
      functionName: "thresholds",
    });
    return { t3Bps: Number(t3Bps), t2Bps: Number(t2Bps) };
  }
}
