"use client";

import { CLASS_LABEL, SOURCE_LABEL, type Signal } from "@/lib/scoring";

function sevColor(bps: number) {
  if (bps >= 8000) return "#ff3b30";
  if (bps >= 5500) return "#f5a623";
  return "#5e8f96";
}

function age(ageSecs: number) {
  if (ageSecs < 60) return `${ageSecs}s`;
  return `${Math.floor(ageSecs / 60)}m`;
}

export function SignalFeed({
  signals,
  corroboratedClasses,
}: {
  signals: Signal[];
  corroboratedClasses: number[];
}) {
  const sorted = [...signals].sort((a, b) => b.severityBps - a.severityBps);

  return (
    <div className="panel scan p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="label text-[11px]">Signal Feed</div>
        <div className="font-mono text-[11px] text-bone-faint">{signals.length} ACTIVE</div>
      </div>

      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
        {sorted.length === 0 && (
          <div className="font-mono text-xs text-bone-faint py-6 text-center">— no signals —</div>
        )}
        {sorted.map((s) => {
          const corr = corroboratedClasses.includes(s.attackClass);
          return (
            <div
              key={s.id}
              className="animate-rise border border-obsidian-600 bg-obsidian-700/60 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-2 w-2 shrink-0"
                    style={{ background: sevColor(s.severityBps) }}
                  />
                  <span className="font-display text-[11px] tracking-wider text-bone truncate">
                    {CLASS_LABEL[s.attackClass]}
                  </span>
                  {corr && (
                    <span className="font-display text-[9px] tracking-widest px-1.5 py-0.5 border border-amber/60 text-amber">
                      CORROBORATED
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10px] text-bone-faint shrink-0">{age(s.ageSecs)}</span>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="font-mono text-[10px] text-bone-dim truncate">
                  {SOURCE_LABEL[s.source]} · {s.note}
                </span>
                <span
                  className="stat-num text-[11px] ml-2 shrink-0"
                  style={{ color: sevColor(s.severityBps) }}
                >
                  {(s.severityBps / 100).toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
