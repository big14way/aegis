# Aegis — Architecture

## The one idea

> Move the *judgement* on-chain. Keep the *executor* dumb and bounded.

A crisis-response agent has to answer one question under time pressure: **"is
this real enough to exit now?"** In the reference design that answer was produced
by an opaque off-chain TypeScript backend — a black box users had to trust.
Aegis moves that decision into an **Arbitrum Stylus** contract written in Rust,
so the scoring algorithm, every weight, and every threshold are public,
reproducible, and verifiable. The thing that moves your money is a deliberately
simple Solidity contract whose only job is to enforce bounds.

![architecture](./diagrams/architecture.svg)

## Components

### 1. `RiskEngine` — Arbitrum Stylus (Rust) · `packages/risk-engine`

The verifiable brain.

- `score(sources, classes, severitiesBps, confidencesBps, agesSecs) → (scoreBps, tier, exitFlag)`
  is a pure view: anyone can call it and reproduce the decision.
- The math lives in `scoring.rs`, a `no_std + alloc` module with **zero Stylus
  dependencies**, so it is unit-tested with a plain `cargo test` and mirrored
  byte-for-byte off-chain (TS) and in the Solidity gas baseline.
- The algorithm:
  1. weight each signal by `severity × confidence × source_trust × class_weight × time_decay` (all in bps);
  2. aggregate per attack class and track distinct sources via a 32-bit mask;
  3. apply a **corroboration bonus** (×1.5) to any class seen from ≥2 distinct sources — computed on-chain via a popcount;
  4. sum, apply a global **threat-environment multiplier**, clamp to 100%;
  5. **auto-fire** override for attack classes with ~0% historical recovery (bridge-verifier, DPRK-attributed) — for those, waiting is strictly worse than exiting;
  6. otherwise derive the tier from the T2/T3 thresholds.
- Config (weights, thresholds, multiplier, auto-fire flags) is held in contract
  storage and owner-updatable, so the policy itself is auditable and governable.

**Why Stylus.** This is nested iteration + per-class aggregation + bitmask
popcount + fixed-point decay math — compute-heavy and storage-light, exactly the
workload Arbitrum's guidance says to push into Stylus, where compute is priced
10–100× cheaper than the EVM. Arbitrum's own iterative-scoring demo reports >90%
less gas. The gas harness (`packages/contracts` + the Rust measurement) lets a
judge reproduce the comparison.

### 2. Agent — TypeScript · `packages/agent`

The off-chain layer that *feeds* the engine but never decides for it.

- Pulls signals (Forta feed; a trustless Chainlink-deviation signal derived via
  `vault.checkOracle`), does cheap hygiene (dedupe, drop-stale — the
  corroboration *bonus* stays on-chain), and encodes parallel arrays.
- Reads the engine's verdict, and for T2/T3 has the **keeper** submit
  `vault.evaluateAndExit`. The keeper is a scoped session key (ERC-7715), never a
  user's main key.
- Registers the guardian via **ERC-8004** and writes exit-outcome reputation;
  exposes an **x402**-gated paid "priority exit"; pushes **Telegram** alerts.

### 3. `AegisVault` — Solidity · `packages/contracts`

The bounded, non-custodial executor.

- A user grants a **bounded ERC-20 allowance** and `arm`s a guard:
  `(sourceAsset, targetAsset, adapter, maxExitAmount, t2WindowSecs)`. No custody,
  no blanket approval.
- `evaluateAndExit` (keeper-only) calls `engine.evaluate`, which logs the
  decision on-chain, then acts:
  - **auto-fire** → `_executeExit` immediately;
  - **T2** → opens a confirmation window (`ConfirmationRequested`);
  - **T1** → `Alert` event only.
- `_executeExit` moves `min(allowance, balance, maxExitAmount)` of the source
  asset, through an **allow-listed adapter**, delivering the user's **chosen
  target asset** to the **user** (never the agent).
- `checkOracle` reads a Chainlink feed (guarded by the L2 sequencer uptime feed)
  and calls back into the Stylus engine's `deviationBps` — a live
  Solidity→Stylus cross-VM call.

The three bounds — *keeper-only*, *fires only on the engine's verdict*, *amount
capped into a fixed asset via an allow-listed adapter* — mean a fully compromised
keeper still cannot drain a user.

## The cross-VM seam

`IRiskEngine.sol` is the entire contract between the two VMs. The Stylus SDK maps
Rust snake_case methods to Solidity camelCase selectors, so the Solidity executor
calls the Rust engine exactly as if it were another Solidity contract. This is
the part most teams don't attempt: a Solidity ↔ Stylus call on the hot path of a
money-moving action.

## Chain strategy

Architected chain-agnostically and dual-deployed:

- **Robinhood Chain testnet** (chain `46630`) — primary target; Stock Tokens
  (tTSLA, …) are the protected RWA positions, exited via `SwapExitAdapter`.
- **Arbitrum Sepolia** (chain `421614`) — fallback + the home of the
  Aave/Chainlink/ERC-8004 integrations that aren't yet confirmed on RHC.

Stylus availability on RHC is validated on day one with
`cargo stylus check --endpoint=<RHC RPC>`; if it is not yet enabled there, the
engine deploys on Arbitrum Sepolia and the vault on either chain reads it. See
[`STYLUS_ACTIVATION.md`](./STYLUS_ACTIVATION.md) for the reproducible deploy + verify
runbook, and the root [`README`](../README.md) for the live addresses and quickstart.
