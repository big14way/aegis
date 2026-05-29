"use client";

import { THRESHOLDS, tierLabel } from "@/lib/scoring";

const cx = 120;
const cy = 120;
const r = 100;

function polar(scorePct: number, radius: number) {
  const theta = ((180 - scorePct * 1.8) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(theta), y: cy - radius * Math.sin(theta) };
}

export function RiskGauge({
  scoreBps,
  tier,
}: {
  scoreBps: number;
  tier: number;
}) {
  const scorePct = Math.max(0, Math.min(100, scoreBps / 100));
  const t2 = THRESHOLDS.t2Bps / 100;
  const t3 = THRESHOLDS.t3Bps / 100;

  const color = tier >= 3 ? "#ff3b30" : tier === 2 ? "#f5a623" : scoreBps > 0 ? "#ffc14d" : "#5e8f96";
  const needle = polar(scorePct, 84);

  // Zone band offsets along a pathLength=100 semicircle.
  const zoneStops = [
    { from: 0, to: t2, c: "#2c333f" },
    { from: t2, to: t3, c: "rgba(245,166,35,0.55)" },
    { from: t3, to: 100, c: "rgba(255,59,48,0.6)" },
  ];

  return (
    <div className="relative flex flex-col items-center">
      <svg viewBox="0 0 240 150" className="w-full max-w-[360px]">
        <defs>
          <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <path
          d="M 20 120 A 100 100 0 0 1 220 120"
          fill="none"
          stroke="#16191f"
          strokeWidth="16"
          strokeLinecap="butt"
        />

        {/* Tier zone bands */}
        {zoneStops.map((z, i) => (
          <path
            key={i}
            d="M 20 120 A 100 100 0 0 1 220 120"
            fill="none"
            stroke={z.c}
            strokeWidth="16"
            pathLength={100}
            strokeDasharray={`${z.to - z.from} 100`}
            strokeDashoffset={-z.from}
          />
        ))}

        {/* Value arc */}
        <path
          d="M 20 120 A 100 100 0 0 1 220 120"
          fill="none"
          stroke={color}
          strokeWidth="6"
          pathLength={100}
          strokeDasharray={`${scorePct} 100`}
          filter="url(#glow)"
          style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.2,0.7,0.2,1), stroke 300ms" }}
        />

        {/* Ticks */}
        {[0, 25, 50, 75, 100].map((p) => {
          const a = polar(p, r + 2);
          const b = polar(p, r - 10);
          return <line key={p} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3a3f4b" strokeWidth="1.5" />;
        })}

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needle.x}
          y2={needle.y}
          stroke={color}
          strokeWidth="2.5"
          style={{ transition: "all 700ms cubic-bezier(0.2,0.7,0.2,1)" }}
        />
        <circle cx={cx} cy={cy} r="6" fill="#0a0b0d" stroke={color} strokeWidth="2" />
      </svg>

      {/* Readout */}
      <div className="-mt-10 flex flex-col items-center">
        <div
          className="stat-num text-5xl font-semibold leading-none"
          style={{ color, transition: "color 300ms" }}
        >
          {(scoreBps / 100).toFixed(1)}
          <span className="text-xl text-bone-faint">%</span>
        </div>
        <div
          className="label mt-2 text-[11px]"
          style={{ color: tier >= 2 ? color : undefined }}
        >
          {tierLabel(tier)}
        </div>
      </div>
    </div>
  );
}
