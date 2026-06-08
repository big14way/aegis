"use client";

import { explorerTxUrl } from "@/lib/explorer";

export interface TxRecord {
  label: string;
  hash: `0x${string}`;
  ts: number;
  chainId: number;
}

function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** A verb-style tag for each on-chain action. */
function kindOf(label: string): { tag: string; tone: string } {
  const l = label.toLowerCase();
  if (l.includes("evaluate") || l.includes("confirm exit")) return { tag: "EXIT", tone: "text-red-400 border-red-400/40" };
  if (l.includes("arm")) return { tag: "ARM", tone: "text-amber border-amber/40" };
  if (l.includes("disarm")) return { tag: "DISARM", tone: "text-bone-faint border-obsidian-600" };
  if (l.includes("approve")) return { tag: "APPROVE", tone: "text-bone-faint border-obsidian-600" };
  return { tag: "TX", tone: "text-bone-faint border-obsidian-600" };
}

export function TxHistory({ records, onClear }: { records: TxRecord[]; onClear?: () => void }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="label text-[11px]">On-chain Activity</div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px] text-bone-faint">{records.length} TX</span>
          {records.length > 0 && onClear && (
            <button className="font-mono text-[9px] text-bone-faint hover:text-bone" onClick={onClear}>
              clear
            </button>
          )}
        </div>
      </div>

      {records.length === 0 ? (
        <div className="font-mono text-[10px] text-bone-faint py-3">
          No transactions yet — arm the guardian and fire an exit to build the audit trail.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {records.map((r) => {
            const { tag, tone } = kindOf(r.label);
            const url = explorerTxUrl(r.chainId, r.hash);
            return (
              <div
                key={r.hash}
                className="flex items-center justify-between gap-3 border border-obsidian-600 px-3 py-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`font-display text-[9px] tracking-wider border px-1.5 py-0.5 ${tone}`}>{tag}</span>
                  <span className="font-mono text-[10px] text-bone truncate">{r.label}</span>
                </div>
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <span className="font-mono text-[9px] text-bone-faint">{ago(r.ts)}</span>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[9px] text-amber hover:underline"
                    >
                      {r.hash.slice(0, 8)}… ↗
                    </a>
                  ) : (
                    <span className="font-mono text-[9px] text-bone-faint">{r.hash.slice(0, 8)}…</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
