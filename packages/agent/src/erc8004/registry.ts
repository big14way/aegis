import {
  createWalletClient,
  createPublicClient,
  http,
  stringToHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainFromId } from "../lib/chains.js";
import { identityRegistryAbi, reputationRegistryAbi } from "../lib/abi.js";

/**
 * ERC-8004 (Trustless Agents) integration.
 *
 * Aegis registers its guardian as an on-chain agent identity, then writes
 * structured reputation after each exit — turning the guardian's track record
 * (how often a fired exit actually preceded a real loss event) into portable,
 * verifiable reputation other protocols and users can read.
 *
 * Canonical Arbitrum Sepolia singletons:
 *   Identity   0x8004A818BFB912233c491871b3d84c89A494BD9e
 *   Reputation 0x8004B663056A597Dffe9eCcC1965A193B7388713
 */
export class Erc8004Client {
  private readonly wallet;
  private readonly publicClient;
  constructor(
    private readonly identity: `0x${string}`,
    private readonly reputation: `0x${string}`,
    chainId: number,
    privateKey: Hex,
    rpcUrl?: string,
  ) {
    const chain = chainFromId(chainId);
    const transport = http(rpcUrl ?? chain.rpcUrls.default.http[0]);
    const account = privateKeyToAccount(privateKey);
    this.wallet = createWalletClient({ account, chain, transport });
    this.publicClient = createPublicClient({ chain, transport });
  }

  /** Mint the guardian's agent identity NFT pointing at its off-chain agent card. */
  async register(agentCardUri: string): Promise<{ hash: `0x${string}` }> {
    const hash = await this.wallet.writeContract({
      address: this.identity,
      abi: identityRegistryAbi,
      functionName: "register",
      args: [agentCardUri],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return { hash };
  }

  /** Bind the agent identity to the keeper/operator wallet. */
  async setAgentWallet(agentId: bigint, wallet: `0x${string}`): Promise<`0x${string}`> {
    const hash = await this.wallet.writeContract({
      address: this.identity,
      abi: identityRegistryAbi,
      functionName: "setAgentWallet",
      args: [agentId, wallet],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Attach feedback about an exit outcome.
   * @param score 0..100 quality score (e.g. 100 if the exit avoided a real loss).
   * @param outcome short tag, e.g. "exit-correct" | "exit-false-positive".
   * @param evidenceUri link to the decision record (signals + tx).
   */
  async recordOutcome(
    agentId: bigint,
    score: number,
    outcome: string,
    evidenceUri: string,
  ): Promise<`0x${string}`> {
    const tag = stringToHex(outcome.slice(0, 31), { size: 32 });
    const hash = await this.wallet.writeContract({
      address: this.reputation,
      abi: reputationRegistryAbi,
      functionName: "giveFeedback",
      args: [agentId, Math.max(0, Math.min(100, score)), tag, evidenceUri],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }
}

/** The agent card describing the Aegis guardian (served off-chain, referenced on-chain). */
export function buildAgentCard(operator: `0x${string}`, vault: `0x${string}`) {
  return {
    name: "Aegis Guardian",
    description:
      "Verifiable DeFi/RWA crisis-response agent. Risk scoring + exit decisions are computed on-chain in Arbitrum Stylus; execution is bounded and non-custodial.",
    version: "0.1.0",
    operator,
    contracts: { vault },
    skills: ["risk-scoring", "panic-exit", "oracle-deviation-detection"],
    trustModels: ["erc-8004-reputation", "onchain-verifiable-compute"],
  };
}
