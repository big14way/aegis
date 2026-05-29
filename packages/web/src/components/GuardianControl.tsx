"use client";

import type { Scenario } from "@/lib/sim";

export function GuardianControl({
  armed,
  vaultState,
  scenarios,
  activeKey,
  onArm,
  onDisarm,
  onScenario,
  onConfirm,
  onReset,
}: {
  armed: boolean;
  vaultState: "DISARMED" | "ARMED" | "CONFIRM" | "FIRED";
  scenarios: Scenario[];
  activeKey: string;
  onArm: () => void;
  onDisarm: () => void;
  onScenario: (s: Scenario) => void;
  onConfirm: () => void;
  onReset: () => void;
}) {
  return (
    <div className="panel p-4 h-full flex flex-col">
      <div className="label text-[11px] mb-3">Command</div>

      <div className="flex gap-2 mb-4">
        {!armed ? (
          <button className="btn btn-arm flex-1 animate-pulseRing" onClick={onArm}>
            Arm Guardian
          </button>
        ) : (
          <button className="btn btn-ghost flex-1" onClick={onDisarm}>
            Disarm
          </button>
        )}
        <button className="btn btn-ghost" onClick={onReset} title="Reset to nominal">
          Reset
        </button>
      </div>

      {vaultState === "CONFIRM" && (
        <button className="btn btn-arm w-full mb-4 animate-pulseRing" onClick={onConfirm}>
          ▸ Confirm Exit Now
        </button>
      )}

      <div className="label text-[10px] mb-2 text-bone-faint">Inject Threat Scenario</div>
      <div className="space-y-2 flex-1">
        {scenarios.map((s) => {
          const active = s.key === activeKey;
          return (
            <button
              key={s.key}
              disabled={!armed}
              onClick={() => onScenario(s)}
              className={`w-full text-left border px-3 py-2 transition-all duration-150 ${
                active
                  ? "border-amber/70 bg-amber/5"
                  : "border-obsidian-600 hover:border-bone-faint"
              } ${!armed ? "opacity-30 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-[11px] tracking-wider text-bone">{s.label}</span>
                {active && <span className="h-1.5 w-1.5 bg-amber animate-firePulse" />}
              </div>
              <span className="font-mono text-[9px] text-bone-faint leading-tight block mt-1">
                {s.blurb}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
