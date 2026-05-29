# `@aegis/agent` — signals, orchestration & action surface

The off-chain layer. It gathers threat signals, forwards them to the verifiable
Stylus engine for a decision, and — only when the engine says so — has the
bounded keeper submit a transaction to `AegisVault`. It never decides to move
funds on its own.

```
signals ─▶ prepare (hygiene) ─▶ Stylus engine.score() ─▶ verdict
                                                            │
                         T2 ▶ open confirmation window ◀────┤
                         T3 ▶ keeper → vault.evaluateAndExit ┘
                                                            │
                                              Telegram alert ▼  (grammY)
```

## Pieces

| Path | Role | Sponsor |
|---|---|---|
| `signals/forta.ts` | Threat-intel feed (live API + deterministic stub) | **Forta** |
| `signals/chainlink.ts` | Trustless on-chain oracle-deviation signal via `vault.checkOracle` | **Chainlink** |
| `signals/corroborator.ts` | Cheap off-chain hygiene (the corroboration *bonus* is on-chain) | — |
| `engine/client.ts` | Reads the Stylus engine's `score()` | **Arbitrum Stylus** |
| `executor/client.ts` | Keeper submits to the bounded vault (scoped session key) | **ERC-7715** |
| `erc8004/registry.ts` | Registers the guardian; writes exit-outcome reputation | **ERC-8004** |
| `x402/server.ts` | 402-gated premium "priority exit" endpoint | **x402 / CDP** |
| `telegram/bot.ts` | Human action surface (status / risk / confirm) | **grammY** |

## Run

```bash
npm install
cp ../../.env.example .env   # fill in addresses + keys

# Read-only preview (no keys needed — logs verdicts using the stub feed):
RISK_ENGINE_ADDRESS=0x... npm run start

# Full loop (bounded exits armed):
#   set KEEPER_PRIVATE_KEY (a scoped session key) + AEGIS_VAULT_ADDRESS + PROTECTED_USER
npm run start

# Standalone surfaces:
npm run bot     # Telegram bot only
npm run x402    # x402 paid-action server only
npm run typecheck
```

## Notes on the sponsor integrations

- **x402:** `x402/server.ts` implements the spec's 402 flow with plain Express so
  it builds dependency-free. Swap in `@x402/express` + the Coinbase CDP
  facilitator (supports Arbitrum) for real USDC settlement — see the comment at
  the top of the file.
- **ERC-7715 / bounded custody:** the keeper key is modelled as a scoped session
  key. In production, mint it with the MetaMask Delegation Toolkit
  (`wallet_grantPermissions`) so it can *only* call the keeper methods. The vault
  enforces the cap/asset/adapter bounds regardless of key scope.
- **Forta:** without `FORTA_API_KEY` a deterministic synthetic alert is emitted
  so the demo runs offline; with a key, live HIGH/CRITICAL alerts are mapped to
  Aegis attack classes by `classifyFinding`.
