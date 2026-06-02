import { createWalletClient, createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainFromId } from "../lib/chains.js";
import { aegisVaultAbi } from "../lib/abi.js";
import { type EncodedSignals } from "../signals/types.js";

/**
 * Keeper client for the AegisVault. The private key here should be a *scoped
 * session key* (ERC-7715 / MetaMask Delegation Toolkit in production) holding
 * only the KEEPER_ROLE — never a user's main key. The vault enforces the bounds
 * regardless, so a compromised keeper still cannot exceed a user's cap, asset,
 * or allow-listed adapter.
 */
export class ExecutorClient {
  private readonly wallet;
  private readonly publicClient;
  constructor(
    private readonly vault: `0x${string}`,
    chainId: number,
    keeperPrivateKey: Hex,
    rpcUrl?: string,
  ) {
    const chain = chainFromId(chainId);
    const transport = http(rpcUrl ?? chain.rpcUrls.default.http[0]);
    const account = privateKeyToAccount(keeperPrivateKey);
    this.wallet = createWalletClient({ account, chain, transport });
    this.publicClient = createPublicClient({ chain, transport });
  }

  /**
   * Submit the verdict on-chain; the vault re-derives it and acts within bounds.
   * `minOut` is the slippage floor forwarded to the exit adapter — a price-aware
   * keeper should compute it from the bounded amount and a fair quote; `0n`
   * disables the floor (acceptable only for trusted/mock swap routes).
   */
  async evaluateAndExit(
    user: `0x${string}`,
    signals: EncodedSignals,
    minOut: bigint = 0n,
  ): Promise<`0x${string}`> {
    const hash = await this.wallet.writeContract({
      address: this.vault,
      abi: aegisVaultAbi,
      functionName: "evaluateAndExit",
      args: [
        user,
        signals.sources,
        signals.classes,
        signals.severitiesBps,
        signals.confidencesBps,
        signals.agesSecs,
        minOut,
      ],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async confirmExit(user: `0x${string}`, minOut: bigint = 0n): Promise<`0x${string}`> {
    const hash = await this.wallet.writeContract({
      address: this.vault,
      abi: aegisVaultAbi,
      functionName: "confirmExit",
      args: [user, minOut],
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async isWindowOpen(user: `0x${string}`): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.vault,
      abi: aegisVaultAbi,
      functionName: "isWindowOpen",
      args: [user],
    });
  }
}
