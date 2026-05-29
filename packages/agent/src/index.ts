import { config, requireAddress } from "./config.js";
import { getFortaSignals } from "./signals/forta.js";
import { getOracleDeviationSignal } from "./signals/chainlink.js";
import { prepareSignals, distinctSourcesByClass } from "./signals/corroborator.js";
import { EngineClient } from "./engine/client.js";
import { ExecutorClient } from "./executor/client.js";
import { createBot, pushAlert } from "./telegram/bot.js";
import { Tier, tierLabel, type RawSignal } from "./signals/types.js";
import type { Bot } from "grammy";
import type { Hex } from "viem";

/**
 * Aegis agent loop.
 *
 *   gather signals  ->  prepare (hygiene)  ->  Stylus engine verdict
 *        ->  if auto-fire / confirm: keeper submits to the bounded vault
 *        ->  alert the human via Telegram
 *
 * The agent NEVER decides to move funds itself: it forwards signals to the
 * on-chain engine and the bounded vault, which re-derive the decision and
 * enforce the per-user cap/asset/adapter constraints. Without a keeper key the
 * agent runs in read-only "preview" mode, which is perfect for the demo.
 */

let latest: { scoreBps: number; tier: number } | null = null;

async function gatherSignals(engine: EngineClient): Promise<RawSignal[]> {
  const signals: RawSignal[] = [];

  // 1) Threat-intel feed (Forta; deterministic stub without an API key).
  signals.push(...(await getFortaSignals({ apiKey: config.FORTA_API_KEY })));

  // 2) Trustless on-chain oracle-deviation signal (via vault.checkOracle ->
  //    Chainlink + the Stylus deviation math), when configured.
  if (config.AEGIS_VAULT_ADDRESS && config.PRICE_FEED_ADDRESS && config.EXPECTED_PRICE) {
    signals.push(
      ...(await getOracleDeviationSignal({
        client: engine.client,
        vault: requireAddress(config.AEGIS_VAULT_ADDRESS, "AEGIS_VAULT_ADDRESS"),
        feed: requireAddress(config.PRICE_FEED_ADDRESS, "PRICE_FEED_ADDRESS"),
        expectedPrice: config.EXPECTED_PRICE,
      })),
    );
  }

  return signals;
}

async function tick(engine: EngineClient, executor: ExecutorClient | null, bot: Bot | null) {
  const raw = await gatherSignals(engine);
  if (raw.length === 0) {
    console.log("[loop] no signals this tick");
    return;
  }

  const { signals, encoded } = prepareSignals(raw);
  const decision = await engine.score(encoded);
  latest = { scoreBps: decision.scoreBps, tier: decision.tier };

  const distinct = distinctSourcesByClass(signals);
  const corroborated = [...distinct.values()].some((n) => n >= 2);
  console.log(
    `[verdict] score=${(decision.scoreBps / 100).toFixed(1)}% tier=${tierLabel(decision.tier)} ` +
      `exit=${decision.exitFlag} signals=${signals.length} corroborated=${corroborated}`,
  );

  const user = config.PROTECTED_USER
    ? requireAddress(config.PROTECTED_USER, "PROTECTED_USER")
    : null;

  // Act on-chain for T2/T3 (T2 opens a confirmation window; T3 fires the exit).
  if (decision.tier >= Tier.Confirm && executor && user) {
    try {
      const hash = await executor.evaluateAndExit(user, encoded);
      const verb = decision.exitFlag ? "🔴 EXIT FIRED" : "🟠 CONFIRMATION REQUESTED";
      console.log(`[exec] ${verb} tx=${hash}`);
      if (bot) {
        await pushAlert(
          bot,
          `${verb}\nScore *${(decision.scoreBps / 100).toFixed(1)}%* (tier ${tierLabel(decision.tier)})\nTx: \`${hash}\`` +
            (decision.exitFlag ? "" : "\nReply /confirm to exit now."),
        );
      }
    } catch (err) {
      console.error(`[exec] failed: ${(err as Error).message}`);
    }
  } else if (decision.tier === Tier.Alert && bot) {
    await pushAlert(bot, `⚪️ Heads up: risk at *${(decision.scoreBps / 100).toFixed(1)}%* (tier ALERT). Watching.`);
  }
}

async function main() {
  const engineAddr = requireAddress(config.RISK_ENGINE_ADDRESS, "RISK_ENGINE_ADDRESS");
  const engine = new EngineClient(engineAddr, config.CHAIN_ID, config.RPC_URL);

  let executor: ExecutorClient | null = null;
  if (config.KEEPER_PRIVATE_KEY && config.AEGIS_VAULT_ADDRESS) {
    executor = new ExecutorClient(
      requireAddress(config.AEGIS_VAULT_ADDRESS, "AEGIS_VAULT_ADDRESS"),
      config.CHAIN_ID,
      config.KEEPER_PRIVATE_KEY as Hex,
      config.RPC_URL,
    );
    console.log("[init] keeper executor enabled (bounded exits armed)");
  } else {
    console.log("[init] read-only preview mode (no keeper key / vault) — decisions logged, not executed");
  }

  const bot = createBot({
    isWindowOpen: async () =>
      executor && config.PROTECTED_USER
        ? executor.isWindowOpen(requireAddress(config.PROTECTED_USER, "PROTECTED_USER"))
        : false,
    confirmExit: async () => {
      if (!executor || !config.PROTECTED_USER) throw new Error("executor/user not configured");
      return executor.confirmExit(requireAddress(config.PROTECTED_USER, "PROTECTED_USER"));
    },
    latestDecision: () => latest,
  });
  if (bot) {
    bot.start();
    console.log("[init] telegram bot started");
  }

  console.log(`[init] Aegis agent live on chain ${config.CHAIN_ID}, polling every ${config.POLL_INTERVAL_MS}ms`);
  await tick(engine, executor, bot); // run once immediately
  setInterval(() => {
    tick(engine, executor, bot).catch((e) => console.error("[loop] tick error:", e));
  }, config.POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
