"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWatchContractEvent,
  useWriteContract,
} from "wagmi";
import { keccak256, maxUint256, toBytes, zeroAddress } from "viem";
import { computeScore, encodeSignals, type Signal } from "@/lib/scoring";
import { SCENARIOS, baselineSignals, type Scenario } from "@/lib/sim";
import {
  ADAPTER_ADDRESS,
  CHAIN_ID,
  ENGINE_ADDRESS,
  LIVE_READY,
  PROTECTED_USER,
  SOURCE_ASSET,
  TARGET_ASSET,
  VAULT_ADDRESS,
} from "@/lib/wagmi";
import { aegisVaultAbi, erc20Abi, riskEngineAbi } from "@/lib/abi";
import { GuardianStatus } from "./GuardianStatus";
import { RiskGauge } from "./RiskGauge";
import { SignalFeed } from "./SignalFeed";
import { GuardianControl } from "./GuardianControl";
import { PositionList, type Position } from "./PositionList";

const POSITIONS: Position[] = [
  { symbol: "tTSLA", protocol: "Robinhood Chain · Stock Token", amount: 540, usdValue: 182_400 },
  { symbol: "aUSDC", protocol: "Aave V3 · Arbitrum", amount: 95_000, usdValue: 95_000 },
];

const KEEPER_ROLE = keccak256(toBytes("KEEPER_ROLE"));
const CAP_WEI = 1000n * 10n ** 18n; // per-exit cap (matches the seeded position)
const WINDOW_SECS = 600;

