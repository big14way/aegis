# Local setup — end to end

This walks from a clean machine to a running demo. Three toolchains are involved:
**Rust + Stylus** (engine), **Foundry** (Solidity), **Node** (agent + web).

## 0. Prerequisites

```bash
# Node 20+
node --version

# Rust 1.88+ with the wasm target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup toolchain install 1.88
rustup target add wasm32-unknown-unknown

# cargo-stylus (Stylus toolchain) — needs Docker running for reproducible builds
cargo install cargo-stylus
docker --version   # Docker Desktop / engine must be running for `cargo stylus deploy`

# Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

## 1. Risk engine (Stylus / Rust)

```bash
cd packages/risk-engine

# Unit-test the pure scoring core — NO Stylus toolchain / Docker needed:
cargo test

# Validate it compiles to a valid Stylus program for your target chain.
# Day-1 check: confirm Stylus is enabled on Robinhood Chain testnet.
cargo stylus check --endpoint=https://rpc.testnet.chain.robinhood.com
# If that errors (Stylus not enabled on RHC yet), use Arbitrum Sepolia instead:
cargo stylus check --endpoint=$ARBITRUM_SEPOLIA_RPC_URL

# Deploy + activate (2 txs). Then call init() once.
cargo stylus deploy --endpoint=$RPC_URL --private-key=$DEPLOYER_KEY
# export the Solidity ABI the executor expects:
cargo stylus export-abi
```

Record the deployed engine address → `RISK_ENGINE_ADDRESS`.

## 2. Contracts (Foundry)

```bash
cd ../contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
forge build
forge test -vv                                  # full lifecycle suite
forge test --match-contract GasBench -vv        # prints the Solidity baseline gas

# Local end-to-end with the mock stack (no external protocols):
anvil &
forge script script/DeployMocks.s.sol --rpc-url http://localhost:8545 --broadcast

# Live: wire the Solidity side to the deployed Stylus engine:
RISK_ENGINE_ADDRESS=0x... KEEPER_ADDRESS=0x... \
  forge script script/Deploy.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast --verify
```

Record the vault + adapter addresses.

## 3. Agent (TypeScript)

```bash
cd ../agent
npm install
cp ../../.env.example .env     # fill RISK_ENGINE_ADDRESS at minimum

# Read-only preview (decisions logged, nothing executed):
npm run start

# Full loop (bounded exits armed): also set KEEPER_PRIVATE_KEY (a scoped session
# key), AEGIS_VAULT_ADDRESS, PROTECTED_USER, and optionally FORTA_API_KEY /
# TELEGRAM_BOT_TOKEN / price-feed vars, then:
npm run start
```

## 4. Web console

```bash
cd ../web
npm install
npm run dev        # http://localhost:3000  (DEMO mode out of the box)
```

For LIVE mode set the `NEXT_PUBLIC_*` vars (see `packages/web/README.md`).

## 5. Full demo

1. `npm run dev` in `packages/web`, open the console.
2. **Arm Guardian**, then inject **Oracle manipulation** — watch the gauge cross
   T3 and the position consolidate to USDC.
3. Try **Single strong signal** (T2 confirm window) and **Stale intel** (decays
   to zero).
4. (Optional, live) run the agent loop against your deployed contracts and watch
   `evaluateAndExit` land on-chain + the Telegram alert fire.

## Environment matrix (what runs where)

| Layer | Needs | Validated here? |
|---|---|---|
| Scoring core (`scoring.rs`) | `cargo test` | ✅ pure Rust unit tests |
| Stylus engine (`lib.rs`) | Rust 1.88 + cargo-stylus + Docker | compiles via the toolchain above |
| Contracts | Foundry + `forge install` | `forge test` |
| Agent | Node 20+ | ✅ `tsc --noEmit` clean |
| Web | Node 20+ | `npm run build` |
