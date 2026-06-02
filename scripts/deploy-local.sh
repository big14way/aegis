#!/usr/bin/env bash
# One-command local on-chain bring-up:
#   1) ensure anvil is running, 2) deploy the full Aegis stack (LocalRiskEngine +
#   vault + adapters), 3) generate web/.env.local + agent/.env. Then `npm run web`.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
RPC="${RPC_URL:-http://127.0.0.1:8545}"

rpc_up() {
  curl -s "$RPC" -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1
}

if ! rpc_up; then
  echo "starting anvil..."
  anvil --silent >/tmp/aegis_anvil.log 2>&1 &
  for _ in $(seq 1 20); do rpc_up && break; sleep 0.5; done
fi

echo "deploying Aegis local stack to $RPC ..."
cd packages/contracts
forge script script/DeployLocal.s.sol --rpc-url "$RPC" --broadcast
cd "$ROOT"

echo "generating env files..."
node scripts/gen-env.mjs

echo ""
echo "Local on-chain stack is up. Next:"
echo "  npm run web     # http://localhost:3000  (LIVE mode, reads the chain)"
echo "  npm run agent   # optional: keeper loop submits verdicts on-chain"
