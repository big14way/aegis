# `@aegis/contracts` — Solidity executor + integrations

The bounded, non-custodial executor that gates every crisis exit on the verdict
of the Stylus [`RiskEngine`](../risk-engine). The judgement is verifiable Rust;
the executor here is deliberately dumb and tightly bounded.

## Layout

```
src/
  AegisVault.sol            Bounded executor: arm/disarm, evaluateAndExit, confirmExit, checkOracle
  interfaces/
    IRiskEngine.sol         Solidity view of the Stylus engine ABI (the cross-VM seam)
    IAaveV3Pool.sol         Aave V3 Pool (withdraw/repay/getUserAccountData)
    IAggregatorV3.sol       Chainlink price + L2 sequencer uptime feeds
    IERC8004.sol            Trustless Agents identity + reputation registries
    IExitAdapter.sol        Pluggable protocol-specific unwind routine
    ISwapRouter.sol         Uniswap-v3-style exactInputSingle
    IERC20.sol
  adapters/
    AaveExitAdapter.sol     Unwinds an Aave V3 supply position
    SwapExitAdapter.sol     Consolidates a position into a safe asset via a DEX (Stock Tokens)
  mocks/                    Deterministic stand-ins for local tests + demo
    MockRiskEngine.sol      Settable (score, tier, flag) — stands in for the Stylus engine
    MockExitAdapter.sol     1:1 delivery — simplest end-to-end demo path
    MockERC20.sol           Mintable/burnable ERC-20
    MockSwapRouter.sol      1:1 swap router
    MockAaveV3Pool.sol      1:1 Aave withdraw
    MockAggregatorV3.sol    Settable Chainlink feed / sequencer feed
    ReferenceScorerSol.sol  Faithful Solidity port of scoring.rs (gas-benchmark baseline ONLY)
script/
  Deploy.s.sol              Deploy + wire against a live engine (reads RISK_ENGINE_ADDRESS)
  DeployMocks.s.sol         Full local mock stack (Anvil / Nitro devnode)
test/
  AegisVault.t.sol          Full lifecycle: auto-fire, alert, T2 window + expiry, bounds, RBAC, oracle
  GasBench.t.sol            Solidity baseline gas + behavioural parity with the Rust core
```

## How the "bind the agent, not the keys" bound works

A user never grants custody or an unbounded approval. They grant the vault a
*bounded* ERC-20 allowance and call `arm(sourceAsset, targetAsset, adapter, maxExitAmount, t2WindowSecs)`.
Three on-chain invariants then constrain the keeper (the agent's session key,
scoped via ERC-7715 in production):

1. only `KEEPER_ROLE` may call `evaluateAndExit` / `confirmExit`;
2. funds move **only** when the engine returns `exitFlag == true` (auto-fire) or
   the user confirms a T2 decision in-window;
3. the amount moved is `min(allowance, balance, maxExitAmount)`, delivered only
   into the user's chosen `targetAsset`, only through an allow-listed adapter.

## Verified addresses used here

| Thing | Network | Address |
|---|---|---|
| Aave V3 Pool | Arbitrum (One + Sepolia) | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| Chainlink ETH/USD | Arbitrum One | `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612` |
| Sequencer Uptime Feed | Arbitrum One | `0xFdB631F5EE196F0ed6FAa767959853A9F217697D` |
| ERC-8004 Identity | Arbitrum Sepolia | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Reputation | Arbitrum Sepolia | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

> Robinhood Chain testnet (chain `46630`) has **no confirmed DeFi protocols**;
> use `SwapExitAdapter` pointed at a configured router for Stock Tokens, and run
> Aave/Chainlink-dependent logic on Arbitrum Sepolia. See the root README.

## Setup

```bash
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
forge build
forge test -vv
```

## Gas benchmark (Stylus vs Solidity)

```bash
# Solidity baseline (this repo):
forge test --match-contract GasBench -vv      # prints ReferenceScorerSol gas

# Stylus engine (see ../risk-engine/README.md):
cargo stylus deploy --estimate-gas --endpoint=$ARBITRUM_SEPOLIA_RPC_URL ...
# then call score() and read the gas used from the receipt / cargo stylus replay
```

`ReferenceScorerSol` runs the *identical* algorithm to the Rust core, so the two
numbers are directly comparable. Arbitrum's own iterative-scoring demo reports
**>90% less gas** in Stylus for this class of workload.

## Deploy

```bash
# Live (Arbitrum Sepolia), wiring to an already-activated Stylus engine:
RISK_ENGINE_ADDRESS=0x... KEEPER_ADDRESS=0x... \
  forge script script/Deploy.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast --verify

# Local demo stack:
anvil &
forge script script/DeployMocks.s.sol --rpc-url http://localhost:8545 --broadcast
```