export function Dashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [armed, setArmed] = useState(false);
  const [signals, setSignals] = useState<Signal[]>(() => baselineSignals());
  const [activeKey, setActiveKey] = useState("nominal");
  const [confirmed, setConfirmed] = useState(false);
  const [exitedLatch, setExitedLatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const engineMode = ENGINE_ADDRESS ? "LIVE" : "DEMO";
  const onWrongChain = isConnected && chainId !== CHAIN_ID;
  const canWrite = engineMode === "LIVE" && LIVE_READY && isConnected && !onWrongChain;

  const encoded = useMemo(() => encodeSignals(signals), [signals]);
  const localDecision = useMemo(() => computeScore(signals), [signals]);

  // LIVE: read the verdict straight from the on-chain engine (the source of truth).
  const { data: onchainScore } = useReadContract({
    address: ENGINE_ADDRESS || undefined,
    abi: riskEngineAbi,
    functionName: "score",
    args: [encoded.sources, encoded.classes, encoded.severitiesBps, encoded.confidencesBps, encoded.agesSecs],
    query: { enabled: engineMode === "LIVE", refetchInterval: 4000 },
  });

  // Does the connected wallet hold KEEPER_ROLE? (gates the on-chain "fire" action)
  const { data: hasKeeper } = useReadContract({
    address: VAULT_ADDRESS || undefined,
    abi: aegisVaultAbi,
    functionName: "hasRole",
    args: [KEEPER_ROLE, address ?? zeroAddress],
    query: { enabled: canWrite && !!address },
  });

  // The gauge/state read the chain in LIVE, the faithful local mirror in DEMO.
  const decision =
    engineMode === "LIVE" && onchainScore
      ? {
          scoreBps: Number(onchainScore[0]),
          tier: onchainScore[1] as number,
          exitFlag: onchainScore[2] as boolean,
          corroboratedClasses: localDecision.corroboratedClasses,
        }
      : localDecision;

  // React to the real on-chain exit event in LIVE.
  useWatchContractEvent({
    address: VAULT_ADDRESS || undefined,
    abi: aegisVaultAbi,
    eventName: "Exited",
    enabled: engineMode === "LIVE" && !!VAULT_ADDRESS,
    onLogs: () => {
      setExitedLatch(true);
      setNotice("Exit fired on-chain — position consolidated to USDC.");
    },
  });

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

  /** Submit a tx and wait for its receipt; surface failures instead of swallowing them. */
  async function send(run: () => Promise<`0x${string}`>, label: string): Promise<boolean> {
    setBusy(true);
    setNotice(`${label}…`);
    try {
      const hash = await run();
      await publicClient?.waitForTransactionReceipt({ hash });
      setNotice(`${label} confirmed.`);
      return true;
    } catch (err) {
      setNotice(`${label} failed: ${(err as Error).message.split("\n")[0]}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function armLive(): Promise<boolean> {
    if (!address) return false;
    // Approve the bounded allowance once if needed, then record the armed mandate.
    const allowance = (await publicClient?.readContract({
      address: SOURCE_ASSET as `0x${string}`,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, VAULT_ADDRESS as `0x${string}`],
    })) as bigint | undefined;
    if ((allowance ?? 0n) < CAP_WEI) {
      const ok = await send(
        () =>
          writeContractAsync({
            address: SOURCE_ASSET as `0x${string}`,
            abi: erc20Abi,
            functionName: "approve",
            args: [VAULT_ADDRESS as `0x${string}`, maxUint256],
          }),
        "Approve allowance",
      );
      if (!ok) return false;
    }
    return send(
      () =>
        writeContractAsync({
          address: VAULT_ADDRESS as `0x${string}`,
          abi: aegisVaultAbi,
          functionName: "arm",
          args: [
            SOURCE_ASSET as `0x${string}`,
            TARGET_ASSET as `0x${string}`,
            ADAPTER_ADDRESS as `0x${string}`,
            CAP_WEI,
            BigInt(WINDOW_SECS),
          ],
        }),
      "Arm guard",
    );
  }

  async function handleArm() {
    setNotice(null);
    if (engineMode === "LIVE") {
      if (onWrongChain) {
        setNotice(`Wrong network — switch to chain ${CHAIN_ID}.`);
        switchChain?.({ chainId: CHAIN_ID });
        return;
      }
      if (!canWrite) {
        setNotice("Connect a wallet on the right network to arm on-chain.");
        return;
      }
      const ok = await armLive();
      if (!ok) return;
    }
    setArmed(true);
    reset("nominal");
  }

  function handleDisarm() {
    setArmed(false);
    setConfirmed(false);
    setExitedLatch(false);
    if (canWrite) {
      void send(
        () => writeContractAsync({ address: VAULT_ADDRESS as `0x${string}`, abi: aegisVaultAbi, functionName: "disarm", args: [] }),
        "Disarm",
      );
    }
  }

  function handleScenario(s: Scenario) {
    setSignals(s.signals.map((x) => ({ ...x })));
    setActiveKey(s.key);
    setConfirmed(false);
    setExitedLatch(false);
  }

  async function handleConfirm() {
    setConfirmed(true);
    if (canWrite) {
      await send(
        () =>
          writeContractAsync({
            address: VAULT_ADDRESS as `0x${string}`,
            abi: aegisVaultAbi,
            functionName: "confirmExit",
            args: [(PROTECTED_USER || address) as `0x${string}`, 0n],
          }),
        "Confirm exit",
      );
    }
  }

  /** Keeper-only: submit the current scenario's signals on-chain; the vault
   *  re-derives the verdict via the engine and fires the bounded exit. */
  async function handleKeeperFire() {
    if (!canWrite) return;
    await send(
      () =>
        writeContractAsync({
          address: VAULT_ADDRESS as `0x${string}`,
          abi: aegisVaultAbi,
          functionName: "evaluateAndExit",
          args: [
            (PROTECTED_USER || address) as `0x${string}`,
            encoded.sources,
            encoded.classes,
            encoded.severitiesBps,
            encoded.confidencesBps,
            encoded.agesSecs,
            0n,
          ],
        }),
      "Keeper evaluateAndExit",
    );
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
          showKeeperFire={engineMode === "LIVE" && armed && !exited && Boolean(hasKeeper)}
          onKeeperFire={handleKeeperFire}
          busy={busy}
        />
      </div>

      {/* Center: status + gauge */}
      <div className="lg:col-span-5 order-1 lg:order-2 space-y-4">
        <GuardianStatus vaultState={vaultState} engineMode={engineMode} chainName={chainNameFor(chainId)} />
        {notice && (
          <div className="panel px-4 py-2 font-mono text-[10px] text-bone-faint border-l-2 border-amber/60">{notice}</div>
        )}
        {engineMode === "LIVE" && onWrongChain && (
          <button
            className="btn btn-ghost w-full text-[11px]"
            onClick={() => switchChain?.({ chainId: CHAIN_ID })}
          >
            Switch to chain {CHAIN_ID} to go on-chain
          </button>
        )}
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="label text-[11px]">Corroborated Risk Score</div>
            <div className="font-mono text-[10px] text-bone-faint">
              {engineMode === "LIVE"
                ? onchainScore
                  ? "← read from on-chain engine"
                  : "← awaiting engine read…"
                : "← Stylus algorithm (preview)"}
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

function chainNameFor(id: number): string {
  if (id === 31337) return "Anvil (local)";
  if (id === 421614) return "Arbitrum Sepolia";
  if (id === 46630) return "Robinhood Chain";
  return `Chain ${id}`;
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="stat-num text-sm text-bone">{value}</div>
      <div className="label text-[8px] mt-1 text-bone-faint">{label}</div>
    </div>
  );
}
