"use client";

import { useEffect, useRef } from "react";

import { BACKDROP_PHASE, EXPORT_BACKDROP, EXPORT_IGNORE } from "@/lib/raster";
import {
  type ShaderField,
  LOOP_SECONDS,
  createShaderRenderer,
} from "@/lib/shader";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD - moving background swap
 *
 *    0ms   a new field is picked
 *          the old field keeps drawing, at the same phase
 *          the new one is drawn over it at alpha 0
 *  400ms   the new one reaches alpha 1 and the old one stops
 * ─────────────────────────────────────────────────────────
 * Between two moving presets the fade happens inside the canvas, so both keep
 * moving through it on one clock. Between a moving preset and anything else
 * the canvas itself fades, over the CSS layers fading underneath it.
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  crossFade: 400,
};

/**
 * The longest edge the preview draws, in device pixels. A flow or a warp is
 * smooth at this size, the browser's upscale of it is invisible, and drawing
 * a 3000px frame sixty times a second for a preview would cost the tab.
 */
const MAX_EDGE = 1280;

interface ShaderLayerProps {
  /** The field to draw, or null to fade out and stop. */
  field: ShaderField | null;
  /** From `BACKGROUND_SPEEDS`. 0 holds the picture at `moment`. */
  speed: number;
  moment: number;
}

/**
 * The live picture of a moving background, in the preview.
 *
 * Always mounted while the browser can draw one, so a field arriving or
 * leaving fades rather than snaps. It is left out of every raster: an export
 * paints the shader itself at the export's own size, through
 * `paintBackdrop`, and reads the phase this last drew off the canvas.
 *
 * The frame loop writes the phase to the DOM rather than to state, the way the
 * trim bar writes its clock: sixty renders a second for a background is cost
 * with nothing to show for it.
 */
export function ShaderLayer({ field, speed, moment }: ShaderLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The latest props, for the loop that is bound once. */
  const latest = useRef({ field, speed, moment });
  /** What the canvas was showing before the current field, while it fades. */
  const fade = useRef<{ from: ShaderField; at: number } | null>(null);
  /** The phase and the time it was at, so a speed change does not jump. */
  const anchor = useRef({ phase: moment, at: 0 });
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // A 2D context on the visible canvas, fed from a WebGL one off it. The
    // in-canvas cross-fade is two draws and a blend, which a 2D context does
    // with `globalAlpha`, where doing it in GL would need a second program.
    const ctx = canvas.getContext("2d");
    const renderer = createShaderRenderer(new OffscreenCanvas(1, 1));
    if (!ctx || !renderer) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let size = { width: 1, height: 1 };

    const measure = () => {
      // The on-screen size, which is the layout size times the canvas zoom.
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const k = Math.min(
        dpr,
        MAX_EDGE / Math.max(rect.width, rect.height, 1),
      );
      size = {
        width: Math.max(1, Math.round(rect.width * k)),
        height: Math.max(1, Math.round(rect.height * k)),
      };
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
    };

    const phaseNow = (now: number) => {
      const { speed: s } = latest.current;
      if (s === 0 || reduced.matches) return latest.current.moment;
      const p = anchor.current.phase + ((now - anchor.current.at) / 1000) * (s / LOOP_SECONDS);
      return p - Math.floor(p);
    };

    const draw = (now: number) => {
      const { field: current, speed: s } = latest.current;
      const phase = phaseNow(now);
      canvas.setAttribute(BACKDROP_PHASE, phase.toFixed(5));

      const fading = fade.current;
      const t = fading ? (now - fading.at) / TIMING.crossFade : 1;
      if (fading && t >= 1) fade.current = null;

      if (fading && t < 1) {
        renderer.draw(fading.from, phase, size.width, size.height);
        ctx.globalAlpha = 1;
        ctx.drawImage(renderer.canvas, 0, 0);
      }
      if (current) {
        renderer.draw(current, phase, size.width, size.height);
        ctx.globalAlpha = fading && t < 1 ? t : 1;
        ctx.drawImage(renderer.canvas, 0, 0);
        ctx.globalAlpha = 1;
      }

      const moving = current && s > 0 && !reduced.matches;
      if (moving || (fade.current && current)) {
        frame = requestAnimationFrame(draw);
      } else {
        frame = 0;
      }
    };

    kick.current = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(() => {
      measure();
      kick.current();
    });
    observer.observe(canvas);
    reduced.addEventListener("change", kick.current);
    measure();
    kick.current();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      reduced.removeEventListener("change", kick.current);
      renderer.dispose();
    };
  }, []);

  // Mirrored for the loop, which is bound once and would otherwise close over
  // the props it mounted with. Written in an effect, never during render.
  useEffect(() => {
    const before = latest.current;
    const now = performance.now();

    // Re-anchored on every change, so the phase carries on from where it was
    // drawn rather than jumping to where a new speed would put it by now.
    const shown = Number(canvasRef.current?.getAttribute(BACKDROP_PHASE) ?? moment);
    anchor.current =
      speed > 0 && before.speed > 0
        ? { phase: shown, at: now }
        : { phase: moment, at: now };

    if (before.field && field && before.field !== field) {
      fade.current = { from: before.field, at: now };
    }
    latest.current = { field, speed, moment };
    kick.current();
  }, [field, speed, moment]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      {...{ [EXPORT_IGNORE]: "", [EXPORT_BACKDROP]: "" }}
      className="absolute inset-0 z-10 size-full transition-opacity"
      style={{
        opacity: field ? 1 : 0,
        transitionDuration: `${TIMING.crossFade}ms`,
      }}
    />
  );
}
