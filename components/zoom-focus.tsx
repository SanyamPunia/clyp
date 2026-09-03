"use client";

import type React from "react";

import type { ZoomFocus as Focus } from "@/lib/clip-zoom";
import { EXPORT_IGNORE } from "@/lib/raster";

/** A nudge from the arrow keys, as a fraction of the picture. */
const STEP = 0.02;
const COARSE_STEP = 0.1;

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

interface ZoomFocusProps {
  focus: Focus;
  /**
   * The canvas zoom, which the marker is counter-scaled by. It sits inside the
   * frame, so it would otherwise shrink with the picture and be a speck at 37%.
   */
  canvasZoom: number;
  /** The box it is placed in, which a drag reads its position against. */
  box: React.RefObject<HTMLElement | null>;
  onChange: (focus: Focus) => void;
  /** Reported so the preview can show the plain picture while the point moves. */
  onDragChange: (dragging: boolean) => void;
}

/**
 * The point a zoom region closes in on, drawn over the picture.
 *
 * It lives inside the clip's own box so its position needs no measuring: a
 * fraction of the box is a fraction of the picture. That puts it inside the
 * frame, so it carries `EXPORT_IGNORE` and the raster leaves it out. It also
 * carries its own colours, since it sits over an arbitrary video.
 */
export function ZoomFocusMarker({
  focus,
  canvasZoom,
  box,
  onChange,
  onDragChange,
}: ZoomFocusProps) {
  const drag = (event: React.PointerEvent<HTMLDivElement>) => {
    const node = box.current;
    if (!node) return;
    // Not a press on the picture, which would play or pause it.
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onDragChange(true);

    const move = (moved: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      onChange({
        x: clamp((moved.clientX - rect.left) / rect.width),
        y: clamp((moved.clientY - rect.top) / rect.height),
      });
    };
    const release = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      onDragChange(false);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  };

  const nudge = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? COARSE_STEP : STEP;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];
    if (!move) return;

    event.preventDefault();
    onChange({ x: clamp(focus.x + move[0]), y: clamp(focus.y + move[1]) });
  };

  return (
    <div
      {...{ [EXPORT_IGNORE]: "" }}
      role="button"
      tabIndex={0}
      aria-label="Zoom target. Drag or use the arrow keys to aim it."
      onPointerDown={drag}
      onKeyDown={nudge}
      onClick={(event) => event.stopPropagation()}
      className="absolute z-10 grid size-8 cursor-move touch-none place-items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
      style={{
        left: `${focus.x * 100}%`,
        top: `${focus.y * 100}%`,
        transform: `translate(-50%, -50%) scale(${1 / canvasZoom})`,
        border: "2px solid rgba(255,255,255,0.95)",
        boxShadow:
          "0 0 0 1px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(0,0,0,0.45)",
      }}
    >
      <span
        aria-hidden="true"
        className="block size-1.5 rounded-full"
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.45)",
        }}
      />
    </div>
  );
}
