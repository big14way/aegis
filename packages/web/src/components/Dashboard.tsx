"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { computeScore, type Signal } from "@/lib/scoring";
import { SCENARIOS, baselineSignals, type Scenario } from "@/lib/sim";
import { VAULT_ADDRESS, ENGINE_ADDRESS } from "@/lib/wagmi";
import { aegisVaultAbi } from "@/lib/abi";
import { GuardianStatus } from "./GuardianStatus";
import { RiskGauge } from "./RiskGauge";
import { SignalFeed } from "./SignalFeed";
import { GuardianControl } from "./GuardianControl";
import { PositionList, type Position } from "./PositionList";

const POSITIONS: Position[] = [
  { symbol: "tTSLA", protocol: "Robinhood Chain · Stock Token", amount: 540, usdValue: 182_400 },
  { symbol: "aUSDC", protocol: "Aave V3 · Arbitrum", amount: 95_000, usdValue: 95_000 },
];

export function Dashboard() {
  const { isConnected, chain } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [armed, setArmed] = useState(false);
  const [signals, setSignals] = useState<Signal[]>(() => baselineSignals());
  const [activeKey, setActiveKey] = useState("nominal");
  const [confirmed, setConfirmed] = useState(false);
  const [exitedLatch, setExitedLatch] = useState(false);

  const engineMode = ENGINE_ADDRESS ? "LIVE" : "DEMO";
  const chainName = chain?.name ?? "Arbitrum Sepolia";

  const decision = useMemo(() => computeScore(signals), [signals]);

  // Latch FIRED so the gauge can keep decaying without un-firing the exit.
  useEffect(() => {
    if (armed && (decision.exitFlag || confirmed) && !exitedLatch) {
      setExitedLatch(true);
    }
  }, [armed, decision.exitFlag, confirmed, exitedLatch]);

  // Live signal decay: age every signal by 1s so the console feels alive.
  useEffect(() => {
    if (!armed) return;
    const t = setInterval(() => {
      setSignals((prev) => prev.map((s) => ({ ...s, ageSecs: s.ageSecs + 1 })));
    }, 1000);
    return () => clearInterval(t);
  }, [armed]);

  const exited = armed && exitedLatch;
  const vaultState: "DISARMED" | "ARMED" | "CONFIRM" | "FIRED" = !armed
    ? "DISARMED"
    : exited
      ? "FIRED"
      : decision.tier === 2
        ? "CONFIRM"
        : "ARMED";

  function reset(key = "nominal") {
    const sc = SCENARIOS.find((s) => s.key === key) ?? SCENARIOS[0];
    setSignals(sc.signals.map((s) => ({ ...s })));
    setActiveKey(key);
    setConfirmed(false);
    setExitedLatch(false);
  }

  async function handleArm() {
    setArmed(true);
    reset("nominal");
    await maybeWrite("arm");
  }

  function handleDisarm() {
    setArmed(false);
    setConfirmed(false);
    setExitedLatch(false);
    void maybeWrite("disarm");
  }

  function handleScenario(s: Scenario) {
    setSignals(s.signals.map((x) => ({ ...x })));
    setActiveKey(s.key);
    setConfirmed(false);
    setExitedLatch(false);
  }

  async function handleConfirm() {
    setConfirmed(true);
    await maybeWrite("confirmExit");
  }

  // Best-effort on-chain write when an address + wallet are present; otherwise
  // a pure demo. The vault enforces all bounds regardless.
  async function maybeWrite(fn: "arm" | "disarm" | "confirmExit") {
    if (!VAULT_ADDRESS || !isConnected) return;
    try {
      if (fn === "confirmExit") {
        await writeContractAsync({
          address: VAULT_ADDRESS,
          abi: aegisVaultAbi,
          functionName: "confirmExit",
          args: [(process.env.NEXT_PUBLIC_PROTECTED_USER ?? "0x0000000000000000000000000000000000000000") as `0x${string}`],
        });
      } else if (fn === "disarm") {
        await writeContractAsync({ address: VAULT_ADDRESS, abi: aegisVaultAbi, functionName: "disarm", args: [] });
      } else if (fn === "arm") {
        const src = process.env.NEXT_PUBLIC_SOURCE_ASSET as `0x${string}` | undefined;
        const tgt = process.env.NEXT_PUBLIC_TARGET_ASSET as `0x${string}` | undefined;
        const adapter = process.env.NEXT_PUBLIC_ADAPTER as `0x${string}` | undefined;
        if (src && tgt && adapter) {
          await writeContractAsync({
            address: VAULT_ADDRESS,
            abi: aegisVaultAbi,
            functionName: "arm",
            args: [src, tgt, adapter, 2n ** 255n, 600n],
          });
        }
      }
    } catch (err) {
      console.warn(`[live] ${fn} write skipped/failed:`, (err as Error).message);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Left rail: command */}
      <div className="lg:col-span-3 order-2 lg:order-1">
        <GuardianControl
          armed={armed}
          vaultState={vaultState}
          scenarios={SCENARIOS}
          activeKey={activeKey}
          onArm={handleArm}
          onDisarm={handleDisarm}
          onScenario={handleScenario}
          onConfirm={handleConfirm}
          onReset={() => reset("nominal")}
        />
      </div>

      {/* Center: status + gauge */}
      <div className="lg:col-span-5 order-1 lg:order-2 space-y-4">
        <GuardianStatus vaultState={vaultState} engineMode={engineMode} chainName={chainName} />
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="label text-[11px]">Corroborated Risk Score</div>
            <div className="font-mono text-[10px] text-bone-faint">
              {engineMode === "LIVE" ? "← read from Stylus engine" : "← Stylus algorithm (preview)"}
            </div>
          </div>
          <RiskGauge scoreBps={decision.scoreBps} tier={decision.tier} />
          <div className="grid grid-cols-3 gap-2 mt-3 border-t border-obsidian-600 pt-3">
            <Mini label="T2 / Confirm" value="45.0%" />
            <Mini label="T3 / Auto-fire" value="75.0%" />
            <Mini label="Window" value="600s" />
          </div>
        </div>
        <PositionList positions={POSITIONS} exited={exited} targetSymbol="USDC" capPct={100} />
      </div>

      {/* Right: signal feed */}
      <div className="lg:col-span-4 order-3">
        <SignalFeed signals={signals} corroboratedClasses={decision.corroboratedClasses} />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="stat-num text-sm text-bone">{value}</div>
      <div className="label text-[8px] mt-1 text-bone-faint">{label}</div>
    </div>
  );
}
