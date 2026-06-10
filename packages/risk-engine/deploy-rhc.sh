#!/usr/bin/env bash
# Reproducible Stylus deploy of the Aegis RiskEngine to Robinhood Chain testnet.
# Sources DEPLOYER_KEY from .env.deploy.local (gitignored). Never echoes the key.
set -uo pipefail
cd "$(dirname "$0")"
set -a; source ../../.env.deploy.local; set +a
RHC_RPC="https://rpc.testnet.chain.robinhood.com"
export CARGO_HOME="$PWD/.cargo-cache"
export RUSTUP_TOOLCHAIN="1.88-x86_64-apple-darwin"

for attempt in 1 2 3; do
  echo "=== RHC deploy attempt $attempt ($(date +%H:%M:%S)) ==="
  cargo stylus deploy \
    --endpoint="$RHC_RPC" \
    --private-key="$DEPLOYER_KEY" \
    --max-fee-per-gas-gwei 0.2
  rc=$?
  echo "exit=$rc"
  if [ "$rc" -eq 0 ]; then echo "DEPLOY_OK"; break; fi
  echo "attempt $attempt failed; retrying in 6s..."; sleep 6
done
echo "DEPLOY_SCRIPT_DONE rc=$rc"
