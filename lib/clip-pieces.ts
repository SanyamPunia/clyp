/**
 * Pieces: the clip as a list of stretches of the source, in the order they
 * play.
 *
 * This is the model every editor uses. Split at the playhead, drag a piece's
 * edges to trim it, drag the piece itself to put it somewhere else in the
 * order, delete the one that should go. The list is the whole edit: the
 * output is each piece's footage end to end, in list order, and nothing
 * between them.
 *
 * **Two pieces never share footage.** A piece's edges stop at the footage of
 * whichever piece holds the source either side of it, so a source time
 * belongs to at most one piece and the map from the source to the output is
 * one to one. That is what lets the zooms, the fades, the marks' ripples and
 * a soundtrack's anchor stay on the source's axis: they follow their footage
 * wherever its piece goes.
 *
 * **A transition belongs to the piece it runs into.** Moving a piece takes its
 * way in with it. The first piece's is never read.
 *
 * Everything here is pure, and the arithmetic is the whole of it.
 */

import { type Transition, tidyTransition } from "@/lib/clip-transitions";

/** The shortest a piece may be. Below this it is a frame or two of nothing. */
export const MIN_PIECE = 0.2;

export interface Piece {
  id: string;
  /** Source seconds. */
  start: number;
  end: number;
  /** How the piece before runs into this one. Absent is a straight join. */
  transition?: Transition;
}

/** One piece's footage, and where it lands on the output's clock. */
export interface Segment {
  /** Source seconds. */
  start: number;
  end: number;
  /** Where this segment begins on the output's clock, before speed. */
  at: number;
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

export function newPieceId(): string {
  return crypto.randomUUID();
}

/** A clip nobody has cut: one piece, the whole file. */
export function wholeClip(duration: number): Piece[] {
  return [{ id: newPieceId(), start: 0, end: duration }];
}

/** Each piece's footage with its place on the output, in play order. */
export function segmentsOf(pieces: readonly Piece[]): Segment[] {
  let at = 0;
  return pieces.map((piece) => {
    const segment = { start: piece.start, end: piece.end, at };
    at += piece.end - piece.start;
    return segment;
  });
}

/** The output's length before speed. */
export function lengthOf(pieces: readonly Piece[]): number {
  return pieces.reduce((total, p) => total + (p.end - p.start), 0);
}

/**
 * The piece holding a source time, or -1.
 *
 * End exclusive, so a time two pieces share at an edge belongs to the one it
 * opens. A time on a piece's end that opens nothing still counts as that
 * piece, which is where a playhead parks at the end of the clip.
 */
export function indexAt(segments: readonly Segment[], time: number): number {
  const inside = segments.findIndex((s) => time >= s.start && time < s.end);
  if (inside >= 0) return inside;
  return segments.findIndex((s) => Math.abs(time - s.end) < 1e-6);
}

/** Output seconds before speed for a source time in a piece, or null. */
export function outputOf(segments: readonly Segment[], time: number): number | null {
  const index = indexAt(segments, time);
  if (index < 0) return null;
  const segment = segments[index];
  return segment.at + (time - segment.start);
}

/** The source time at an output time, and the piece it is in. */
export function sourceAt(
  segments: readonly Segment[],
  out: number,
): { index: number; time: number } {
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const length = segment.end - segment.start;
    if (out < segment.at + length || index === segments.length - 1) {
      return {
        index,
        time: segment.start + clamp(out - segment.at, 0, length),
      };
    }
  }
  return { index: -1, time: 0 };
}

/**
 * How far a piece's edges may go on the source: back to the footage of the
 * piece that holds the source before it, forward to the next one's, or the
 * file's own ends.
 */
export function roomOf(
  pieces: readonly Piece[],
  index: number,
  duration: number,
): { lo: number; hi: number } {
  const piece = pieces[index];
  let lo = 0;
  let hi = duration;
  pieces.forEach((other, i) => {
    if (i === index) return;
    if (other.end <= piece.start + 1e-9) lo = Math.max(lo, other.end);
    if (other.start >= piece.end - 1e-9) hi = Math.min(hi, other.start);
  });
  return { lo, hi };
}

/**
 * The list with the piece at `index` divided at a source time, or null when
 * either half would be shorter than `MIN_PIECE`. The second half follows the
 * first in the order, and the two meet with a straight join, since the
 * footage either side is continuous.
 */
