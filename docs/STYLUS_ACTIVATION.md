# Activating the real Arbitrum Stylus engine

Aegis ships two interchangeable engines behind the **same `IRiskEngine` ABI**:

| Engine | File | Used for |
|---|---|---|
| `LocalRiskEngine` (Solidity) | `packages/contracts/src/dev/LocalRiskEngine.sol` | local anvil / any plain EVM — the on-chain demo (`npm run deploy:local`) |
| `RiskEngine` (Rust / Stylus) | `packages/risk-engine/src/lib.rs` | production on a Stylus-enabled chain |

Both run the identical algorithm (`ScoringLib` in Solidity, `scoring.rs` in Rust)
and expose `score`, `evaluate`, `deviationBps`, `thresholds`, `classWeight`,
`sourceWeight`, `isAutoFireClass`. **The vault, agent, and dashboard wire against
the ABI, not the implementation — so going from the local MVP to Stylus is an
address swap, no app-code changes.**

## What you must provide (and why this runs on your machine)

The deploy can't run from a restricted sandbox: dependency resolution needs
**crates.io**, the reproducible build needs **Docker**, and the deploy tx needs a
**Stylus RPC** + a **funded deployer key**. All four are yours.

1. **Docker running** — `docker info` should succeed (reproducible Stylus build).
2. **Toolchain** — `cargo install cargo-stylus` (already 0.6.1 here), `rustup toolchain install 1.88 && rustup target add wasm32-unknown-unknown`, and Foundry (`forge`, `cast`).
3. **A Stylus-enabled RPC** — Arbitrum Sepolia `https://sepolia-rollup.arbitrum.io/rpc` (or your Robinhood Chain testnet RPC).
4. **A funded deployer key** — fund it with Arbitrum Sepolia ETH from a faucet (e.g. the Alchemy / QuickNode Arbitrum Sepolia faucet, or bridge Sepolia ETH).

## One command

```bash
export STYLUS_RPC=https://sepolia-rollup.arbitrum.io/rpc
export DEPLOYER_KEY=0x<your funded key>
bash scripts/deploy-stylus.sh
```

That script runs all six steps below and prints the engine + vault addresses.

## Or step by step

```bash
cd packages/risk-engine

# 0) lock file — cargo-stylus builds with --locked, so it must exist first.
cargo generate-lockfile            # commit the resulting Cargo.lock for reproducibility
cargo test                         # (optional) re-derive the scoring core locally

# 1) compile-check the program for the target chain (uses Docker)
cargo stylus check --endpoint "$STYLUS_RPC"

# 2) deploy + activate (one command in cargo-stylus 0.6.1)
cargo stylus deploy --endpoint "$STYLUS_RPC" --private-key "$DEPLOYER_KEY"
#    -> note the "deployed code at address: 0x..." line
export ENGINE=0x...

# 3) one-time initialize (the engine uses init(), not a Stylus constructor)
cast send "$ENGINE" "init()" --rpc-url "$STYLUS_RPC" --private-key "$DEPLOYER_KEY"

# 4) ABI parity check — must match LocalRiskEngine exactly (10000 / 3 / true)
cast call "$ENGINE" "score(uint8[],uint8[],uint256[],uint256[],uint256[])(uint256,uint8,bool)" \
  "[0,1]" "[3,3]" "[8000,8000]" "[8000,8000]" "[0,0]" --rpc-url "$STYLUS_RPC"

# 5) deploy the Solidity vault wired to the Stylus engine
cd ../contracts
RISK_ENGINE_ADDRESS=$ENGINE PRIVATE_KEY=$DEPLOYER_KEY \
  KEEPER_ADDRESS=<agent session key> SWAP_ROUTER_ADDRESS=<uniswap v3 router> \
  SEQUENCER_FEED_ADDRESS=<chainlink seq feed> \
  forge script script/Deploy.s.sol --rpc-url "$STYLUS_RPC" --broadcast --verify
```

## Point the frontend + agent at Stylus

Set the same keys `scripts/gen-env.mjs` writes, but with the Stylus engine, the new
vault, and the live chain id:

```bash
# packages/web/.env.local
NEXT_PUBLIC_CHAIN_ID=421614              # 46630 for Robinhood Chain
NEXT_PUBLIC_ENGINE_ADDRESS=$ENGINE       # the Stylus engine
NEXT_PUBLIC_VAULT_ADDRESS=<vault from step 5>
NEXT_PUBLIC_ADAPTER=<adapter>
NEXT_PUBLIC_SOURCE_ASSET=<protected asset>
NEXT_PUBLIC_TARGET_ASSET=<USDC>
NEXT_PUBLIC_PROTECTED_USER=<user>
```

Add that chain's RPC to `packages/web/src/lib/chains.ts` and
`packages/agent/src/lib/chains.ts` if it isn't already there. Then `npm run web`
reads `score()` from the **Stylus** engine and `npm run agent` submits
`evaluateAndExit` against the same vault — the scoring gas drops to the Stylus
price, which is the entire point.

## Troubleshooting

- **`lock file ... needs to be updated but --locked was passed`** — run
  `cargo generate-lockfile` first (step 0). This is what blocks a no-network build.
- **`cargo stylus check` can't reach the endpoint** — Stylus isn't enabled on that
  chain, or the RPC is wrong; try Arbitrum Sepolia.
- **`init()` reverts with AlreadyInitialized** — the engine was already initialized; skip it.
- **Docker errors** — ensure `docker info` works; cargo-stylus pulls
  `offchainlabs/cargo-stylus-base` on first run.
