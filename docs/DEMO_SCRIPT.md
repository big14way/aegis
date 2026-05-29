# Demo script (~3 minutes)

A tight walkthrough for judges. Have `packages/web` running (`npm run dev`).

## 0:00 — The problem (20s)

> "When a protocol gets exploited or an RWA depegs, the people who exit in the
> first few minutes keep their money; everyone else eats the loss. Crisis-exit
> agents exist — but they make the 'should I exit?' decision in an off-chain
> black box. You're trusting code you can't see with the trigger on your funds."

## 0:20 — The idea (20s)

> "Aegis moves that decision **on-chain into Arbitrum Stylus**. The risk score
> and the exit trigger are verifiable Rust anyone can reproduce. The contract
> that actually moves money is a dumb, tightly-bounded executor. We bind the
> agent, not your keys."

## 0:40 — Arm + nominal (20s)

- Click **Arm Guardian** → state `ARMED`, gauge calm in the steel zone.
- "It's now watching. Every signal that arrives gets scored by the Stylus engine.
  Background social chatter alone never fires."

## 1:00 — Auto-fire on corroboration (40s)

- Click **Oracle manipulation**.
- "Forta flags an oracle attack — *and* a hard Chainlink price deviation
  corroborates it. Two **distinct** sources on the same attack class. The engine
  applies its corroboration bonus, the score crosses the 75% auto-fire line…"
- Gauge goes red, state **FIRED**, tTSLA strikes through → **USDC**.
- "…and the bounded exit fires: up to the user's cap, into the asset they chose,
  through an allow-listed adapter. Nothing else can move."
- Click **Bridge verifier exploit**: "Some attack classes — bridge verifier bugs,
  DPRK-attributed hacks — have basically zero fund recovery. For those the engine
  auto-fires the instant they corroborate, no waiting."

## 1:40 — Tiered response (30s)

- Click **Single strong signal**: "One strong but **un-corroborated** alert. The
  engine doesn't yank your funds on a single source — it opens a confirmation
  window." → state **CONFIRM**.
- Click **Confirm Exit Now** → fires.
- Click **Stale intel**: "A severe alert, but 31 minutes old. The engine's
  time-decay drives it to zero. No panic-selling on stale data."

## 2:10 — Why Stylus (30s)

- "This scoring — nested iteration, per-class aggregation, a bitmask popcount for
  corroboration, decay math — is compute-heavy. On the EVM you'd pay through the
  nose. In Stylus it's **>90% cheaper**, and it's the *same algorithm* you can run
  with `cargo test` and re-derive in the Solidity baseline. The gas benchmark is
  in the repo."
- "And the Solidity vault calls the Rust engine directly on the hot path — a live
  Solidity↔Stylus call."

## 2:40 — Integrations + close (20s)

- "Identity and a portable track record via **ERC-8004**; a paid 'priority exit'
  via **x402** on Arbitrum; **Chainlink** for trustless on-chain price signals;
  Telegram for the human in the loop."
- "Verifiable judgement, bounded execution. That's Aegis."

---

### Backup (live, if asked)

Run the agent loop (`packages/agent`, `npm run start` with keeper + vault set)
and show a real `evaluateAndExit` transaction landing on Arbitrum Sepolia in the
explorer, plus the on-chain `DecisionScored` event emitted by the Stylus engine.
