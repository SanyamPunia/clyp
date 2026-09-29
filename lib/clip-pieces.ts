/**
 * Pieces: the kept clip split at points, so a piece can be picked and deleted.
 *
 * This is the model every editor uses, where a cut is a range dragged out by
 * its edges. Split at the playhead, press the piece that should go, delete it.
 * A deleted piece becomes a cut, so nothing downstream learns a new idea: the
 * encode, both audio paths, the preview and every readout already handle a
 * cut, and a deleted piece is one.
 *
 * Splits are source seconds, like the cuts and the trim. They are kept raw and
 * read through `tidySplits`, so a trim or a cut dragged across one simply
 * stops it dividing anything, rather than every edit having to repair them.
 *
 * **Every join between two pieces can carry a transition.** Where the pieces
 * are a gap apart, the join is a cut and the transition is the cut's. Where
 * they touch, the join is a split and the transition is the split's. The
 * footage either side of a split is continuous, but a dip or a push in on a
 * change of subject is a style, not a repair, and the join is where it goes.
 */

import {
  type Cut,
  MIN_CUT,
  keptSegments,
  leavesEnough,
  tidyCuts,
} from "@/lib/clip-cuts";
import type { Transition } from "@/lib/clip-transitions";
import type { Trim } from "@/types/screenshot";

/**
 * The shortest a piece may be. The shortest cut worth having, so every piece
 * can be deleted as a cut.
 */
export const MIN_PIECE = MIN_CUT;

export interface Piece {
  /** Source seconds. */
  start: number;
  end: number;
}

/** A point two pieces meet at with nothing removed between them. */
export interface Split {
  /** Source seconds. */
  at: number;
  /** How the two pieces run into each other. Absent is a straight join. */
  transition?: Transition;
}

/**
 * The splits that divide something: inside a kept segment, sorted, and each
 * at least `MIN_PIECE` from the segment's edges and from the split before it.
 */
export function tidySplits(
  trim: Trim,
  cuts: readonly Cut[],
  splits: readonly Split[],
): Split[] {
  const sorted = [...splits].sort((a, b) => a.at - b.at);
  const kept: Split[] = [];

  for (const segment of keptSegments(trim, cuts)) {
    let from = segment.start;
    for (const split of sorted) {
      if (split.at < segment.start || split.at > segment.end) continue;
      if (split.at - from < MIN_PIECE - 1e-9) continue;
      if (segment.end - split.at < MIN_PIECE - 1e-9) continue;
      kept.push(split);
      from = split.at;
    }
  }
  return kept;
}

/** The kept clip as pieces, in order. With no splits, one piece a segment. */
export function pieces(
  trim: Trim,
  cuts: readonly Cut[],
  splits: readonly Split[],
): Piece[] {
  const tidy = tidySplits(trim, cuts, splits);
  const out: Piece[] = [];

  for (const segment of keptSegments(trim, cuts)) {
    let from = segment.start;
    for (const split of tidy) {
      if (split.at <= segment.start || split.at >= segment.end) continue;
      out.push({ start: from, end: split.at });
      from = split.at;
    }
    out.push({ start: from, end: segment.end });
  }
  return out;
}

/** The piece covering `time`, end exclusive except for the last. */
export function pieceAt(list: readonly Piece[], time: number): Piece | null {
  const last = list[list.length - 1];
  return (
    list.find((p) => time >= p.start && time < p.end) ??
    (last && Math.abs(time - last.end) < 1e-9 ? last : null)
  );
}

/**
 * The splits with one more at `time`, or null when it would leave a piece
 * shorter than `MIN_PIECE` or `time` is not on a kept frame.
 */
export function splitAt(
  trim: Trim,
  cuts: readonly Cut[],
  splits: readonly Split[],
  time: number,
): Split[] | null {
  const piece = pieceAt(pieces(trim, cuts, splits), time);
  if (!piece) return null;
  if (time - piece.start < MIN_PIECE - 1e-9) return null;
  if (piece.end - time < MIN_PIECE - 1e-9) return null;
  return [...tidySplits(trim, cuts, splits), { at: time }].sort((a, b) => a.at - b.at);
}

/**
 * The cuts with a piece taken out, or null when that would leave less than
 * the clip's minimum. The splits at the piece's edges now sit on a cut's edge,
 * where `tidySplits` drops them.
 */
export function removePiece(
  trim: Trim,
  cuts: readonly Cut[],
  piece: Piece,
  id: string,
): Cut[] | null {
  const next = tidyCuts([...cuts, { id, start: piece.start, end: piece.end }], trim);
  return leavesEnough(trim, next) ? next : null;
}

/**
 * Every join between two pieces, with the transition it carries: a cut's
 * where the pieces are a gap apart, a split's where they touch. `at` is the
 * source time the second piece opens on.
 */
export function joinsBetween(
  trim: Trim,
  cuts: readonly Cut[],
  splits: readonly Split[],
): { index: number; at: number; transition?: Transition }[] {
  const list = pieces(trim, cuts, splits);
  const tidyCutList = tidyCuts(cuts, trim);
  const tidySplitList = tidySplits(trim, cuts, splits);

  return list.slice(1).map((piece, i) => {
    const touching = Math.abs(list[i].end - piece.start) < 1e-6;
    const transition = touching
      ? tidySplitList.find((s) => Math.abs(s.at - piece.start) < 1e-6)?.transition
      : tidyCutList.find((c) => Math.abs(c.end - piece.start) < 1e-6)?.transition;
    return { index: i + 1, at: piece.start, transition };
  });
}

