import { defineChain } from "viem";
import { arbitrumSepolia } from "wagmi/chains";

/** Robinhood Chain testnet (Arbitrum Orbit L2), chain id 46630. */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  testnet: true,
});

export { arbitrumSepolia };
