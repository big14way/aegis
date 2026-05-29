# `@aegis/web` — guardian console

A single-screen tactical console: arm the guardian, watch threat signals stream
in, see the **corroborated risk score computed by the Stylus engine's algorithm**
on a live gauge, and watch a bounded auto-exit fire when signals corroborate.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

Runs out-of-the-box in **DEMO** mode (no wallet or deployed contracts needed) —
the gauge is driven by a faithful TS mirror of the on-chain Rust scoring core, so
every number matches what the Stylus engine would return.

## Demo flow

1. **Arm Guardian** → state goes `ARMED`, the engine starts evaluating.
2. Click **Oracle manipulation** or **Bridge verifier exploit** → two distinct
   sources corroborate, the gauge crosses the T3 line, state goes **FIRED**, and
   the position consolidates into USDC (bounded by the cap).
3. Click **Single strong signal** → one un-corroborated alert → **CONFIRM**
   window opens → press **Confirm Exit Now**.
4. Click **Stale intel** → a severe but 31-minute-old alert decays to zero on the
   gauge — the engine refuses to fire on stale data.

## LIVE mode (optional)

Set these in `.env.local` to read/write real contracts (the badge flips to LIVE):

```
NEXT_PUBLIC_ENGINE_ADDRESS=0x...        # activated Stylus engine
NEXT_PUBLIC_VAULT_ADDRESS=0x...         # deployed AegisVault
NEXT_PUBLIC_WC_PROJECT_ID=...           # WalletConnect project id
# To enable live arm/confirm writes:
NEXT_PUBLIC_SOURCE_ASSET=0x...
NEXT_PUBLIC_TARGET_ASSET=0x...
NEXT_PUBLIC_ADAPTER=0x...
NEXT_PUBLIC_PROTECTED_USER=0x...
```

Connect a wallet (Arbitrum Sepolia or Robinhood Chain testnet) via the header
button; arm/disarm/confirm then submit real transactions to the vault, which
enforces the cap/asset/adapter bounds.

## Design / stack notes

- **Aesthetic:** "tactical defense console" — obsidian + a single molten-amber
  command accent escalating to red at FIRED. Type is **Chakra Petch** (display) +
  **IBM Plex Mono** (data). No localStorage/sessionStorage — all state is in
  React memory.
- **Stack:** Next.js 15 (App Router) · wagmi v2 · viem v2 · RainbowKit v2 ·
  TanStack Query v5 · Tailwind v3.4. Tailwind v3.4 is chosen over v4 for a
  hand-authored config that builds reliably across environments.
