/**
 * Click ripples: a ring that grows out of each click the motion pass found.
 *
 * A screen recording shows a cursor arriving somewhere and never shows the
 * press, so a viewer cannot tell a click from a hover. The pass in
 * `lib/motion.ts` already finds the clicks, as a time and a point, so drawing
 * them needs no new analysis.
 *
 * One drawing function serves both places, the preview's canvas and the
 * encode's, so the ripple in the file is the one on screen. It takes a point
 * and a radius already in the canvas's own pixels, and each caller maps the
 * picture onto its canvas the way it already does for the zoom.
 */

/** How long one ripple lasts, in source seconds. */
export const RIPPLE_SECONDS = 0.6;

/** The ring's radius at its start and end, as fractions of the picture's width. */
const RADIUS_FROM = 0.008;
const RADIUS_TO = 0.04;

export interface Ripple {
  x: number;
  y: number;
  /** 0 as it starts, 1 as it vanishes. */
  progress: number;
}

/**
 * The ripples showing at a source time. `clicks` is the motion track's own
 * shape: three floats a click, time then position, time ascending.
 */
export function ripplesAt(clicks: Float32Array, time: number): Ripple[] {
  const out: Ripple[] = [];
  for (let i = 0; i + 2 < clicks.length; i += 3) {
    const at = clicks[i];
    if (at > time) break;
    const progress = (time - at) / RIPPLE_SECONDS;
    if (progress < 1) out.push({ x: clicks[i + 1], y: clicks[i + 2], progress });
  }
  return out;
}

/** The ring's radius as a fraction of the picture's width, eased out. */
export function rippleRadius(progress: number): number {
  const eased = 1 - (1 - progress) ** 3;
  return RADIUS_FROM + (RADIUS_TO - RADIUS_FROM) * eased;
}

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * One ripple at a point, in the canvas's pixels. `unit` is how many of those
 * one picture width is, so the ring is the same size relative to the picture
 * whatever the canvas.
 *
 * White with a dark edge, because it sits over an arbitrary picture and has
 * to read against both a light UI and a dark one.
 */
export function drawRipple(
  ctx: Context,
  x: number,
  y: number,
  unit: number,
  progress: number,
): void {
  const radius = rippleRadius(progress) * unit;
  const fade = 1 - progress;
  const line = Math.max(1.5, unit * 0.003);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${0.28 * fade})`;
  ctx.fill();
  ctx.lineWidth = line * 2;
  ctx.strokeStyle = `rgba(0,0,0,${0.35 * fade})`;
  ctx.stroke();
  ctx.lineWidth = line;
  ctx.strokeStyle = `rgba(255,255,255,${0.95 * fade})`;
  ctx.stroke();
  ctx.restore();
}
