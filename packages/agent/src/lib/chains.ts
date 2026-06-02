import { defineChain } from "viem";
import { arbitrumSepolia } from "viem/chains";

/**
 * Robinhood Chain testnet — an Arbitrum Orbit L2.
 * Chain id 46630. ETH is the gas token; Stock Tokens (tTSLA, tAMZN, ...) behave
 * as ERC-20s. No canonical DeFi protocols are confirmed on it yet, so richer
 * integrations run on Arbitrum Sepolia (see `arbitrumSepolia` below).
 */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  testnet: true,
});

export { arbitrumSepolia };

/** Local anvil / Nitro devnode (chain id 31337) for the on-chain local stack. */
export const anvilLocal = defineChain({
  id: 31337,
  name: "Anvil (local)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

export type SupportedChain = typeof robinhoodTestnet | typeof arbitrumSepolia | typeof anvilLocal;

/** Resolve a viem chain object from a numeric chain id. */
export function chainFromId(id: number): SupportedChain {
  switch (id) {
    case robinhoodTestnet.id:
      return robinhoodTestnet;
    case arbitrumSepolia.id:
      return arbitrumSepolia;
    case anvilLocal.id:
      return anvilLocal;
    default:
      throw new Error(`Unsupported chain id ${id}`);
  }
}

/**
 * Canonical, verified addresses by chain. Stock Token addresses on Robinhood
 * Chain are not published — pull them from the faucet/explorer at runtime and
 * inject via env, so they are intentionally absent here.
 */
export const ADDRESSES = {
  arbitrumSepolia: {
    aaveV3Pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    aavePoolAddressesProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
    erc8004Identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    erc8004Reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  },
  arbitrumOne: {
    chainlinkEthUsd: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
    sequencerUptimeFeed: "0xFdB631F5EE196F0ed6FAa767959853A9F217697D",
    erc8004Identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    erc8004Reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  },
} as const;
