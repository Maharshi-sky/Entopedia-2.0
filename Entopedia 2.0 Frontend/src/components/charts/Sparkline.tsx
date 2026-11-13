"use client";

import { useState, type PointerEvent } from "react";
import { smoothPath, type Point } from "@/lib/chart";

const W = 96;
const H = 36;
const PAD = 4;

export function Sparkline({
  id,
  data,
  color,
  delay = 0,
}: {
  id: string;
  data: number[];
  color: string;
  // Seconds to wait before the draw-in animation starts.
  delay?: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const min = Math.min(...data);
  const range = Math.max(...data) - min || 1;
  const points: Point[] = data.map((v, i) => [
    PAD + (i * (W - 2 * PAD)) / (data.length - 1),
    H - PAD - ((v - min) / range) * (H - 2 * PAD),
  ]);
  const line = smoothPath(points);
  const [lastX] = points[points.length - 1];
  const area = `${line} L${lastX},${H} L${points[0][0]},${H} Z`;
  const [dotX, dotY] = points[hoverIndex ?? points.length - 1];

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD) / (W - 2 * PAD)) * (data.length - 1));
    setHoverIndex(Math.min(data.length - 1, Math.max(0, i)));
  }

  return (
    <span className="relative shrink-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-9 w-24 cursor-crosshair overflow-visible"
        aria-hidden
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path
          d={area}
          fill={`url(#${id})`}
          className="chart-fade"
          style={{ animationDelay: `${delay + 0.8}s` }}
        />
        <path
          d={line}
          pathLength={1}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          className="chart-draw"
          style={{ animationDuration: "1.4s", animationDelay: `${delay}s` }}
        />
        {hoverIndex !== null && (
          <line
            x1={dotX}
            x2={dotX}
            y1={0}
            y2={H}
            stroke={color}
            strokeOpacity={0.3}
            strokeDasharray="2 2"
          />
        )}
        <circle
          cx={dotX}
          cy={dotY}
          r={hoverIndex !== null ? 3 : 2.5}
          fill="white"
          stroke={color}
          strokeWidth={1.5}
          className="chart-fade"
          style={{ animationDelay: `${delay + 1.3}s` }}
        />
      </svg>
      {hoverIndex !== null && (
        <span
          className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap text-white"
          style={{ left: `${(dotX / W) * 100}%` }}
        >
          {data[hoverIndex]}
        </span>
      )}
    </span>
  );
}
