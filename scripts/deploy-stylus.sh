#!/usr/bin/env bash
# Activate the REAL Arbitrum Stylus engine and wire the Solidity side to it.
# Run this on a normal networked machine (NOT a restricted sandbox): it needs
# crates.io, Docker, a Stylus-enabled RPC, and a funded deployer key.
#
# You provide (env):
#   export STYLUS_RPC=https://sepolia-rollup.arbitrum.io/rpc   # or your RHC RPC
#   export DEPLOYER_KEY=0x<funded private key>
# Optional: KEEPER_ADDRESS, SWAP_ROUTER_ADDRESS, AAVE_POOL_ADDRESS, SEQUENCER_FEED_ADDRESS
# Optional: ENGINE=0x... to skip (re-)deploying and only init + wire the vault.
#
# Requires: Docker running, cargo-stylus, foundry (forge + cast), Rust 1.88 + wasm target.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Auto-load a gitignored deploy env (DEPLOYER_KEY + STYLUS_RPC) if present.
if [ -f "$ROOT/.env.deploy.local" ]; then
  set -a; . "$ROOT/.env.deploy.local"; set +a
fi
: "${STYLUS_RPC:?set STYLUS_RPC to a Stylus-enabled RPC}"
: "${DEPLOYER_KEY:?set DEPLOYER_KEY to a funded deployer private key}"

if [ -z "$ENGINE" ]; then
  echo "==> 1/6  Generate Cargo.lock (cargo-stylus builds with --locked)"
  ( cd "$ROOT/packages/risk-engine" && cargo generate-lockfile )

  echo "==> 2/6  Build-check the Stylus engine (reproducible build in Docker)"
  ( cd "$ROOT/packages/risk-engine" && cargo stylus check --endpoint "$STYLUS_RPC" )

  echo "==> 3/6  Deploy + activate the Stylus engine"
  DEPLOY_LOG="$(mktemp)"
  ( cd "$ROOT/packages/risk-engine" && cargo stylus deploy --endpoint "$STYLUS_RPC" --private-key "$DEPLOYER_KEY" ) \
    | tee "$DEPLOY_LOG"
  ENGINE="$(grep -oiE '0x[0-9a-f]{40}' "$DEPLOY_LOG" | head -1)"
  [ -n "$ENGINE" ] || { echo "!! could not parse engine address; re-run with ENGINE=0x... set"; exit 1; }
fi
echo "==> engine: $ENGINE"

echo "==> 4/6  Initialize the engine (one-time init())"
cast send "$ENGINE" "init()" --rpc-url "$STYLUS_RPC" --private-key "$DEPLOYER_KEY" >/dev/null || \
  echo "   (init() already called? continuing)"

echo "==> 5/6  Parity check: corroborated bridge-verifier must score 10000 / 3 / true"
cast call "$ENGINE" "score(uint8[],uint8[],uint256[],uint256[],uint256[])(uint256,uint8,bool)" \
  "[0,1]" "[3,3]" "[8000,8000]" "[8000,8000]" "[0,0]" --rpc-url "$STYLUS_RPC"

echo "==> 6/6  Deploy the Solidity vault wired to the Stylus engine"
( cd "$ROOT/packages/contracts" && \
  RISK_ENGINE_ADDRESS="$ENGINE" PRIVATE_KEY="$DEPLOYER_KEY" \
  forge script script/Deploy.s.sol --rpc-url "$STYLUS_RPC" --broadcast )

echo ""
echo "Stylus engine live at: $ENGINE"
echo "Point the web/agent at it (engine + the vault printed above):"
echo "  packages/web/.env.local : NEXT_PUBLIC_ENGINE_ADDRESS=$ENGINE  + VAULT/CHAIN_ID/assets"
echo "Same IRiskEngine ABI as LocalRiskEngine, so no app code changes."
