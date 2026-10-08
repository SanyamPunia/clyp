import { describe, expect, it } from "vitest";

import {
  MAX_TIMELINE,
  MIN_PIECE,
  type Piece,
  continues,
  copyPiece,
  dropIndex,
  fromLegacy,
  indexAt,
  joinPieces,
  lengthOf,
  movePiece,
  occurrences,
  outputOf,
  removePiece,
  resizePiece,
  segmentsOf,
  sourceAt,
  splitPiece,
  startsOf,
  tidyPieces,
  timelineExtent,
  withTransition,
} from "@/lib/clip-pieces";

const p = (start: number, end: number, id = `${start}-${end}`): Piece => ({
  id,
  start,
  end,
});
const spans = (pieces: readonly Piece[]) => pieces.map((x) => [x.start, x.end]);
const grid = (seconds: number) => Math.round(seconds * 30) / 30;

describe("segmentsOf", () => {
  it("lays the pieces end to end in play order", () => {
    expect(segmentsOf([p(3, 6), p(0, 2)])).toEqual([
      { start: 3, end: 6, at: 0 },
      { start: 0, end: 2, at: 3 },
    ]);
    expect(lengthOf([p(3, 6), p(0, 2)])).toBe(5);
  });
});

describe("indexAt and outputOf", () => {
  const segments = segmentsOf([p(0, 2), p(3, 6)]);

  it("finds the piece holding a source time", () => {
    expect(indexAt(segments, 1)).toBe(0);
    expect(indexAt(segments, 4)).toBe(1);
    expect(indexAt(segments, 2.5)).toBe(-1);
  });

  it("gives a shared edge to the piece it opens", () => {
    const touching = segmentsOf([p(0, 3), p(3, 6)]);
    expect(indexAt(touching, 3)).toBe(1);
  });

  it("counts a piece's end that opens nothing as that piece", () => {
    expect(indexAt(segments, 2)).toBe(0);
    expect(indexAt(segments, 6)).toBe(1);
  });

  it("reads a time in the piece it is told, when two show the same footage", () => {
    const twice = segmentsOf([p(0, 2), p(0, 2)]);
    expect(outputOf(twice, 1)).toBe(1);
    expect(outputOf(twice, 1, 1)).toBe(3);
  });

  it("maps footage onto the output and back", () => {
    expect(outputOf(segments, 4)).toBe(3);
    expect(outputOf(segments, 2.5)).toBeNull();
    expect(sourceAt(segments, 3)).toEqual({ index: 1, time: 4 });
    expect(sourceAt(segments, 99)).toEqual({ index: 1, time: 6 });
  });
});

describe("splitPiece", () => {
  it("divides a piece and puts the second half right after it", () => {
    const next = splitPiece([p(0, 6, "a")], 0, 3, "b")!;
    expect(next).toEqual([p(0, 3, "a"), p(3, 6, "b")]);
    expect(continues(next, 1)).toBe(true);
  });

  it("refuses a half shorter than the minimum", () => {
    expect(splitPiece([p(0, 6)], 0, MIN_PIECE / 2, "b")).toBeNull();
    expect(splitPiece([p(0, 6)], 0, 6 - MIN_PIECE / 2, "b")).toBeNull();
  });
});

describe("removePiece", () => {
  it("takes the piece out, and the clip is that much shorter", () => {
    const next = removePiece([p(0, 2), p(2, 3), p(3, 6)], 1)!;
    expect(spans(next)).toEqual([[0, 2], [3, 6]]);
    expect(lengthOf(next)).toBe(5);
  });

  it("refuses to take the last piece", () => {
    expect(removePiece([p(0, 6)], 0)).toBeNull();
  });
});

describe("resizePiece", () => {
  it("brings an end in, and nothing else moves", () => {
    const next = resizePiece([p(0, 3), p(3, 6)], 0, "end", 1, 6);
    expect(spans(next)).toEqual([[0, 1], [3, 6]]);
  });

  it("takes an end back out as far as the file goes, whatever the other pieces hold", () => {
    // Each piece is its own reference to the file, so the first can grow over
    // footage the second also shows.
    expect(spans(resizePiece([p(0, 1), p(3, 6)], 0, "end", 9, 6))).toEqual([
      [0, 6],
      [3, 6],
    ]);
    expect(spans(resizePiece([p(3, 6), p(0, 2)], 0, "start", -4, 6))).toEqual([
      [0, 6],
      [0, 2],
    ]);
  });

  it("never goes under the shortest piece", () => {
    const next = resizePiece([p(0, 3)], 0, "end", 0, 6);
    expect(next[0].end - next[0].start).toBeCloseTo(MIN_PIECE, 10);
  });
});

