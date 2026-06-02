# Activating the real Arbitrum Stylus engine

Aegis ships two interchangeable implementations of the **same** `IRiskEngine` ABI:

| Engine | Where | Used for |
|---|---|---|
| `LocalRiskEngine` (Solidity) | `packages/contracts/src/dev/LocalRiskEngine.sol` | local anvil / any plain EVM — the on-chain demo runs end to end with this |
| `RiskEngine` (Rust / Stylus) | `packages/risk-engine/src/lib.rs` | production on a Stylus-enabled chain |

Both run the identical scoring algorithm (the Solidity side via `ScoringLib`, the
Rust side via `scoring.rs`), and both expose `score`, `evaluate`, `deviationBps`,
`thresholds`, `classWeight`, `sourceWeight`, `isAutoFireClass`. **The vault, agent,
and dashboard wire against the ABI, not the implementation — so switching to Stylus
is an address swap, no app code changes.**

> The local on-chain stack (anvil + `LocalRiskEngine`) is brought up with
> `bash scripts/deploy-local.sh`. The steps below replace that engine with the
> real Stylus contract. They require **crates.io + Docker + a funded key**, so they
> must run on a normal networked machine (not inside a restricted sandbox).

## Prerequisites

```bash
rustup toolchain install 1.88 && rustup target add wasm32-unknown-unknown
cargo install cargo-stylus
docker info >/dev/null            # Docker must be running (reproducible builds)
export RPC=<a Stylus-enabled RPC>     # Arbitrum Sepolia or Robinhood Chain testnet
export KEY=<funded deployer private key>
```

## 1 — Build & sanity-check the Stylus program

```bash
cd packages/risk-engine
cargo test                                   # pure scoring core (no toolchain needed)
cargo stylus check --endpoint=$RPC           # confirms Stylus is enabled on the chain
```

## 2 — Deploy + activate + initialize

```bash
cargo stylus deploy --endpoint=$RPC --private-key=$KEY   # prints the engine address
export ENGINE=0x...                                      # <- from the deploy output
cast send $ENGINE "init()" --rpc-url $RPC --private-key $KEY   # one-time owner/config init
```

## 3 — Verify ABI parity against the Solidity engine

The Stylus engine must return the same verdict the local engine does. A corroborated
bridge-verifier pair auto-fires (tier 3):

```bash
cast call $ENGINE "score(uint8[],uint8[],uint256[],uint256[],uint256[])(uint256,uint8,bool)" \
  "[0,1]" "[3,3]" "[8000,8000]" "[8000,8000]" "[0,0]" --rpc-url $RPC
# expect: 10000, 3, true   (identical to LocalRiskEngine)
```

## 4 — Deploy the Solidity side wired to the Stylus engine

```bash
cd ../contracts
RISK_ENGINE_ADDRESS=$ENGINE KEEPER_ADDRESS=<agent session key> \
  SWAP_ROUTER_ADDRESS=<uniswap v3 router> SEQUENCER_FEED_ADDRESS=<chainlink seq feed> \
  forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --verify
```

Record the printed `AegisVault` (and adapter) addresses.

## 5 — Point the frontend + agent at Stylus

Set the same env keys `scripts/gen-env.mjs` writes, but with the Stylus engine +
the new vault/chain:

```bash
# packages/web/.env.local
NEXT_PUBLIC_CHAIN_ID=421614            # or 46630 for Robinhood Chain
NEXT_PUBLIC_ENGINE_ADDRESS=$ENGINE     # the Stylus engine
NEXT_PUBLIC_VAULT_ADDRESS=<vault from step 4>
NEXT_PUBLIC_ADAPTER=<adapter>
NEXT_PUBLIC_SOURCE_ASSET=<protected asset>
NEXT_PUBLIC_TARGET_ASSET=<USDC>
NEXT_PUBLIC_PROTECTED_USER=<user>
```

Also remember to add that chain's RPC to `packages/web/src/lib/chains.ts` /
`packages/agent/src/lib/chains.ts` if it isn't already there.

`npm run web` now reads `score()` from the **Stylus** engine; `npm run agent`
submits `evaluateAndExit` against the same vault. Nothing else changes — the gas the
scoring costs drops to the Stylus price, which is the whole point.
