/**
 * Cuts: stretches of the clip removed from the middle of it.
 *
 * The trim is one in point and one out point, so it can only take time off the
 * ends. A screen recording's dead time is rarely at the ends: it is the page
 * load, the fumble, the pause to read the thing that just appeared. A cut
 * removes one of those and joins what is either side of it.
 *
 * A cut is on the source's axis, like the trim, the speed and the zooms, so
 * trimming never moves one and a speed change plays what survives faster
 * rather than shifting it.
 *
 * **The output's clock is no longer the source's clock shifted.** With a cut in
 * the middle, source time and output time are a piecewise map, and everything
 * that has to agree about when a frame lands goes through `toOutput`: the
 * export's video loop, both of its audio paths, the preview's playhead, the
 * duration readout and the size estimate. Nothing recomputes it.
 *
 * Everything here is pure, and the arithmetic is the whole of it.
 */

import type { Trim } from "@/types/screenshot";

export interface Cut {
  id: string;
  /** Source seconds. The stretch this removes. */
  start: number;
  end: number;
}

/** One kept stretch of the source, and where it lands on the output. */
export interface Segment {
  /** Source seconds. */
  start: number;
  end: number;
  /** Where this segment begins on the output's clock, before speed. */
  at: number;
}

/** The shortest cut worth having. Below this it is a frame or two of nothing. */
export const MIN_CUT = 0.2;
/** What a new cut is given when there is room for it. */
export const DEFAULT_CUT_LENGTH = 1;
/**
 * The shortest the kept clip may be left. The trim's own minimum, so a cut can
 * never leave less picture than dragging the handles together would.
 */
export const MIN_KEPT = 0.2;

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

export function newCutId(): string {
  return crypto.randomUUID();
}

/**
 * Sorted, clipped to the trim, and merged where they overlap or touch.
 *
 * Two cuts that meet are one cut: the join they produce is the same, and
 * keeping them apart would let a zero-length segment sit between them. The
 * first cut's id survives a merge, so a selection is not lost by dragging one
 * into its neighbour.
 */
export function tidyCuts(cuts: readonly Cut[], trim: Trim): Cut[] {
  const inside = cuts
    .map((cut) => ({
      ...cut,
      start: clamp(Math.min(cut.start, cut.end), trim.start, trim.end),
      end: clamp(Math.max(cut.start, cut.end), trim.start, trim.end),
    }))
    .filter((cut) => cut.end > cut.start)
    .sort((a, b) => a.start - b.start);

  const merged: Cut[] = [];
  for (const cut of inside) {
    const last = merged[merged.length - 1];
    if (last && cut.start <= last.end) last.end = Math.max(last.end, cut.end);
    else merged.push({ ...cut });
  }
  return merged;
}

/**
 * The kept stretches between the cuts, in order.
 *
 * A cut against either end of the trim leaves no segment there rather than a
 * zero-length one, which is what makes dragging a cut onto the in point behave
 * as trimming to it.
 */
export function keptSegments(trim: Trim, cuts: readonly Cut[]): Segment[] {
  const segments: Segment[] = [];
  let from = trim.start;
  let at = 0;

  for (const cut of tidyCuts(cuts, trim)) {
    if (cut.start > from) {
      segments.push({ start: from, end: cut.start, at });
      at += cut.start - from;
    }
    from = Math.max(from, cut.end);
  }
  if (trim.end > from) segments.push({ start: from, end: trim.end, at });

  return segments;
}

/** Source seconds that survive, which is the output's length before speed. */
export function keptSeconds(trim: Trim, cuts: readonly Cut[]): number {
  return keptSegments(trim, cuts).reduce(
    (total, segment) => total + (segment.end - segment.start),
    0,
  );
}

/** The cut covering `time`, or null. The end is exclusive, like a zoom's. */
export function cutAt(cuts: readonly Cut[], time: number): Cut | null {
  return cuts.find((cut) => time >= cut.start && time < cut.end) ?? null;
}

/**
 * Source time on the output's clock, before speed.
 *
 * A time inside a cut has no frame of its own, so it maps to the join: the
 * output time the cut's own start had. That is what a playhead dragged into a
 * cut should read, and it keeps the map monotonic.
 */
export function toOutput(
  trim: Trim,
  cuts: readonly Cut[],
  time: number,
): number {
  return outputAt(keptSegments(trim, cuts), time);
}

/**
 * The same map against segments already computed.
 *
 * The encode loop calls this once a frame, and re-deriving the segments each
 * time would sort the cut list tens of thousands of times for one export. The
 * segments carry the trim's own bounds, so this needs neither.
 */
export function outputAt(
  segments: readonly Segment[],
  time: number,
): number {
  if (segments.length === 0) return 0;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const clamped = clamp(time, first.start, last.end);

  for (const segment of segments) {
    if (clamped < segment.start) return segment.at;
    if (clamped <= segment.end) return segment.at + (clamped - segment.start);
  }
  return last.at + (last.end - last.start);
}

/** Output time before speed, back onto the source's axis. */
export function toSource(
  trim: Trim,
  cuts: readonly Cut[],
  out: number,
): number {
  const segments = keptSegments(trim, cuts);
  if (segments.length === 0) return trim.start;

  for (const segment of segments) {
    const length = segment.end - segment.start;
    if (out < segment.at + length) {
      return segment.start + Math.max(out - segment.at, 0);
    }
  }
  const last = segments[segments.length - 1];
  return last.end;
}

