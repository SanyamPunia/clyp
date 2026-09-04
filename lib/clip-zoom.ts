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
 *
 * A region can follow the action instead of holding its aim. The clip's motion
 * track is read once from the picture by `lib/motion.ts`, and `zoomAt` turns
 * the window's centre on that track into a focus, clamped so the window never
 * leaves the picture. The regions carry only the flag. The track is handed in
 * beside them, since it is derived from the file rather than an edit on it.
 */

import {
  type FollowPace,
  type MotionTrack,
  DEFAULT_PACE,
  windowAt,
} from "@/lib/motion";

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
  /**
   * Follow the action rather than hold the aim. `focus` is then the fallback
   * for a stretch with no motion to follow.
   */
  follow?: boolean;
  /** How the window follows. Absent is `DEFAULT_PACE`. */
  pace?: FollowPace;
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
  motion: MotionTrack | null = null,
): ZoomState | null {
  const region = regions.find((r) => time >= r.start && time < r.end);
  if (!region) return null;

  const ramp = Math.min(ZOOM_RAMP * speed, (region.end - region.start) / 2);
  const progress =
    ramp > 0
      ? clamp(Math.min(time - region.start, region.end - time) / ramp, 0, 1)
      : 1;
  const scale = 1 + (region.scale - 1) * easeInOut(progress);

  // The window's centre rather than the action itself: the action roams a
  // comfort zone inside the window and the window moves only when it reaches
  // the zone's edge, so a wiggle of the mouse moves nothing.
  const centre =
    region.follow && motion
      ? windowAt(motion, region.scale, region.pace ?? DEFAULT_PACE, time)
      : null;

  return {
    scale,
    focus: centre ? centredOn(centre, scale) : region.focus,
  };
}

/**
 * The focus that puts `point` at the centre of the zoomed window, clamped so
 * the window stays inside the picture.
 *
 * A focus is the point that holds still while the picture grows, so a focus at
 * the action keeps the action where it was, not centred. The window's left
 * edge is `focus.x * (1 - 1 / scale)` and its width is `1 / scale`, so the
 * point sits at the centre when the focus is the point pulled in by half a
 * window and rescaled. At the picture's edges that runs past 0 or 1, and the
 * clamp is what holds the window against the edge instead.
 */
export function centredOn(point: ZoomFocus, scale: number): ZoomFocus {
  const window = 1 / scale;
  const span = 1 - window;
  if (span <= 1e-6) return point;
  return {
    x: clamp((point.x - window / 2) / span, 0, 1),
    y: clamp((point.y - window / 2) / span, 0, 1),
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

/**
 * A stretch worth zooming on, proposed from the motion track.
 *
 * Two things stand out in a screen recording. A click is where something was
 * done, so each gets a candidate around it, weighted twice. A dwell is where
 * the action stayed put for a while, a form being filled or a menu being read,
 * so each run of at least `DWELL_MIN` inside a small radius gets one too.
 * Candidates that overlap or nearly touch merge, up to a length a viewer can
 * sit through, and anything over an existing region is dropped: whoever placed
 * that region does not need it suggested.
 */
export interface ZoomSuggestion {
  start: number;
  end: number;
  /** The click, or the dwell's centre, as the region's aim if follow is off. */
  focus: ZoomFocus;
  score: number;
}

/** How far before and after a click its candidate reaches, in seconds. */
const CLICK_LEAD = 0.6;
const CLICK_TAIL = 1.9;
/** How still the action has to be, as a fraction of the picture, and for how long. */
const DWELL_RADIUS = 0.12;
const DWELL_MIN = 1.5;
/** Candidates this close merge into one. */
const MERGE_GAP = 0.4;
/** A merged candidate stops growing here. */
const MAX_SUGGESTION = 8;
const MAX_SUGGESTIONS = 6;

export function suggestZooms(
  motion: MotionTrack,
  duration: number,
  existing: readonly ZoomRegion[],
): ZoomSuggestion[] {
  const candidates: ZoomSuggestion[] = [];

  const c = motion.clicks;
  for (let i = 0; i < c.length; i += 3) {
    candidates.push({
      start: c[i] - CLICK_LEAD,
      end: c[i] + CLICK_TAIL,
      focus: { x: c[i + 1], y: c[i + 2] },
      score: 2,
    });
  }

  // Dwells: runs of samples that stay within the radius of the run's mean.
  const s = motion.samples;
  let runStart = -1;
  let sx = 0;
  let sy = 0;
  let n = 0;
  const flush = (endIndex: number) => {
    if (runStart < 0) return;
    const from = s[runStart];
    const to = s[endIndex];
    if (to - from >= DWELL_MIN) {
      candidates.push({
        start: from - 0.3,
        end: to + 0.3,
        focus: { x: sx / n, y: sy / n },
        score: 1 + Math.min((to - from) / 3, 1),
      });
    }
    runStart = -1;
    sx = sy = n = 0;
  };
  for (let i = 0; i < s.length; i += 3) {
    const x = s[i + 1];
    const y = s[i + 2];
    if (Number.isNaN(x)) {
      flush(Math.max(i - 3, 0));
      continue;
    }
    if (runStart < 0) {
      runStart = i;
      sx = x;
      sy = y;
      n = 1;
      continue;
    }
    if (Math.hypot(x - sx / n, y - sy / n) <= DWELL_RADIUS) {
      sx += x;
      sy += y;
      n++;
    } else {
      flush(i - 3);
      runStart = i;
      sx = x;
      sy = y;
      n = 1;
    }
  }
  flush(Math.max(s.length - 3, 0));

  // Clamp, then merge what overlaps or nearly touches.
  const clamped = candidates
    .map((k) => ({
      ...k,
      start: Math.max(k.start, 0),
      end: Math.min(k.end, duration),
    }))
    .filter((k) => k.end - k.start >= MIN_ZOOM_LENGTH)
    .sort((a, b) => a.start - b.start);

  const merged: ZoomSuggestion[] = [];
  for (const k of clamped) {
    const last = merged[merged.length - 1];
    if (
      last &&
      k.start - last.end <= MERGE_GAP &&
      Math.max(last.end, k.end) - last.start <= MAX_SUGGESTION
    ) {
      last.end = Math.max(last.end, k.end);
      if (k.score > last.score) last.focus = k.focus;
      last.score += k.score;
    } else if (last && k.start < last.end) {
      // Too long to merge: the later one starts where the earlier ends.
      const trimmed = { ...k, start: last.end };
      if (trimmed.end - trimmed.start >= MIN_ZOOM_LENGTH) merged.push(trimmed);
    } else {
      merged.push({ ...k });
    }
  }

  // Nothing over a region that is already there.
  const free = merged.filter(
    (k) => !existing.some((r) => k.start < r.end && k.end > r.start),
  );

  return free
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS)
    .sort((a, b) => a.start - b.start);
}