describe("copyPiece", () => {
  it("puts the same footage right after the piece, under a new id and a straight join", () => {
    const dip = { kind: "black" as const, duration: 0.5 };
    const next = copyPiece([p(0, 2, "a"), { ...p(3, 6, "b"), transition: dip }], 1, "c");
    expect(next).toEqual([
      p(0, 2, "a"),
      { ...p(3, 6, "b"), transition: dip },
      p(3, 6, "c"),
    ]);
  });
});

describe("movePiece", () => {
  it("puts a piece somewhere else in the order, footage and way in with it", () => {
    const dip = { kind: "black" as const, duration: 0.5 };
    const pieces = [p(0, 2, "a"), { ...p(3, 6, "b"), transition: dip }];
    const next = movePiece(pieces, 1, 0);
    expect(next.map((x) => x.id)).toEqual(["b", "a"]);
    expect(next[0]).toEqual({ ...p(3, 6, "b"), transition: dip });
  });

  it("drops a piece where its middle passes the middle of another", () => {
    // [0,2] [2,3] [3,6]. The last one with its middle at 0.5 passes nothing's
    // middle, so it goes first.
    const pieces = [p(0, 2), p(2, 3), p(3, 6)];
    expect(dropIndex(pieces, 2, 0.5)).toBe(0);
    expect(dropIndex(pieces, 2, 1.5)).toBe(1);
    expect(dropIndex(pieces, 0, 5)).toBe(2);
  });
});

describe("joinPieces", () => {
  it("makes a split's two pieces one again", () => {
    expect(spans(joinPieces([p(0, 3, "a"), p(3, 6, "b")], 1)!)).toEqual([[0, 6]]);
  });

  it("refuses where the footage is not continuous", () => {
    expect(joinPieces([p(0, 2), p(3, 6)], 1)).toBeNull();
    expect(joinPieces([p(3, 6), p(0, 3)], 1)).toBeNull();
  });
});

describe("withTransition", () => {
  it("sets a piece's way in and takes it off again", () => {
    const dip = { kind: "white" as const, duration: 0.3 };
    const set = withTransition([p(0, 2), p(3, 6)], 1, dip);
    expect(set[1].transition).toEqual(dip);
    expect("transition" in withTransition(set, 1, undefined)[1]).toBe(false);
  });
});

describe("the timeline", () => {
  it("starts the first piece at zero and the rest end to end", () => {
    expect(startsOf([p(3, 6), p(0, 2)])).toEqual([0, 3]);
  });

  it("closes the gap a trimmed piece leaves, and the next piece keeps its footage", () => {
    // A ten second clip split at three, then the first piece cut back to one
    // second. The second piece starts at one second on the timeline and
    // still opens on the source's third second.
    const split = splitPiece([p(0, 10)], 0, 3, "b")!;
    const next = resizePiece(split, 0, "end", 1, 10);
    expect(spans(next)).toEqual([[0, 1], [3, 10]]);
    expect(startsOf(next)).toEqual([0, 1]);
    expect(sourceAt(segmentsOf(next), 1)).toEqual({ index: 1, time: 3 });
  });

  it("holds a dragged start's far end still with a preview", () => {
    // The second piece's start is being brought in by half a second. Until
    // the drag lets go, it and everything after it sit half a second along,
    // so its end stays where it was, at 2 + 3 = 5.
    const pieces = [p(0, 2), p(3.5, 6), p(6, 7)];
    const starts = startsOf(pieces, { index: 1, by: 0.5 });
    expect(starts).toEqual([0, 2.5, 5]);
    expect(starts[1] + (6 - 3.5)).toBe(5);
  });

  it("draws a stretch of the source wherever its footage plays", () => {
    const pieces = [p(0, 3), p(2, 5)];
    expect(occurrences(pieces, startsOf(pieces), 2, 4)).toEqual([
      { index: 0, from: 2, to: 3, start: 2, end: 3, head: true, tail: false },
      { index: 1, from: 3, to: 5, start: 2, end: 4, head: true, tail: true },
    ]);
    expect(occurrences(pieces, startsOf(pieces), 5.5, 6)).toEqual([]);
  });

  it("shows half as much again as the file, rounded up to a step", () => {
    expect(timelineExtent(8)).toBe(15);
    expect(timelineExtent(4)).toBe(10);
    expect(timelineExtent(100)).toBe(180);
    expect(timelineExtent(9999)).toBe(MAX_TIMELINE);
  });
});

describe("tidyPieces", () => {
  it("clamps, snaps and drops what no longer fits", () => {
    const tidy = tidyPieces(
      [
        { id: "a", start: -1, end: 2.01 },
        { id: "b", start: 1, end: 3 },
        { id: "c", start: 4, end: 4.1 },
        { id: "d", start: 5, end: 99, transition: { kind: "wipe", duration: 1 } },
      ],
      6,
      grid,
    );
    // Two pieces may show the same footage, so the overlap stays.
    expect(tidy).toEqual([
      { id: "a", start: 0, end: 2 },
      { id: "b", start: 1, end: 3 },
      { id: "d", start: 5, end: 6 },
    ]);
  });

  it("is null when nothing usable is left", () => {
    expect(tidyPieces([], 6, grid)).toBeNull();
    expect(tidyPieces("nope", 6, grid)).toBeNull();
  });
});