/**
 * Where playback continues from `time`, which is `time` itself unless it is
 * inside a cut, in which case it is the far side of it.
 *
 * Cuts are merged, so one step is always enough. Past the last kept frame it
 * answers the trim's own out point, which the loop reads as the end.
 */
export function afterCuts(
  trim: Trim,
  cuts: readonly Cut[],
  time: number,
): number {
  const cut = cutAt(tidyCuts(cuts, trim), time);
  return cut ? Math.min(cut.end, trim.end) : time;
}

/**
 * The longest one cut may be without leaving less picture than `MIN_KEPT`.
 *
 * A drag clamps its edges with this rather than being refused by
 * `leavesEnough`, so the edge slides to the limit and stops there instead of
 * sticking wherever the last accepted pointer sample put it.
 */
export function longestCut(
  trim: Trim,
  cuts: readonly Cut[],
  id: string,
): number {
  const others = cuts.filter((cut) => cut.id !== id);
  return Math.max(keptSeconds(trim, others) - MIN_KEPT, 0);
}

/**
 * Whether a set of cuts leaves enough of the clip to be worth exporting.
 *
 * `placeCut` will not propose one that does not, but a drag can reach the same
 * place: one cut's two edges, pulled to the in and out points, span the whole
 * trim. So every edit that changes a cut or a trim asks this before taking it,
 * and the edge stops rather than the clip going to nothing.
 */
export function leavesEnough(trim: Trim, cuts: readonly Cut[]): boolean {
  return keptSeconds(trim, cuts) >= MIN_KEPT - 1e-9;
}

/**
 * The nearest time that survives, which is `time` itself unless it is inside a
 * cut, in which case it is whichever edge of that cut is closer.
 *
 * This is for a hand rather than for playback: a scrub or a frame step should
 * land on a frame that will be in the export, and the closer edge is the one
 * under the pointer. Playback uses `afterCuts` instead, which only ever moves
 * forward, since a loop that could go backwards would never leave the cut.
 */
export function nearestKept(
  trim: Trim,
  cuts: readonly Cut[],
  time: number,
): number {
  const tidy = tidyCuts(cuts, trim);
  const cut = cutAt(tidy, time);
  if (!cut) return clamp(time, trim.start, trim.end);

  const back = Math.max(cut.start, trim.start);
  const forward = Math.min(cut.end, trim.end);
  // A cut against the in point has nothing behind it, and one against the out
  // point nothing in front, so the other edge is the only answer there.
  if (back <= trim.start) return forward;
  if (forward >= trim.end) return back;
  return time - cut.start <= cut.end - time ? back : forward;
}

/**
 * The stretch a cut may occupy without crossing its neighbours, or null when
 * `time` is already inside one. `id` excludes a cut from its own bounds, which
 * is what lets an existing one be dragged.
 */
export function roomForCut(
  trim: Trim,
  cuts: readonly Cut[],
  time: number,
  id?: string,
): { lo: number; hi: number } | null {
  const others = cuts.filter((cut) => cut.id !== id);
  const own = id ? cuts.find((cut) => cut.id === id) : undefined;
  const from = own ? own.start : time;
  const to = own ? own.end : time;

  if (!own && cutAt(others, time)) return null;

  return {
    lo: Math.max(
      trim.start,
      ...others.filter((cut) => cut.end <= from).map((cut) => cut.end),
    ),
    hi: Math.min(
      trim.end,
      ...others.filter((cut) => cut.start >= to).map((cut) => cut.start),
    ),
  };
}

/**
 * Where a new cut lands for a press at `time`: the default length from there,
 * or what is left before a neighbour, the out point, or the last `MIN_KEPT` of
 * picture.
 *
 * A press means "from here" whenever that is possible, so the cut is only
 * pulled back to fit when less than the shortest cut is left forward.
 *
 * **A cut is shortened to leave the minimum rather than refused for it.**
 * Unlike a zoom, which either fits or does not, a cut can always be made
 * smaller, and on a two second clip a Cut button that does nothing is worse
 * than one that removes what it can. It refuses only when a cut worth having
 * would not fit at all: a cut already covering `time`, a gap too small, or
 * less than `MIN_CUT` of removable picture left.
 */
export function placeCut(
  trim: Trim,
  cuts: readonly Cut[],
  time: number,
  length = DEFAULT_CUT_LENGTH,
): { start: number; end: number } | null {
  const room = roomForCut(trim, cuts, time);
  if (!room) return null;

  // What may still be removed. `time` is not inside a cut, so the whole of a
  // cut placed within `room` comes off the kept total one for one.
  const spare = keptSeconds(trim, cuts) - MIN_KEPT;
  if (spare < MIN_CUT) return null;

  const forward = Math.min(length, room.hi - time, spare);
  if (forward >= MIN_CUT) return { start: time, end: time + forward };

  // The pull-back takes the shortest, never `length`. Reaching here means
  // there was almost no room forward, and removing a whole second because the
  // press landed in the last tenth of one is not what "from here" meant.
  if (room.hi - room.lo < MIN_CUT) return null;
  return { start: room.hi - MIN_CUT, end: room.hi };
}
