import { Bot } from "grammy";
import { config, requireAddress } from "../config.js";
import { tierLabel } from "../signals/types.js";

/**
 * grammY Telegram bot — the human action surface for the guardian.
 *
 * Commands:
 *   /status            show the protected user and current window state
 *   /confirm           confirm a pending T2 exit within its window
 *   /risk              show the latest computed risk score
 *
 * The bot also pushes alerts when the agent loop detects T1/T2/T3 events (see
 * `notify*` below, called from `src/index.ts`). Prefer webhooks over long-polling
 * in production for reliable hot-path delivery.
 */

export interface BotHooks {
  /** Returns whether a confirmation window is currently open for the user. */
  isWindowOpen: () => Promise<boolean>;
  /** Confirms the pending exit; resolves with the tx hash. */
  confirmExit: () => Promise<`0x${string}`>;
  /** Returns the latest decision for display. */
  latestDecision: () => { scoreBps: number; tier: number } | null;
}

export function createBot(hooks: BotHooks): Bot | null {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN not set — bot disabled.");
    return null;
  }
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
  const user = config.PROTECTED_USER ? requireAddress(config.PROTECTED_USER, "PROTECTED_USER") : null;

  bot.command("start", (ctx) =>
    ctx.reply(
      "🛡️ *Aegis Guardian online.*\nI watch your positions and can fire a bounded exit when threat signals corroborate on-chain.\n\n/status · /risk · /confirm",
      { parse_mode: "Markdown" },
    ),
  );

  bot.command("status", async (ctx) => {
    const open = await hooks.isWindowOpen().catch(() => false);
    await ctx.reply(
      `Protected: \`${user ?? "unset"}\`\nConfirmation window: ${open ? "🟠 OPEN" : "⚪️ none"}`,
      { parse_mode: "Markdown" },
    );
  });

  bot.command("risk", async (ctx) => {
    const d = hooks.latestDecision();
    if (!d) return ctx.reply("No evaluation yet.");
    await ctx.reply(`Risk score: *${(d.scoreBps / 100).toFixed(1)}%* — tier *${tierLabel(d.tier)}*`, {
      parse_mode: "Markdown",
    });
  });

  bot.command("confirm", async (ctx) => {
    const open = await hooks.isWindowOpen().catch(() => false);
    if (!open) return ctx.reply("No open confirmation window.");
    try {
      const hash = await hooks.confirmExit();
      await ctx.reply(`✅ Exit confirmed and fired.\nTx: \`${hash}\``, { parse_mode: "Markdown" });
    } catch (err) {
      await ctx.reply(`⚠️ Confirm failed: ${(err as Error).message}`);
    }
  });

  return bot;
}

/** Push a one-off alert to the configured chat (used by the agent loop). */
export async function pushAlert(bot: Bot, text: string): Promise<void> {
  if (!config.TELEGRAM_CHAT_ID) return;
  await bot.api.sendMessage(config.TELEGRAM_CHAT_ID, text, { parse_mode: "Markdown" }).catch(() => {});
}

// Standalone runner: `npm run bot`.
const isMain = typeof process !== "undefined" && process.argv[1]?.endsWith("telegram/bot.ts");
if (isMain) {
  const bot = createBot({
    isWindowOpen: async () => false,
    confirmExit: async () => "0x" as `0x${string}`,
    latestDecision: () => null,
  });
  if (bot) {
    bot.start();
    console.log("[telegram] bot started (long-polling).");
  }
}
