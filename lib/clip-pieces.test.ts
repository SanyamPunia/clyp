import { describe, expect, it } from "vitest";

import { keptSeconds } from "@/lib/clip-cuts";
import {
  MIN_PIECE,
  joinsBetween,
  movePiece,
  pieceAt,
  pieces,
  removePiece,
  resizePiece,
  roomToMove,
  splitAt,
  tidySplits,
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
    const next = removePiece(trim, [], { start: 2, end: 4 }, "p");
    expect(next).toEqual([{ id: "p", start: 2, end: 4 }]);
    expect(keptSeconds(trim, next!)).toBe(4);
  });

  it("merges with a cut it touches", () => {
    const next = removePiece(trim, [{ id: "c", start: 1, end: 2 }], { start: 2, end: 3 }, "p");
    expect(next).toEqual([{ id: "c", start: 1, end: 3 }]);
  });

  it("drops the splits at its own edges", () => {
    const cuts = removePiece(trim, [], { start: 2, end: 4 }, "p")!;
    expect(tidySplits(trim, cuts, [{ at: 2 }, { at: 4 }])).toEqual([]);
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

describe("movePiece", () => {
  let n = 0;
  const id = () => `new-${++n}`;
  const cuts = [{ id: "gap", start: 2, end: 3, transition: { kind: "black" as const, duration: 0.5 } }];

  it("slides a piece into the removed stretch beside it", () => {
    // Pieces [0,2] and [3,6]. The second moves back half a second.
    const next = movePiece(trim, cuts, [], { start: 3, end: 6 }, -0.5, 6, id);
    expect(next.trim).toEqual({ start: 0, end: 5.5 });
    expect(next.cuts).toEqual([
      { id: "gap", start: 2, end: 2.5, transition: { kind: "black", duration: 0.5 } },
    ]);
  });

  it("stops at the neighbour, and the gap becomes a split", () => {
    const next = movePiece(trim, cuts, [], { start: 3, end: 6 }, -5, 6, id);
    expect(next.cuts).toEqual([]);
    // The gap's transition stays on the join now that it is a split.
    expect(next.splits).toEqual([{ at: 2, transition: { kind: "black", duration: 0.5 } }]);
    expect(next.trim).toEqual({ start: 0, end: 5 });
  });

  it("keeps the piece's length", () => {
    const next = movePiece(trim, cuts, [], { start: 0, end: 2 }, 0.7, 6, id);
    const moved = pieces(next.trim, next.cuts, next.splits)[0];
    expect(moved.end - moved.start).toBeCloseTo(2, 10);
    expect(moved.start).toBeCloseTo(0.7, 10);
  });

  it("moves into what the trim took off, up to the file's own end", () => {
    const trimmed = { start: 1, end: 5 };
    const next = movePiece(trimmed, [], [{ at: 3 }], { start: 3, end: 5 }, 9, 6, id);
    expect(next.trim).toEqual({ start: 1, end: 6 });
    expect(next.cuts).toEqual([{ id: "new-1", start: 3, end: 4 }]);
  });

  it("cannot move a piece with a neighbour touching it on that side", () => {
    const next = movePiece(trim, [], [{ at: 3 }], { start: 0, end: 3 }, 1, 6, id);
    expect(next.trim).toEqual(trim);
    expect(next.splits).toEqual([{ at: 3 }]);
  });

  it("carries a split's transition onto the gap a move opens", () => {
    const dip = { kind: "white" as const, duration: 0.3 };
    const next = movePiece(trim, [], [{ at: 3, transition: dip }], { start: 3, end: 6 }, 0, 6, id);
    expect(next.splits).toEqual([{ at: 3, transition: dip }]);
    const trimmed = { start: 0, end: 5 };
    const opened = movePiece(trimmed, [], [{ at: 3, transition: dip }], { start: 3, end: 5 }, 1, 6, id);
    expect(opened.cuts).toEqual([{ id: expect.any(String), start: 3, end: 4, transition: dip }]);
  });

  it("reports the room each way", () => {
    const list = pieces(trim, cuts, []);
    expect(roomToMove(list, 0, 6)).toEqual({ back: 0, forward: 1 });
    expect(roomToMove(list, 1, 6)).toEqual({ back: 1, forward: 0 });
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
