<div align="center">

# 🛡️ AEGIS

### Verifiable crisis-response guardian for DeFi & RWA

**The risk score and exit decision run on-chain in Arbitrum Stylus. Execution is bounded, non-custodial, and verifiable.**

*Arbitrum Open House — London Buildathon 2026 · AI Agentic + Open tracks*

</div>

---

## The problem

When a protocol is exploited or an RWA depegs, the people who exit in the first
few minutes keep their money. Everyone else eats the cascade. Crisis-exit agents
exist to be that fast hand on the trigger — but every one of them makes the
**"should I exit?"** decision inside an opaque off-chain backend. You are handing
code you cannot see, audit, or reproduce the authority to move your funds.

Two things have to be true for an autonomous guardian to be trustworthy, and
today's designs get neither:

1. **The judgement must be verifiable.** If a bot can panic-sell your portfolio,
   you should be able to read and reproduce exactly why.
2. **The agent must be bounded, not trusted.** A compromised agent key should be
   incapable of doing more than the narrow thing you authorized.

## What Aegis does

> **Move the judgement on-chain. Keep the executor dumb and bounded.**

- The decision engine — risk scoring + the exit trigger — is an **Arbitrum
  Stylus contract written in Rust**. Every weight, threshold, and the full
  algorithm are on-chain, public, and reproducible (`cargo test` re-derives them
  locally; a Solidity port re-derives them for the gas benchmark).
- The thing that moves money is **`AegisVault`**, a deliberately simple Solidity
  contract that calls the engine on the hot path and can *only* act within hard
  on-chain bounds: keeper-only, fires only on the engine's verdict, amount capped
  into a user-chosen asset through an allow-listed adapter. **Bind the agent, not
  the keys.**

This is the upgrade over a prior off-chain crisis-exit design: the black box
becomes a glass box, and the trigger becomes provably constrained.

![architecture](./docs/diagrams/architecture.svg)

## How it works

```
threat signals ─▶ agent (hygiene + encode) ─▶ Stylus RiskEngine.score()
                                                        │  (score, tier, exitFlag)
   T1 alert ◀───────────────────────────────────────────┤
   T2 confirmation window ◀──────────────────────────────┤
   T3 auto-fire ─▶ AegisVault._executeExit (bounded) ─────┘ ─▶ adapter ─▶ USDC to user
```

The scoring algorithm (`packages/risk-engine/src/scoring.rs`):

1. weight each signal: `severity × confidence × source_trust × class_weight × time_decay` (basis points);
2. aggregate per attack class; track distinct sources with a 32-bit bitmask;
3. **corroboration bonus** (×1.5) for any class confirmed by ≥2 distinct sources — an on-chain popcount;
4. sum → apply a global **threat-environment multiplier** → clamp to 100%;
5. **auto-fire** override for classes with ~0% historical recovery (bridge-verifier, DPRK-attributed);
6. else tier from the T2 (45%) / T3 (75%) thresholds.

Tiers: `0` nominal · `1` alert · `2` confirm (opens a user window) · `3` auto-fire.

## Why Arbitrum Stylus (the headline)

That scoring routine is nested iteration + per-class aggregation + a bitmask
popcount + fixed-point decay math — **compute-heavy and storage-light**. That is
exactly the workload Arbitrum says to move into Stylus, where compute is priced
**10–100× cheaper** than the EVM. Arbitrum's own iterative on-chain scoring demo
reports **>90% less gas** in Stylus.

We make the claim reproducible instead of asserting it:

- `packages/risk-engine/src/scoring.rs` — the real engine logic (Rust).
- `packages/contracts/src/mocks/ReferenceScorerSol.sol` — a **byte-for-byte
  faithful Solidity port** of the same algorithm.
- `forge test --match-contract GasBench -vv` prints the Solidity baseline gas;
  measure the Stylus engine via `cargo stylus` and compare. Same inputs, same
  outputs, only the VM differs.

