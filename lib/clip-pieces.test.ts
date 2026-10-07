import { describe, expect, it } from "vitest";

import { keptSeconds, keptSegments } from "@/lib/clip-cuts";
import {
  MIN_PIECE,
  fromLane,
  joinsBetween,
  pieceAt,
  pieces,
  removePiece,
  resizePiece,
  splitAt,
  tidySplits,
  toLane,
} from "@/lib/clip-pieces";

const trim = { start: 0, end: 6 };

describe("pieces", () => {
  it("is the whole kept clip with no splits", () => {
    expect(pieces(trim, [], [])).toEqual([{ start: 0, end: 6 }]);
  });

  it("divides at each split", () => {
    expect(pieces(trim, [], [{ at: 2 }, { at: 4 }])).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 6 },
    ]);
  });

  it("keeps a cut as a gap between pieces", () => {
    expect(pieces(trim, [{ id: "c", start: 2, end: 3 }], [{ at: 4 }])).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 4 },
      { start: 4, end: 6 },
    ]);
  });
});

describe("tidySplits", () => {
  it("drops a split inside a cut or outside the trim", () => {
    expect(tidySplits(trim, [{ id: "c", start: 2, end: 3 }], [{ at: 2.5 }, { at: 7 }, { at: -1 }])).toEqual([]);
  });

  it("drops a split too close to an edge or to the one before", () => {
    expect(tidySplits(trim, [], [{ at: 0.1 }, { at: 3 }, { at: 3.1 }, { at: 5.95 }])).toEqual([{ at: 3 }]);
  });

  it("sorts what it keeps", () => {
    expect(tidySplits(trim, [], [{ at: 4 }, { at: 2 }])).toEqual([{ at: 2 }, { at: 4 }]);
  });
});

describe("splitAt", () => {
  it("adds a split at the playhead", () => {
    expect(splitAt(trim, [], [], 3)).toEqual([{ at: 3 }]);
    expect(splitAt(trim, [], [{ at: 3 }], 1.5)).toEqual([{ at: 1.5 }, { at: 3 }]);
  });

  it("refuses one that would leave a piece under the minimum", () => {
    expect(splitAt(trim, [], [], MIN_PIECE / 2)).toBeNull();
    expect(splitAt(trim, [], [{ at: 3 }], 3 + MIN_PIECE / 2)).toBeNull();
  });

  it("refuses one inside a cut, where there is no frame", () => {
    expect(splitAt(trim, [{ id: "c", start: 2, end: 3 }], [], 2.5)).toBeNull();
  });
});

describe("pieceAt", () => {
  const list = pieces(trim, [], [{ at: 2 }, { at: 4 }]);

  it("finds the piece under a time", () => {
    expect(pieceAt(list, 3)).toEqual({ start: 2, end: 4 });
    expect(pieceAt(list, 2)).toEqual({ start: 2, end: 4 });
  });

  it("counts the clip's very end as the last piece", () => {
    expect(pieceAt(list, 6)).toEqual({ start: 4, end: 6 });
  });
});

describe("removePiece", () => {
  it("turns the piece into a cut, and the clip is that much shorter", () => {
    const next = removePiece(trim, [], { start: 2, end: 4 }, "p")!;
    expect(next).toEqual({ trim, cuts: [{ id: "p", start: 2, end: 4 }] });
    expect(keptSeconds(next.trim, next.cuts)).toBe(4);
  });

  it("merges with a cut it touches", () => {
    const next = removePiece(trim, [{ id: "c", start: 1, end: 2 }], { start: 2, end: 3 }, "p");
    expect(next?.cuts).toEqual([{ id: "c", start: 1, end: 3 }]);
  });

  it("drops the splits at its own edges", () => {
    const next = removePiece(trim, [], { start: 2, end: 4 }, "p")!;
    expect(tidySplits(next.trim, next.cuts, [{ at: 2 }, { at: 4 }])).toEqual([]);
  });

  it("moves the in or out point rather than leaving a cut against it", () => {
    expect(removePiece(trim, [], { start: 0, end: 2 }, "p")).toEqual({
      trim: { start: 2, end: 6 },
      cuts: [],
    });
    expect(removePiece(trim, [], { start: 4, end: 6 }, "p")).toEqual({
      trim: { start: 0, end: 4 },
      cuts: [],
    });
  });

  it("refuses to take the last of the clip", () => {
    expect(removePiece(trim, [], { start: 0, end: 6 }, "p")).toBeNull();
  });
});

describe("joinsBetween", () => {
  it("lists every join, a cut's and a split's, with its transition", () => {
    const dip = { kind: "black" as const, duration: 0.5 };
    const joins = joinsBetween(
      trim,
      [{ id: "c", start: 2, end: 3 }],
      [{ at: 4, transition: dip }],
    );
    expect(joins).toEqual([
      { index: 1, at: 3, transition: undefined },
      { index: 2, at: 4, transition: dip },
    ]);
  });
});

