"use client";

import type React from "react";
import { useCallback, useRef } from "react";

import { type Curve, CURVE_PRESETS, curveName } from "@/lib/clip-fade";
import { cn } from "@/lib/utils";

/**
 * The fade's curve, as the graph it is.
 *
 * A cubic bezier from (0,0) to (1,1) with its two control points draggable,
 * which is the shape every timing function in every editor is drawn as. The
 * presets are the same four the chips offer, here as well so the dialog is
 * self-sufficient once it is open.
 *
 * **No numeric readout.** The four numbers are not what anyone is choosing:
 * the shape is, and a reader adjusting a curve is looking at the line rather
 * than at a decimal. The handles carry their values in their accessible names
 * instead, where a reader who cannot see the line still gets them.
 */

/** The unit square's side in px, and the room a handle needs outside it. */
const SIZE = 200;
const PAD = 18;
const BOX = SIZE + PAD * 2;

/** One arrow press, and the coarse one Shift gives. */
const STEP = 0.02;
const COARSE = 0.1;

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

/** Unit coordinates to the SVG's, whose y runs the other way. */
const at = (x: number, y: number): [number, number] => [
  PAD + x * SIZE,
  PAD + (1 - y) * SIZE,
];

export function CurveEditor({
  curve,
  onChange,
}: {
  curve: Curve;
  onChange: (curve: Curve) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [x1, y1, x2, y2] = curve;

  /** Moves one control point, given its index in the four. */
  const set = useCallback(
    (point: 0 | 1, x: number, y: number) => {
      const next: [number, number, number, number] = [x1, y1, x2, y2];
      next[point * 2] = clamp(x);
      next[point * 2 + 1] = clamp(y);
      onChange(next);
    },
    [onChange, x1, y1, x2, y2],
  );

  const drag = (point: 0 | 1) => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);

    const move = (moved: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      // The SVG is laid out at its own pixel size, so one unit is one pixel
      // and the rect needs no scaling applied to it.
      const rect = svg.getBoundingClientRect();
      set(
        point,
        (moved.clientX - rect.left - PAD) / SIZE,
        1 - (moved.clientY - rect.top - PAD) / SIZE,
      );
    };
    const release = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  };

  const keys = (point: 0 | 1, x: number, y: number) => (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? COARSE : STEP;
    const by =
      event.key === "ArrowLeft"
        ? [-step, 0]
        : event.key === "ArrowRight"
          ? [step, 0]
          : event.key === "ArrowDown"
            ? [0, -step]
            : event.key === "ArrowUp"
              ? [0, step]
              : null;
    if (!by) return;
    event.preventDefault();
    set(point, x + by[0], y + by[1]);
  };

  const [c1x, c1y] = at(x1, y1);
  const [c2x, c2y] = at(x2, y2);
  const [startX, startY] = at(0, 0);
  const [endX, endY] = at(1, 1);
  const chosen = curveName(curve);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* The handles sit over the drawing as real elements rather than SVG
          circles, so they focus and tab like any other control. Both live in
          one box of the graph's own size, so a handle's position is the same
          number the path was drawn with. */}
      <div className="relative" style={{ width: BOX, height: BOX }}>
      <svg
        ref={svgRef}
        width={BOX}
        height={BOX}
        viewBox={`0 0 ${BOX} ${BOX}`}
        className="absolute inset-0 touch-none rounded-lg bg-track"
        aria-hidden="true"
      >
        {/* Quarters, so the shape can be read against something. */}
        {[0.25, 0.5, 0.75].map((n) => (
          <g key={n} stroke="var(--stroke)" strokeWidth={1} opacity={0.5}>
            <line x1={PAD + n * SIZE} y1={PAD} x2={PAD + n * SIZE} y2={PAD + SIZE} />
            <line x1={PAD} y1={PAD + n * SIZE} x2={PAD + SIZE} y2={PAD + n * SIZE} />
          </g>
        ))}
        <rect
          x={PAD}
          y={PAD}
          width={SIZE}
          height={SIZE}
          fill="none"
          stroke="var(--stroke-strong)"
          strokeWidth={1}
        />

        {/* Each control point tethered to the end it belongs to. */}
        <line x1={startX} y1={startY} x2={c1x} y2={c1y} stroke="var(--stroke-strong)" strokeWidth={1.5} />
        <line x1={endX} y1={endY} x2={c2x} y2={c2y} stroke="var(--stroke-strong)" strokeWidth={1.5} />

        <path
          d={`M ${startX},${startY} C ${c1x},${c1y} ${c2x},${c2y} ${endX},${endY}`}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        <circle cx={startX} cy={startY} r={3} fill="var(--stroke-strong)" />
        <circle cx={endX} cy={endY} r={3} fill="var(--stroke-strong)" />
      </svg>
        {([
          [0, x1, y1, c1x, c1y, "First control point"],
          [1, x2, y2, c2x, c2y, "Second control point"],
        ] as const).map(([point, ux, uy, cx, cy, label]) => (
          <button
            key={point}
            type="button"
            aria-label={`${label}, ${ux.toFixed(2)} across and ${uy.toFixed(2)} up`}
            onPointerDown={drag(point as 0 | 1)}
            onKeyDown={keys(point as 0 | 1, ux, uy)}
            className={cn(
              "absolute size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full",
              "border-2 border-brand bg-panel transition-transform duration-150 active:scale-110 active:cursor-grabbing",
              "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            )}
            style={{ left: cx, top: cy }}
          />
        ))}
      </div>

      {/* One line. They are four short labels and wrapping them reads as a
          layout accident rather than two rows of anything. */}
      <div className="flex items-center justify-center gap-1">
        {CURVE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            aria-pressed={chosen === preset.value}
            onClick={() => onChange(preset.curve)}
            className={cn(
              "h-7 cursor-pointer rounded-full px-2.5 text-[13px]",
              "transition-all duration-150 active:scale-[0.97]",
              chosen === preset.value
                ? "bg-track-active text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
