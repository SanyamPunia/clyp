/**
 * Zoom regions: stretches of the clip that close in on a point of the picture.
 *
 * A region is four numbers and a point. `start` and `end` are on the source's
 * axis, like the trim, so trimming never moves one and a speed change plays it
 * faster rather than shifting it. `scale` is how far in, and `focus` is the
 * point the picture closes in on, as fractions of its width and height, so it
 * means the same thing in the preview, whatever the canvas zoom, and in the
 * export, whatever the scale.
 *
 * Everything here is pure and runs in two places from the same numbers: the
 * preview's frame loop, which sets a CSS transform on the video, and the
 * worker's encode loop, which draws a source rectangle of each decoded frame.
 * The two cannot disagree, because neither has any arithmetic of its own.
 */

export interface ZoomFocus {
  x: number;
  y: number;
}

export interface ZoomRegion {
  id: string;
  /** Source seconds. */
  start: number;
  end: number;
  /** How far in: one of `ZOOM_LEVELS`. */
  scale: number;
  /** The point the picture closes in on, 0 to 1 in each axis. */
  focus: ZoomFocus;
}

/** What the picture is doing at one instant. */
export interface ZoomState {
  scale: number;
  focus: ZoomFocus;
}

export const ZOOM_LEVELS = [1.5, 2, 3] as const;
export const DEFAULT_ZOOM_LEVEL = 2;

/** The shortest a region may be, in source seconds. Below this it is all ramp. */
export const MIN_ZOOM_LENGTH = 0.5;
/** What a new region is given when there is room for it. */
export const DEFAULT_ZOOM_LENGTH = 2;

/**
 * How long the picture takes to close in, and to open back out, in seconds of
 * the output. In output seconds rather than the source's, so the ramp feels
 * the same at 2x as at 1x instead of twice as abrupt.
 */
export const ZOOM_RAMP = 0.5;

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

/** Cubic in and out. Slow to leave, slow to arrive, quick in the middle. */
function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/**
 * The picture's state at `time`, or null when nothing is zooming, which the
 * caller treats as a scale of 1.
 *
 * The ramp is capped at half the region, so a short region closes in and
 * opens out with no hold rather than overshooting its own end.
 */
export function zoomAt(
  regions: readonly ZoomRegion[],
  time: number,
  speed = 1,
): ZoomState | null {
  const region = regions.find((r) => time >= r.start && time < r.end);
  if (!region) return null;

  const ramp = Math.min(ZOOM_RAMP * speed, (region.end - region.start) / 2);
  const progress =
    ramp > 0
      ? clamp(Math.min(time - region.start, region.end - time) / ramp, 0, 1)
      : 1;

  return {
    scale: 1 + (region.scale - 1) * easeInOut(progress),
    focus: region.focus,
  };
}

/**
 * The part of a `width` by `height` picture that is visible at this zoom.
 *
 * This is the same picture CSS shows for `transform: scale(s)` with
 * `transform-origin` at the focus, which is what the preview sets: the focus
 * point stays where it is and the picture grows around it, so no part of the
 * box is ever left uncovered.
 */
export function sourceRect(
  zoom: ZoomState,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const w = width / zoom.scale;
  const h = height / zoom.scale;
  return {
    x: zoom.focus.x * (width - w),
    y: zoom.focus.y * (height - h),
    width: w,
    height: h,
  };
}

/** The free stretch around `time`, between its neighbours, or null inside a region. */
export function roomAt(
  regions: readonly ZoomRegion[],
  time: number,
  duration: number,
): { lo: number; hi: number } | null {
  if (regions.some((r) => time >= r.start && time < r.end)) return null;

  const lo = Math.max(0, ...regions.filter((r) => r.end <= time).map((r) => r.end));
  const hi = Math.min(
    duration,
    ...regions.filter((r) => r.start >= time).map((r) => r.start),
  );
  return { lo, hi };
}

/** The stretch one region may occupy without crossing its neighbours. */
export function roomFor(
  regions: readonly ZoomRegion[],
  id: string,
  duration: number,
): { lo: number; hi: number } {
  const region = regions.find((r) => r.id === id);
  if (!region) return { lo: 0, hi: duration };

  const others = regions.filter((r) => r.id !== id);
  return {
    lo: Math.max(0, ...others.filter((r) => r.end <= region.start).map((r) => r.end)),
    hi: Math.min(
      duration,
      ...others.filter((r) => r.start >= region.end).map((r) => r.start),
    ),
  };
}

/**
 * Where a new region lands for a press at `time`: the default length from
 * there, or what is left before a neighbour or the end. Only when less than
 * the shortest region is left is it pulled back to fit, since a press means
 * "from here" whenever "from here" is possible. Null when the gap cannot hold
 * even the shortest region.
 */
export function placeZoom(
  regions: readonly ZoomRegion[],
  time: number,
  duration: number,
): { start: number; end: number } | null {
  const room = roomAt(regions, time, duration);
  if (!room) return null;

  const forward = Math.min(DEFAULT_ZOOM_LENGTH, room.hi - time);
  if (forward >= MIN_ZOOM_LENGTH) return { start: time, end: time + forward };

  if (room.hi - room.lo < MIN_ZOOM_LENGTH) return null;
  return { start: room.hi - MIN_ZOOM_LENGTH, end: room.hi };
}

export function newZoomId(): string {
  return crypto.randomUUID();
}