And the seam itself is the part most teams won't attempt: **`AegisVault`
(Solidity) calls `RiskEngine` (Stylus/Rust) directly** via `IRiskEngine.sol`, on
the hot path of a money-moving transaction.

## Sponsor integrations

| Sponsor | How Aegis uses it | Where |
|---|---|---|
| **Arbitrum Stylus** | The entire risk-scoring + exit-decision engine (Rust) | `packages/risk-engine` |
| **Robinhood Chain** | Primary deploy target; Stock Tokens are the protected RWA positions | `SwapExitAdapter`, chain configs |
| **Chainlink** | Trustless on-chain oracle-deviation signal + L2 sequencer-uptime guard | `AegisVault.checkOracle`, `signals/chainlink.ts` |
| **ERC-8004** | Register the guardian's identity; write portable exit-outcome reputation | `agent/src/erc8004` |
| **x402** | Paid "priority exit" endpoint (USDC settlement on Arbitrum via CDP) | `agent/src/x402` |
| **ERC-7715 / Delegation** | Keeper modelled as a scoped session key — bounded custody | `AegisVault` (KEEPER_ROLE), `executor/client.ts` |
| **Forta** | Real-time threat feed mapped to attack classes (live API + offline stub) | `agent/src/signals/forta.ts` |
| **grammY** | Telegram action surface: status, risk, confirm | `agent/src/telegram` |

## Repo layout

```
aegis/
├── packages/
│   ├── risk-engine/     Arbitrum Stylus (Rust) — the verifiable decision engine  ★
│   ├── contracts/       Solidity — AegisVault bounded executor, adapters, mocks, tests
│   ├── agent/           TypeScript — signal aggregation, keeper, ERC-8004, x402, Telegram
│   └── web/             Next.js — the tactical guardian console (the demo)
├── docs/
│   ├── ARCHITECTURE.md  the design + the cross-VM seam
│   ├── LOCAL_SETUP.md   clean-machine → running demo (all three toolchains)
│   ├── DEMO_SCRIPT.md   ~3-minute judge walkthrough
│   └── diagrams/architecture.svg
└── .env.example
```

## Quickstart

The fastest way to see it (no toolchain, no wallet, no deploy):

```bash
cd packages/web && npm install && npm run dev   # http://localhost:3000
```

Arm the guardian and inject a threat scenario — the gauge is driven by a faithful
mirror of the on-chain scoring, so every number matches the Stylus engine.

Full end-to-end (Stylus + Foundry + agent + web) is in
[`docs/LOCAL_SETUP.md`](./docs/LOCAL_SETUP.md). Verify the scoring core right now
with zero setup:

```bash
cd packages/risk-engine && cargo test
```

## Deployed addresses

| Contract | Network | Address |
|---|---|---|
| RiskEngine (Stylus) | Robinhood / Arb Sepolia | _filled in at deploy_ |
| AegisVault | Robinhood / Arb Sepolia | _filled in at deploy_ |
| Aave V3 Pool (used) | Arbitrum Sepolia | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| Chainlink ETH/USD | Arbitrum One | `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612` |
| ERC-8004 Identity | Arbitrum Sepolia | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Reputation | Arbitrum Sepolia | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

> **Chain note.** Robinhood Chain testnet (`46630`) is the primary target but has
> no confirmed DeFi protocols yet, and Stylus enablement there is validated on
> day one (`cargo stylus check --endpoint=<RHC RPC>`). The design is
> chain-agnostic: the engine deploys wherever Stylus is enabled, and the
> Aave/Chainlink integrations run on Arbitrum Sepolia.

## What's verified in this repo

- ✅ **Scoring core** — pure-Rust unit tests (`cargo test`), no Stylus toolchain needed.
- ✅ **Agent** — `tsc --noEmit` clean.
- ✅ **Web** — `npm run build`.
- 🔧 **Stylus engine** — compiles/deploys with Rust 1.88 + cargo-stylus + Docker (see LOCAL_SETUP).
- 🔧 **Contracts** — `forge test` after `forge install forge-std openzeppelin-contracts`.

## License

MIT — see [LICENSE](./LICENSE).
