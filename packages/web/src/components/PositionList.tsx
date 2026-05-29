"use client";

export interface Position {
  symbol: string;
  protocol: string;
  amount: number;
  usdValue: number;
}

export function PositionList({
  positions,
  exited,
  targetSymbol,
  capPct,
}: {
  positions: Position[];
  exited: boolean;
  targetSymbol: string;
  capPct: number;
}) {
  return (
    <div className="panel p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="label text-[11px]">Protected Positions</div>
        <div className="font-mono text-[11px] text-bone-faint">CAP {capPct}%</div>
      </div>

      <div className="space-y-2">
        {positions.map((p) => (
          <div
            key={p.symbol}
            className="border border-obsidian-600 bg-obsidian-700/50 px-3 py-3 flex items-center justify-between"
          >
            <div>
              <div className="font-display text-sm tracking-wide text-bone">{p.symbol}</div>
              <div className="font-mono text-[10px] text-bone-faint mt-0.5">{p.protocol}</div>
            </div>
            <div className="text-right">
              {exited ? (
                <>
                  <div className="stat-num text-sm text-steel line-through opacity-50">
                    {p.amount.toLocaleString()}
                  </div>
                  <div className="font-mono text-[10px] text-amber mt-0.5">
                    → {targetSymbol}
                  </div>
                </>
              ) : (
                <>
                  <div className="stat-num text-sm text-bone">{p.amount.toLocaleString()}</div>
                  <div className="font-mono text-[10px] text-bone-faint mt-0.5">
                    ${p.usdValue.toLocaleString()}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-3 border px-3 py-2 font-mono text-[10px] leading-relaxed"
        style={{
          borderColor: exited ? "rgba(245,166,35,0.4)" : "#262b36",
          color: exited ? "#f5a623" : "#5c5950",
        }}
      >
        {exited
          ? `EXIT EXECUTED · position consolidated into ${targetSymbol} · bounded by ${capPct}% cap`
          : `On auto-fire, up to ${capPct}% is pulled and swapped to ${targetSymbol} via an allow-listed adapter. Nothing else can move.`}
      </div>
    </div>
  );
}
