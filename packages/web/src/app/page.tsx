"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Dashboard } from "@/components/Dashboard";

export default function Page() {
  return (
    <main className="relative z-10 mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-10">
      {/* Header */}
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <ShieldMark />
            <h1 className="font-display text-3xl font-700 tracking-tightest text-bone">
              AEGIS
            </h1>
            <span className="font-display text-[9px] tracking-widest2 text-amber border border-amber/50 px-2 py-1 mt-1">
              GUARDIAN
            </span>
          </div>
          <p className="font-mono text-[11px] text-bone-dim mt-2 max-w-xl leading-relaxed">
            Crisis-response guardian for DeFi & RWA. The risk score and exit
            decision are computed <span className="text-bone">on-chain in Arbitrum Stylus</span> —
            execution is bounded, non-custodial, and verifiable.
          </p>
        </div>
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      </header>

      <Dashboard />

      {/* Footer */}
      <footer className="mt-10 border-t border-obsidian-600 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-bone-faint">
          Stylus risk engine · Solidity bounded executor · ERC-8004 · x402 · Chainlink
        </span>
        <span className="font-mono text-[10px] text-bone-faint">
          Arbitrum Open House — London Buildathon 2026
        </span>
      </footer>
    </main>
  );
}

function ShieldMark() {
  return (
    <svg width="30" height="34" viewBox="0 0 30 34" fill="none" aria-hidden>
      <path
        d="M15 1 L28 6 V16 C28 25 22 30 15 33 C8 30 2 25 2 16 V6 Z"
        stroke="#f5a623"
        strokeWidth="1.5"
        fill="rgba(245,166,35,0.06)"
      />
      <path d="M15 9 L15 24 M9 15 L21 15" stroke="#f5a623" strokeWidth="1.5" />
    </svg>
  );
}
