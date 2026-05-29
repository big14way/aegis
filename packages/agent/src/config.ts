import "dotenv/config";
import { z } from "zod";

/** Validated environment configuration for the agent. */
const schema = z.object({
  // Which chain the executor/vault live on (46630 = Robinhood, 421614 = Arb Sepolia).
  CHAIN_ID: z.coerce.number().default(421614),
  RPC_URL: z.string().url().optional(),

  // Deployed contract addresses.
  RISK_ENGINE_ADDRESS: z.string().optional(),
  AEGIS_VAULT_ADDRESS: z.string().optional(),
  ERC8004_IDENTITY_ADDRESS: z.string().optional(),
  ERC8004_REPUTATION_ADDRESS: z.string().optional(),

  // Oracle check.
  PRICE_FEED_ADDRESS: z.string().optional(),
  EXPECTED_PRICE: z.coerce.bigint().optional(),

  // Keeper (agent session key). NEVER commit a real key — use a scoped session key.
  KEEPER_PRIVATE_KEY: z.string().optional(),

  // The user/account being protected (for the demo loop).
  PROTECTED_USER: z.string().optional(),

  // Sponsor integrations.
  FORTA_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  // x402 paid-action endpoint.
  X402_PORT: z.coerce.number().default(4021),
  X402_PAY_TO: z.string().optional(),
  X402_FACILITATOR_URL: z.string().url().default("https://x402.org/facilitator"),

  // Polling cadence for the main loop (ms).
  POLL_INTERVAL_MS: z.coerce.number().default(15_000),
});

export type AgentConfig = z.infer<typeof schema>;

export const config: AgentConfig = schema.parse(process.env);

export function requireAddress(value: string | undefined, name: string): `0x${string}` {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Missing or invalid ${name} (expected a 0x address)`);
  }
  return value as `0x${string}`;
}