describe("fromLegacy", () => {
  it("reads an in and out point, cuts and splits as pieces", () => {
    const dip = { kind: "black", duration: 0.5 };
    const pieces = fromLegacy({
      trim: { start: 0.5, end: 6 },
      cuts: [{ start: 2, end: 3, transition: dip }],
      splits: [{ at: 4, transition: { kind: "zoom", duration: 0.3 } }, 5],
    });
    expect(spans(pieces)).toEqual([[0.5, 2], [3, 4], [4, 5], [5, 6]]);
    expect(pieces.map((x) => x.transition)).toEqual([
      undefined,
      dip,
      { kind: "zoom", duration: 0.3 },
      undefined,
    ]);
  });

  it("is one piece for a draft with nothing cut", () => {
    expect(spans(fromLegacy({ trim: { start: 0, end: 6 } }))).toEqual([[0, 6]]);
  });
});

/**
 * The export's own loop, on synthetic samples.
 *
 * The encode cannot run here: it needs WebCodecs. What can run is the
 * arithmetic it does per frame, which is the part that could be wrong. This
 * mirrors `renderClip`: one pass per piece in play order, each sample placed
 * at its segment's own output time, and decimation into frame slots.
 */
function encode(
  pieces: Piece[],
  options: { sourceFps: number; fps: number; speed: number; seconds?: number },
) {
  const { sourceFps, fps, speed, seconds = 6 } = options;
  const gap = 1 / fps;
  const segments = segmentsOf(pieces);

  const written: { at: number; span: number; from: number }[] = [];
  let lastSlot = -1;
  let carried = 0;

  for (const segment of segments) {
    for (let i = 0; i < Math.round(seconds * sourceFps); i++) {
      const timestamp = i / sourceFps;
      if (timestamp < segment.start || timestamp >= segment.end) continue;

      const at = (segment.at + (timestamp - segment.start)) / speed;
      const slot = Math.floor(at / gap + 1e-6);
      if (slot === lastSlot) {
        carried += 1 / sourceFps;
        continue;
      }
      written.push({ at, span: (1 / sourceFps + carried) / speed, from: timestamp });
      carried = 0;
      lastSlot = slot;
    }
  }
  return written;
}

describe("the export's frame timeline", () => {
  const cutBlue = [p(0, 2), p(3, 6)];

  it("runs for exactly the kept length", () => {
    const frames = encode(cutBlue, { sourceFps: 30, fps: 60, speed: 1 });
    const last = frames[frames.length - 1];
    expect(last.at + last.span).toBeCloseTo(5, 6);
  });

  it("writes no frame from footage no piece holds", () => {
    const frames = encode(cutBlue, { sourceFps: 30, fps: 60, speed: 1 });
    for (const frame of frames) {
      expect(frame.from >= 2 && frame.from < 3, `${frame.from}`).toBe(false);
    }
  });

  it("starts at zero and never goes backwards, in any order", () => {
    const frames = encode([p(3, 6), p(0, 2)], { sourceFps: 30, fps: 60, speed: 1 });
    expect(frames[0].at).toBeCloseTo(0, 6);
    expect(frames[0].from).toBe(3);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].at).toBeGreaterThan(frames[i - 1].at);
    }
  });

  it("tiles the output with no gap and no overlap", () => {
    // A dropped sample's time is carried onto the next kept one, so what
    // survives still covers the clip's real duration.
    const frames = encode(cutBlue, { sourceFps: 30, fps: 60, speed: 1 });
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].at).toBeCloseTo(
        frames[i - 1].at + frames[i - 1].span,
        6,
      );
    }
  });

  it("passes a source at or under the ceiling through untouched", () => {
    // 180 source frames over 6s, one second removed, so 150 out.
    expect(encode(cutBlue, { sourceFps: 30, fps: 30, speed: 1 })).toHaveLength(150);
  });

  it("halves the frames at half the ceiling", () => {
    const frames = encode(cutBlue, { sourceFps: 60, fps: 30, speed: 1 });
    expect(frames).toHaveLength(150);
    const last = frames[frames.length - 1];
    expect(last.at + last.span).toBeCloseTo(5, 6);
  });

  it("divides the whole timeline by the speed", () => {
    const frames = encode(cutBlue, { sourceFps: 30, fps: 60, speed: 2 });
    const last = frames[frames.length - 1];
    expect(last.at + last.span).toBeCloseTo(2.5, 6);
  });

  it("is the whole file with one whole piece", () => {
    const plain = encode([p(0, 6)], { sourceFps: 30, fps: 30, speed: 1 });
    expect(plain).toHaveLength(180);
    const last = plain[plain.length - 1];
    expect(last.at + last.span).toBeCloseTo(6, 6);
  });
});