export function splitPiece(
  pieces: readonly Piece[],
  index: number,
  at: number,
  id: string,
): Piece[] | null {
  const piece = pieces[index];
  if (!piece) return null;
  if (at - piece.start < MIN_PIECE - 1e-9) return null;
  if (piece.end - at < MIN_PIECE - 1e-9) return null;
  return [
    ...pieces.slice(0, index),
    { ...piece, end: at },
    { id, start: at, end: piece.end },
    ...pieces.slice(index + 1),
  ];
}

/** The list without the piece at `index`, or null when it is the only one. */
export function removePiece(pieces: readonly Piece[], index: number): Piece[] | null {
  if (pieces.length < 2 || !pieces[index]) return null;
  return pieces.filter((_, i) => i !== index);
}

/**
 * Moves one edge of a piece to a source time, the way an editor trims a
 * clip. Coming in removes footage from the piece. Going out brings footage
 * back, up to the piece that holds the source beside it or the file's own
 * end, and no further. It never goes under `MIN_PIECE`.
 */
export function resizePiece(
  pieces: readonly Piece[],
  index: number,
  edge: "start" | "end",
  to: number,
  duration: number,
): Piece[] {
  const piece = pieces[index];
  if (!piece) return [...pieces];
  const { lo, hi } = roomOf(pieces, index, duration);
  const next =
    edge === "start"
      ? { ...piece, start: clamp(to, lo, piece.end - MIN_PIECE) }
      : { ...piece, end: clamp(to, piece.start + MIN_PIECE, hi) };
  return pieces.map((p, i) => (i === index ? next : p));
}

/** The list with one piece taken out of the order and put back at `to`. */
export function movePiece(
  pieces: readonly Piece[],
  from: number,
  to: number,
): Piece[] {
  const next = [...pieces];
  const [moved] = next.splice(from, 1);
  if (!moved) return [...pieces];
  next.splice(clamp(to, 0, next.length), 0, moved);
  return next;
}

/**
 * Whether the piece at `index` carries straight on from the one before it,
 * which is what a split leaves and the one join that can be undone by
 * joining the two back.
 */
export function continues(pieces: readonly Piece[], index: number): boolean {
  const before = pieces[index - 1];
  const piece = pieces[index];
  return Boolean(before && piece && Math.abs(before.end - piece.start) < 1e-6);
}

/**
 * The two pieces either side of a join made one again, or null when the
 * footage is not continuous there. The first piece's id and way in survive.
 */
export function joinPieces(pieces: readonly Piece[], index: number): Piece[] | null {
  if (!continues(pieces, index)) return null;
  const before = pieces[index - 1];
  return [
    ...pieces.slice(0, index - 1),
    { ...before, end: pieces[index].end },
    ...pieces.slice(index + 1),
  ];
}

/**
 * The list with a piece's way in set or taken off. Written without the key
 * rather than as `undefined`, so a straight join stores as one.
 */
export function withTransition(
  pieces: readonly Piece[],
  index: number,
  transition: Transition | undefined,
): Piece[] {
  return pieces.map((piece, i) => {
    if (i !== index) return piece;
    const rest = { ...piece };
    delete rest.transition;
    return transition ? { ...rest, transition } : rest;
  });
}

/**
 * Stored pieces made safe for a file of `duration`: clamped to it, put on the
 * frame grid by `snap`, anything under the shortest dropped, and anything
 * sharing footage with a piece earlier in the order dropped too, so a record
 * that disagrees with its file can never break the one-to-one map. Null when
 * nothing usable is left.
 */
export function tidyPieces(
  value: unknown,
  duration: number,
  snap: (seconds: number) => number,
): Piece[] | null {
  if (!Array.isArray(value)) return null;
  const kept: Piece[] = [];

  for (const raw of value as Partial<Piece>[]) {
    if (typeof raw?.start !== "number" || typeof raw.end !== "number") continue;
    const start = snap(clamp(raw.start, 0, duration));
    const end = snap(clamp(raw.end, 0, duration));
    if (end - start < MIN_PIECE - 1e-9) continue;
    if (kept.some((p) => start < p.end - 1e-9 && end > p.start + 1e-9)) continue;
    const transition = tidyTransition(raw.transition);
    kept.push({
      id: typeof raw.id === "string" ? raw.id : newPieceId(),
      start,
      end,
      ...(transition && { transition }),
    });
  }
  return kept.length ? kept : null;
}

/** An edit as builds before pieces had an order stored it. */
export interface LegacyEdit {
  trim: { start: number; end: number };
  cuts?: { start: number; end: number; transition?: unknown }[];
  splits?: ({ at: number; transition?: unknown } | number)[];
}