/** The whole edit a set of pieces stands for. */
export interface PieceEdit {
  trim: Trim;
  cuts: Cut[];
  splits: Split[];
}

/** An edit after a move, and where the moved piece now sits. */
export interface PieceMove extends PieceEdit {
  piece: Piece;
}

/**
 * How far a piece may move each way, in source seconds: up to the piece
 * before it and the piece after it, or the file's own ends. A piece against
 * a neighbour has no room on that side.
 */
export function roomToMove(
  list: readonly Piece[],
  index: number,
  duration: number,
): { back: number; forward: number } {
  const piece = list[index];
  const lo = index > 0 ? list[index - 1].end : 0;
  const hi = index < list.length - 1 ? list[index + 1].start : duration;
  return {
    back: Math.max(piece.start - lo, 0),
    forward: Math.max(hi - piece.end, 0),
  };
}

/**
 * The edit a list of pieces stands for, after one of them has changed.
 *
 * The pieces are the edit: the trim is the first piece's start to the last
 * one's end, every gap between two pieces is a cut, and two pieces that touch
 * meet at a split. So a move or a resize changes the list and the edit is read
 * back off it, which is what lets the first piece reach into what the trim had
 * taken off.
 *
 * A join keeps its transition whether it is a gap or a touch afterwards, so
 * closing a gap onto a neighbour does not lose it, and neither does opening
 * one. A gap keeps the id of the cut that was in the same place, too.
 */
function editFrom(
  trim: Trim,
  cuts: readonly Cut[],
  splits: readonly Split[],
  list: readonly Piece[],
  next: readonly Piece[],
  newId: () => string,
): PieceEdit {
  const tidy = tidyCuts(cuts, trim);
  const joins = joinsBetween(trim, cuts, splits);
  const cutAfter = list.map((p) => tidy.find((c) => Math.abs(c.start - p.end) < 1e-6));

  const nextCuts: Cut[] = [];
  const nextSplits: Split[] = [];
  for (let i = 0; i < next.length - 1; i++) {
    const end = next[i].end;
    const start = next[i + 1].start;
    const transition = joins[i]?.transition;
    if (start - end > 1e-6) {
      const old = cutAfter[i];
      nextCuts.push({
        id: old?.id ?? newId(),
        start: end,
        end: start,
        ...(transition && { transition }),
      });
    } else {
      nextSplits.push({ at: end, ...(transition && { transition }) });
    }
  }

  return {
    trim: { start: next[0].start, end: next[next.length - 1].end },
    cuts: nextCuts,
    splits: nextSplits,
  };
}

const same = (a: Piece, b: Piece) =>
  Math.abs(a.start - b.start) < 1e-6 && Math.abs(a.end - b.end) < 1e-6;

/**
 * Moves one piece along the source by `by` seconds, clamped to the room
 * around it, and returns the edit that results. The piece keeps its length.
 */
export function movePiece(
  trim: Trim,
  cuts: readonly Cut[],
  splits: readonly Split[],
  piece: Piece,
  by: number,
  duration: number,
  newId: () => string,
): PieceMove {
  const list = pieces(trim, cuts, splits);
  const index = list.findIndex((p) => same(p, piece));
  if (index < 0) {
    return { trim, cuts: [...cuts], splits: tidySplits(trim, cuts, splits), piece };
  }

  const room = roomToMove(list, index, duration);
  const shift = Math.min(Math.max(by, -room.back), room.forward);
  const next = list.map((p, i) =>
    i === index ? { start: p.start + shift, end: p.end + shift } : p,
  );
  return { ...editFrom(trim, cuts, splits, list, next, newId), piece: next[index] };
}

/**
 * Moves one edge of a piece to `to`, the way an editor resizes a clip.
 *
 * Shortening it leaves a gap, which is a cut. Lengthening it takes the room
 * beside it, up to its neighbour or the file's own end, and no further. It
 * never goes under `MIN_PIECE`, so the piece stays one that can be deleted.
 */
export function resizePiece(
  trim: Trim,
  cuts: readonly Cut[],
  splits: readonly Split[],
  piece: Piece,
  edge: "start" | "end",
  to: number,
  duration: number,
  newId: () => string,
): PieceMove {
  const list = pieces(trim, cuts, splits);
  const index = list.findIndex((p) => same(p, piece));
  if (index < 0) {
    return { trim, cuts: [...cuts], splits: tidySplits(trim, cuts, splits), piece };
  }

  const lo = index > 0 ? list[index - 1].end : 0;
  const hi = index < list.length - 1 ? list[index + 1].start : duration;
  const current = list[index];
  const resized =
    edge === "start"
      ? { start: Math.min(Math.max(to, lo), current.end - MIN_PIECE), end: current.end }
      : { start: current.start, end: Math.max(Math.min(to, hi), current.start + MIN_PIECE) };
  const next = list.map((p, i) => (i === index ? resized : p));
  return { ...editFrom(trim, cuts, splits, list, next, newId), piece: resized };
}
