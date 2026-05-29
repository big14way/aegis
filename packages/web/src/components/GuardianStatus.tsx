"use client";

const STATE_META: Record<
  string,
  { label: string; sub: string; color: string; ring: string }
> = {
  DISARMED: {
    label: "DISARMED",
    sub: "Guardian offline · positions unprotected",
    color: "#5c5950",
    ring: "border-obsidian-500",
  },
  ARMED: {
    label: "ARMED",
    sub: "Watching · on-chain engine evaluating every signal",
    color: "#f5a623",
    ring: "border-amber/50 shadow-armed",
  },
  CONFIRM: {
    label: "CONFIRM",
    sub: "Elevated risk · T2 confirmation window open",
    color: "#ffc14d",
    ring: "border-amber/70 shadow-armed",
  },
  FIRED: {
    label: "FIRED",
    sub: "Auto-fire triggered · bounded exit executed",
    color: "#ff3b30",
    ring: "border-alert/70 shadow-fired",
  },
};

export function GuardianStatus({
  vaultState,
  engineMode,
  chainName,
}: {
  vaultState: "DISARMED" | "ARMED" | "CONFIRM" | "FIRED";
  engineMode: "LIVE" | "DEMO";
  chainName: string;
}) {
  const m = STATE_META[vaultState];
  const fired = vaultState === "FIRED";

  return (
    <div className={`panel ${m.ring} p-5 transition-all duration-500`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="label text-[10px] mb-2">Guardian Status</div>
          <div
            className={`font-display text-4xl md:text-5xl font-700 tracking-tightest leading-none ${
              fired ? "animate-firePulse" : ""
            }`}
            style={{ color: m.color }}
          >
            {m.label}
          </div>
          <div className="font-mono text-[11px] text-bone-dim mt-2">{m.sub}</div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <span
            className="font-display text-[9px] tracking-widest2 px-2 py-1 border"
            style={{
              borderColor: engineMode === "LIVE" ? "rgba(94,143,150,0.6)" : "rgba(245,166,35,0.5)",
              color: engineMode === "LIVE" ? "#5e8f96" : "#f5a623",
            }}
          >
            ENGINE · {engineMode}
          </span>
          <span className="font-mono text-[10px] text-bone-faint">{chainName}</span>
        </div>
      </div>
    </div>
  );
}