/**
 * Pieces from an in and out point, the stretches cut from between them and
 * the points they were split at, which is how a draft was stored before
 * pieces could be put in another order. Read once on restore. A cut's
 * transition goes to the piece after it, and a split's to the piece it
 * opens.
 */
export function fromLegacy({ trim, cuts = [], splits = [] }: LegacyEdit): Piece[] {
  const removed = [...cuts]
    .map((c) => ({
      start: Math.max(Math.min(c.start, c.end), trim.start),
      end: Math.min(Math.max(c.start, c.end), trim.end),
      transition: c.transition,
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);
  const points = splits
    .map((s) => (typeof s === "number" ? { at: s } : s))
    .sort((a, b) => a.at - b.at);

  const pieces: Piece[] = [];
  let from = trim.start;
  let way: unknown;
  const close = (end: number) => {
    let start = from;
    for (const point of points) {
      if (point.at - start < MIN_PIECE - 1e-9 || end - point.at < MIN_PIECE - 1e-9) {
        continue;
      }
      pieces.push(piece(start, point.at, way));
      start = point.at;
      way = point.transition;
    }
    if (end - start > 1e-9) pieces.push(piece(start, end, way));
  };

  for (const cut of removed) {
    if (cut.start > from) close(cut.start);
    from = Math.max(from, cut.end);
    way = cut.transition;
  }
  if (trim.end > from) close(trim.end);
  return pieces;
}

function piece(start: number, end: number, way: unknown): Piece {
  const transition = tidyTransition(way);
  return { id: newPieceId(), start, end, ...(transition && { transition }) };
}

/**
 * A piece drawn somewhere other than where the list puts it, while one of its
 * edges is being dragged: `index` and every piece after it sit `by` seconds
 * further along, so the edge under the pointer moves and the piece's other
 * edge holds still until the drag lets go.
 */
export interface LanePreview {
  index: number;
  by: number;
}

/** The timeline lane's map between the source and the lane, in seconds. */
export interface Lane {
  /** Where the first piece starts on the lane, which is the output's zero. */
  origin: number;
  /** The pieces' total length on the lane. */
  total: number;
  /** Where each piece starts on the lane, preview included. */
  starts: number[];
  toLane: (time: number) => number;
  fromLane: (x: number) => number;
}

/**
 * The lane draws the output: the pieces end to end from `origin`, so each one
 * carries its own footage, and there is never a gap between two.
 *
 * In front of the first piece is the footage it can still reach back into,
 * at its own place, so its start edge is dragged out over it and stays under
 * the pointer. After the last piece is the footage it can still reach into,
 * the same way. A source time held by no piece lands where the piece holding
 * the footage after it starts, which is the join a cut made there.
 */
export function laneOf(
  pieces: readonly Piece[],
  preview: LanePreview | null = null,
): Lane {
  const segments = segmentsOf(pieces);
  const total = lengthOf(pieces);
  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  if (!first || !last) {
    return { origin: 0, total: 0, starts: [], toLane: (t) => t, fromLane: (x) => x };
  }

  const shift = (index: number) =>
    preview && index >= preview.index ? preview.by : 0;
  const lo = roomOf(pieces, 0, Infinity).lo;
  const hi = roomOf(pieces, pieces.length - 1, Infinity).hi;
  const origin = first.start - lo;
  const starts = segments.map((s, i) => origin + s.at + shift(i));
  const end = origin + total + shift(pieces.length - 1);

  const toLane = (time: number) => {
    const index = indexAt(segments, time);
    if (index >= 0) return starts[index] + (time - segments[index].start);
    if (time < first.start && time >= lo) return origin - (first.start - time);
    if (time > last.end && time <= hi) return end + (time - last.end);
    // Footage no piece holds: the join where the footage after it opens.
    let next = -1;
    segments.forEach((s, i) => {
      if (s.start > time && (next < 0 || s.start < segments[next].start)) next = i;
    });
    return next >= 0 ? starts[next] : end;
  };

  const fromLane = (x: number) => {
    if (x < origin) return first.start - (origin - x);
    if (x >= origin + total) return last.end + (x - origin - total);
    return sourceAt(segments, x - origin).time;
  };

  return { origin, total, starts, toLane, fromLane };
}

/**
 * Where a drag puts a piece in the order: among the other pieces, before the
 * first whose middle is past `x` on the lane.
 */
export function dropIndex(
  pieces: readonly Piece[],
  from: number,
  x: number,
  origin: number,
): number {
  let at = origin;
  let index = 0;
  pieces.forEach((piece, i) => {
    if (i === from) return;
    const length = piece.end - piece.start;
    if (x > at + length / 2) index++;
    at += length;
  });
  return index;
}