describe("resizePiece", () => {
  const id = () => "new";

  it("shortens a piece from its end and leaves a gap", () => {
    const next = resizePiece(trim, [], [{ at: 3 }], { start: 0, end: 3 }, "end", 2, 6, id);
    expect(next.cuts).toEqual([{ id: "new", start: 2, end: 3 }]);
    expect(next.piece).toEqual({ start: 0, end: 2 });
  });

  it("lengthens a piece into the room beside it and stops at the neighbour", () => {
    const cuts = [{ id: "gap", start: 2, end: 3 }];
    const next = resizePiece(trim, cuts, [], { start: 0, end: 2 }, "end", 9, 6, id);
    expect(next.piece).toEqual({ start: 0, end: 3 });
    expect(next.cuts).toEqual([]);
    expect(next.splits).toEqual([{ at: 3 }]);
  });

  it("moves the trim when the first piece's start moves", () => {
    const trimmed = { start: 1, end: 6 };
    const next = resizePiece(trimmed, [], [{ at: 3 }], { start: 1, end: 3 }, "start", 0, 6, id);
    expect(next.trim).toEqual({ start: 0, end: 6 });
  });

  it("never goes under the shortest piece", () => {
    const next = resizePiece(trim, [], [{ at: 3 }], { start: 0, end: 3 }, "end", 0, 6, id);
    expect(next.piece.end - next.piece.start).toBeCloseTo(MIN_PIECE, 10);
  });

  it("keeps a join's transition when a resize opens a gap there", () => {
    const dip = { kind: "black" as const, duration: 0.5 };
    const next = resizePiece(trim, [], [{ at: 3, transition: dip }], { start: 3, end: 6 }, "start", 4, 6, id);
    expect(next.cuts).toEqual([{ id: "new", start: 3, end: 4, transition: dip }]);
  });
});

describe("the lane", () => {
  const id = () => "new";

  it("is the source itself with nothing cut", () => {
    const segments = keptSegments(trim, []);
    expect(toLane(segments, 2.5)).toBe(2.5);
    expect(fromLane(segments, 2.5)).toBe(2.5);
  });

  it("closes the gap a trimmed piece leaves, and the next piece keeps its footage", () => {
    // A ten second clip split at three, then the first piece cut back to one
    // second. The second piece sits right after it on the lane and still
    // opens on the source's third second, not on what used to be beside it.
    const clip = { start: 0, end: 10 };
    const next = resizePiece(clip, [], [{ at: 3 }], { start: 0, end: 3 }, "end", 1, 10, id);
    const segments = keptSegments(next.trim, next.cuts);
    const [first, second] = pieces(next.trim, next.cuts, next.splits);

    expect(first).toEqual({ start: 0, end: 1 });
    expect(second).toEqual({ start: 3, end: 10 });
    expect(toLane(segments, second.start)).toBe(1);
    expect(fromLane(segments, 1)).toBe(3);
    expect(toLane(segments, second.end)).toBe(8);
  });

  it("keeps the footage the in point took off on the left, at its own place", () => {
    const segments = keptSegments({ start: 2, end: 6 }, [{ id: "c", start: 3, end: 4 }]);
    expect(toLane(segments, 1)).toBe(1);
    expect(toLane(segments, 2)).toBe(2);
    expect(toLane(segments, 4)).toBe(3);
    expect(fromLane(segments, 1.5)).toBe(1.5);
  });

  it("puts the footage the out point took off right after the last piece", () => {
    const segments = keptSegments({ start: 0, end: 6 }, [{ id: "c", start: 2, end: 3 }]);
    expect(toLane(segments, 6)).toBe(5);
    expect(toLane(segments, 8)).toBe(7);
    expect(fromLane(segments, 7)).toBe(8);
  });

  it("lands a time inside a cut on the join", () => {
    const segments = keptSegments(trim, [{ id: "c", start: 2, end: 3 }]);
    expect(toLane(segments, 2.5)).toBe(2);
    expect(fromLane(segments, 2)).toBe(3);
  });

  it("round-trips every kept time", () => {
    const segments = keptSegments({ start: 1, end: 9 }, [
      { id: "a", start: 2, end: 2.5 },
      { id: "b", start: 4, end: 5 },
    ]);
    for (const time of [0, 0.5, 1, 1.7, 2.6, 3.9, 5, 6.2, 8.9, 9.5]) {
      expect(fromLane(segments, toLane(segments, time))).toBeCloseTo(time, 10);
    }
  });
});
