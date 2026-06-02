import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { anvil, arbitrumSepolia, robinhoodTestnet } from "./chains";

/**
 * wagmi v2 + RainbowKit v2 config. A WalletConnect projectId is read from env
 * but falls back to a placeholder so the app builds and runs in demo mode
 * without one (injected wallets still work).
 */
export const wagmiConfig = getDefaultConfig({
  appName: "Aegis Guardian",
  // `||` (not `??`) so an empty env value also falls back — RainbowKit throws on
  // an empty projectId during prerender. Injected wallets work with the placeholder.
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "00000000000000000000000000000000",
  chains: [anvil, arbitrumSepolia, robinhoodTestnet],
  ssr: true,
});

type Addr = `0x${string}` | "";
const addr = (v?: string): Addr => (v ?? "") as Addr;

/** Core contract addresses (blank => the dashboard runs in DEMO mode). */
export const VAULT_ADDRESS = addr(process.env.NEXT_PUBLIC_VAULT_ADDRESS);
export const ENGINE_ADDRESS = addr(process.env.NEXT_PUBLIC_ENGINE_ADDRESS);

/** Asset + adapter addresses needed to `arm()` a guard on-chain. */
export const SOURCE_ASSET = addr(process.env.NEXT_PUBLIC_SOURCE_ASSET);
export const TARGET_ASSET = addr(process.env.NEXT_PUBLIC_TARGET_ASSET);
export const ADAPTER_ADDRESS = addr(process.env.NEXT_PUBLIC_ADAPTER);

/** Optional: the protected user the keeper acts for (defaults to connected wallet). */
export const PROTECTED_USER = addr(process.env.NEXT_PUBLIC_PROTECTED_USER);

/** The chain the deployed addresses live on (anvil by default). */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337");

/** True when every address required for the live arm/exit path is configured. */
export const LIVE_READY = Boolean(VAULT_ADDRESS && ENGINE_ADDRESS && SOURCE_ASSET && TARGET_ASSET && ADAPTER_ADDRESS);
