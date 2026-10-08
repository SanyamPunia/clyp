/**
 * Pieces: the clip as a list of stretches of the source, in the order they
 * play.
 *
 * This is the model every editor uses. Split at the playhead, drag a piece's
 * ends to trim it, drag the piece itself to put it somewhere else in the
 * order, copy it, delete the one that should go. The list is the whole edit:
 * the output is each piece's footage end to end, in list order, and nothing
 * between them.
 *
 * **Every piece is its own reference to the file**, the way a clip is in
 * Canva. Its ends reach anywhere from the file's start to its end, whatever
 * the other pieces hold, so two pieces can show the same footage: that is
 * what a copy is. The zooms, the fades and the ripples stay on the source's
 * axis and go wherever their footage plays, every time it plays.
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
 * The first piece in the order holding a source time, or -1. Pieces can
 * share footage, so where it matters which one, the caller names the piece
 * by id and this is only the fallback.
 *
 * End exclusive, so a time where one piece ends and another opens belongs to
 * the one it opens. A time on a piece's end that opens nothing still counts
 * as that piece, which is where a playhead parks at the end of the clip.
 */
export function indexAt(segments: readonly Segment[], time: number): number {
  const inside = segments.findIndex((s) => time >= s.start && time < s.end);
  if (inside >= 0) return inside;
  return segments.findIndex((s) => Math.abs(time - s.end) < 1e-6);
}

/**
 * Output seconds before speed for a source time, in the piece at `index` when
 * it holds that time, or else the first piece that does. Null when none does.
 */
export function outputOf(
  segments: readonly Segment[],
  time: number,
  index = -1,
): number | null {
  const own = segments[index];
  const at =
    own && time >= own.start - 1e-3 && time <= own.end + 1e-3
      ? index
      : indexAt(segments, time);
  if (at < 0) return null;
  const segment = segments[at];
  return segment.at + Math.min(Math.max(time - segment.start, 0), segment.end - segment.start);
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
 * Moves one end of a piece to a source time, the way an editor trims a clip.
 * Coming in removes footage from the piece. Going out brings footage back, as
 * far as the file's own start or end and no further. It never goes under
 * `MIN_PIECE`.
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
  const next =
    edge === "start"
      ? { ...piece, start: clamp(to, 0, piece.end - MIN_PIECE) }
      : { ...piece, end: clamp(to, piece.start + MIN_PIECE, duration) };
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
 * The list with a copy of the piece at `index` right after it. The copy is
 * the same footage under a new id, and joins its original with a straight
 * cut, whatever way in the original has.
 */
export function copyPiece(
  pieces: readonly Piece[],
  index: number,
  id: string,
): Piece[] {
  const piece = pieces[index];
  if (!piece) return [...pieces];
  return [
    ...pieces.slice(0, index + 1),
    { id, start: piece.start, end: piece.end },
    ...pieces.slice(index + 1),
  ];
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
 * frame grid by `snap`, and anything under the shortest dropped, so a record
 * that disagrees with its file can never cut past its end. Null when nothing
 * usable is left.
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
 * A piece drawn somewhere other than where the list puts it, while its start
 * is being dragged: `index` and every piece after it sit `by` seconds further
 * along, so the start under the pointer moves and the piece's end holds still
 * until the drag lets go. Then the pieces close up.
 */
export interface LanePreview {
  index: number;
  by: number;
}

/** Where each piece starts on the timeline, in seconds from its zero. */
export function startsOf(
  pieces: readonly Piece[],
  preview: LanePreview | null = null,
): number[] {
  return segmentsOf(pieces).map(
    (s, i) => s.at + (preview && i >= preview.index ? preview.by : 0),
  );
}

/**
 * Where a stretch of the source shows on the timeline: once for every piece
 * whose footage overlaps it. `from` and `to` are timeline seconds, `start`
 * and `end` the part of the stretch shown there. `head` and `tail` say
 * whether the stretch's own start and end fall inside that piece, which is
 * where its edges can be grabbed.
 */
export interface Occurrence {
  index: number;
  from: number;
  to: number;
  start: number;
  end: number;
  head: boolean;
  tail: boolean;
}

export function occurrences(
  pieces: readonly Piece[],
  starts: readonly number[],
  start: number,
  end: number,
): Occurrence[] {
  const out: Occurrence[] = [];
  pieces.forEach((piece, index) => {
    const a = Math.max(start, piece.start);
    const b = Math.min(end, piece.end);
    if (b - a <= 1e-9) return;
    out.push({
      index,
      from: starts[index] + (a - piece.start),
      to: starts[index] + (b - piece.start),
      start: a,
      end: b,
      head: start >= piece.start - 1e-9,
      tail: end <= piece.end + 1e-9,
    });
  });
  return out;
}

/**
 * Where a drag puts a piece in the order: among the other pieces, before the
 * first whose middle is past `x`, the dragged piece's own middle in timeline
 * seconds.
 */
export function dropIndex(
  pieces: readonly Piece[],
  from: number,
  x: number,
): number {
  let at = 0;
  let index = 0;
  pieces.forEach((piece, i) => {
    if (i === from) return;
    const length = piece.end - piece.start;
    if (x > at + length / 2) index++;
    at += length;
  });
  return index;
}

/** How many seconds the timeline shows at its widest zoom, whatever the clip. */
export const MAX_TIMELINE = 600;

/** The lengths a timeline's default view is rounded up to. */
const TIMELINE_STEPS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 450, 600];

/**
 * How many seconds the timeline shows before it is zoomed: half as much
 * again as the file, rounded up to a step, so there is room past the end to
 * see where the clip stops and to grow a piece into. Never under ten seconds
 * and never over `MAX_TIMELINE`.
 */
export function timelineExtent(duration: number): number {
  const wanted = duration * 1.5;
  return TIMELINE_STEPS.find((step) => step >= wanted) ?? MAX_TIMELINE;
}
