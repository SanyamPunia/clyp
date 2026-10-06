"use client";

import { useEffect, useRef } from "react";

import { type ShaderField, LOOP_SECONDS, sharedRenderer } from "@/lib/shader";

/**
 * A moving preset's swatch, drawn by the shader it names.
 *
 * Still at rest, at the phase the preset starts from, and moving while it is
 * hovered or focused. A moving background is judged by how it moves, and a
 * still of one is a different picture from the one it becomes a second later.
 * Only the one under the pointer runs, and not at all under reduced motion.
 *
 * Every swatch draws through one shared WebGL context and copies the frame
 * onto its own 2D canvas. A context per swatch would be thirty-two, and a
 * browser drops the oldest past a handful.
 */
export function ShaderSwatch({
  field,
  playing,
}: {
  field: ShaderField;
  playing: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const renderer = sharedRenderer();
    if (!canvas || !ctx || !renderer) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = width;
    canvas.height = height;

    const paint = (phase: number) => {
      renderer.draw(field, phase, width, height);
      ctx.drawImage(renderer.canvas, 0, 0, width, height);
    };

    paint(0);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!playing || reduced) return;

    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      paint((((now - start) / 1000) % LOOP_SECONDS) / LOOP_SECONDS);
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      paint(0);
    };
  }, [field, playing]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 size-full"
    />
  );
}
