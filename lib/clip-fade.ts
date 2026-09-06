/**
 * Fades: stretches where the picture arrives or leaves.
 *
 * A fade is a stretch on the source's axis, like a cut and a zoom, carrying a
 * direction and a curve. Its arithmetic runs in two places from the same
 * numbers, the way the zoom's does: the preview's frame loop sets an opacity
 * on the video, and the worker's encode loop draws the frame at that alpha.
 *
 * **What shows through is the background, which is why the export rasterizes
 * its chrome with the video hidden.** `html-to-image` substitutes a still of
 * the current frame for the `<video>`, so fading the composite over a chrome
 * that already holds that still would reveal the still, not the gradient. With
 * the media dropped from the raster the frame's own box is a shadowed hole
 * over the background, and a frame drawn at full alpha covers it exactly as
 * before.
 */

export type FadeKind = "in" | "out";

/** A cubic bezier's two control points: the four numbers CSS takes. */
export type Curve = readonly [number, number, number, number];

export interface FadeRegion {
  id: string;
  /** Source seconds. */
  start: number;
  end: number;
  kind: FadeKind;
  curve: Curve;
}

/** The shortest fade worth having, in source seconds. */
export const MIN_FADE = 0.1;
/** What a new fade is given when there is room for it. */
export const DEFAULT_FADE_LENGTH = 0.6;

export const DEFAULT_CURVE: Curve = [0.42, 0, 0.58, 1];

/**
 * The curves worth a chip. Custom is anything dragged in the editor, which is
 * every other set of four numbers.
 */
export const CURVE_PRESETS: { value: string; label: string; curve: Curve }[] = [
  { value: "linear", label: "Linear", curve: [0, 0, 1, 1] },
  { value: "slow-start", label: "Slow start", curve: [0.42, 0, 1, 1] },
  { value: "slow-end", label: "Slow end", curve: [0, 0, 0.58, 1] },
  { value: "smooth", label: "Smooth", curve: [0.42, 0, 0.58, 1] },
];

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

export function newFadeId(): string {
  return crypto.randomUUID();
}

/** Which preset a curve is, or null when it has been dragged off all of them. */
export function curveName(curve: Curve): string | null {
  return (
    CURVE_PRESETS.find((preset) =>
      preset.curve.every((n, i) => Math.abs(n - curve[i]) < 1e-6),
    )?.value ?? null
  );
}

/** One axis of a cubic bezier from (0,0) to (1,1), at parameter `t`. */
function axis(a: number, b: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
}

/** Its slope, for the solve below. */
function slope(a: number, b: number, t: number): number {
  const u = 1 - t;
  return 3 * a * (u * u - 2 * t * u) + 3 * b * (2 * t * u - t * t) + 3 * t * t;
}

/**
 * The curve's y at x, which is what a CSS timing function computes.
 *
 * A bezier is parametric, so x has to be solved for t before y can be read.
 * Newton-Raphson from t = x converges in a handful of steps for control
 * points inside the unit square, which the editor is the only source of and
 * which it clamps to.
 */
export function ease(curve: Curve, x: number): number {
  const [x1, y1, x2, y2] = curve;
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  let t = x;
  for (let i = 0; i < 8; i++) {
    const dx = axis(x1, x2, t) - x;
    if (Math.abs(dx) < 1e-7) break;
    const d = slope(x1, x2, t);
    if (Math.abs(d) < 1e-7) break;
    t -= dx / d;
  }
  return clamp(axis(y1, y2, clamp(t, 0, 1)), 0, 1);
}

/**
 * The picture's opacity at `time`.
 *
 * Inside a fade it is the curve. Outside one it is whatever the last fade to
 * finish left behind, so a fade out ends dark and stays dark rather than
 * snapping back the instant its region ends, and a fade in after it brings the
 * picture back. With no fade behind it at all the picture is simply there.
 */
export function opacityAt(
  fades: readonly FadeRegion[],
  time: number,
): number {
  const covering = fades.find((f) => time >= f.start && time < f.end);
  if (covering) {
    const span = covering.end - covering.start;
    const progress = span > 0 ? (time - covering.start) / span : 1;
    const eased = ease(covering.curve, progress);
    return clamp(covering.kind === "in" ? eased : 1 - eased, 0, 1);
  }

  let last: FadeRegion | null = null;
  for (const fade of fades) {
    if (fade.end <= time && (!last || fade.end > last.end)) last = fade;
  }
  return last ? (last.kind === "in" ? 1 : 0) : 1;
}

/** The free stretch around `time`, between its neighbours, or null inside one. */
export function roomAt(
  fades: readonly FadeRegion[],
  time: number,
  duration: number,
): { lo: number; hi: number } | null {
  if (fades.some((f) => time >= f.start && time < f.end)) return null;

  return {
    lo: Math.max(0, ...fades.filter((f) => f.end <= time).map((f) => f.end)),
    hi: Math.min(
      duration,
      ...fades.filter((f) => f.start >= time).map((f) => f.start),
    ),
  };
}

/** The stretch one fade may occupy without crossing its neighbours. */
export function roomFor(
  fades: readonly FadeRegion[],
  id: string,
  duration: number,
): { lo: number; hi: number } {
  const fade = fades.find((f) => f.id === id);
  if (!fade) return { lo: 0, hi: duration };

  const others = fades.filter((f) => f.id !== id);
  return {
    lo: Math.max(0, ...others.filter((f) => f.end <= fade.start).map((f) => f.end)),
    hi: Math.min(
      duration,
      ...others.filter((f) => f.start >= fade.end).map((f) => f.start),
    ),
  };
}

/**
 * Where a new fade lands for a press at `time`: `length` from there, or what
 * is left before a neighbour or the end. Pulled back to the shortest only when
 * less than that is left forward, the same rule a zoom and a cut follow.
 */
export function placeFade(
  fades: readonly FadeRegion[],
  time: number,
  duration: number,
  length = DEFAULT_FADE_LENGTH,
): { start: number; end: number } | null {
  const room = roomAt(fades, time, duration);
  if (!room) return null;

  const forward = Math.min(length, room.hi - time);
  if (forward >= MIN_FADE) return { start: time, end: time + forward };

  if (room.hi - room.lo < MIN_FADE) return null;
  return { start: room.hi - MIN_FADE, end: room.hi };
}
