import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arbitrumSepolia, robinhoodTestnet } from "./chains";

/**
 * wagmi v2 + RainbowKit v2 config. A WalletConnect projectId is read from env
 * but falls back to a placeholder so the app builds and runs in demo mode
 * without one (injected wallets still work).
 */
export const wagmiConfig = getDefaultConfig({
  appName: "Aegis Guardian",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "00000000000000000000000000000000",
  chains: [arbitrumSepolia, robinhoodTestnet],
  ssr: true,
});

export const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "") as `0x${string}` | "";
export const ENGINE_ADDRESS = (process.env.NEXT_PUBLIC_ENGINE_ADDRESS ?? "") as `0x${string}` | "";
