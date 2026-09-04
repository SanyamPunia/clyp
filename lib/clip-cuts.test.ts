import { describe, expect, it } from "vitest";

import {
  type Cut,
  DEFAULT_CUT_LENGTH,
  MIN_CUT,
  MIN_KEPT,
  afterCuts,
  cutAt,
  keptSeconds,
  keptSegments,
  leavesEnough,
  longestCut,
  nearestKept,
  outputAt,
  placeCut,
  roomForCut,
  tidyCuts,
  toOutput,
  toSource,
} from "@/lib/clip-cuts";

const cut = (start: number, end: number, id = `${start}-${end}`): Cut => ({
  id,
  start,
  end,
});
const trim = (start: number, end: number) => ({ start, end });

describe("tidyCuts", () => {
  it("sorts them", () => {
    const tidy = tidyCuts([cut(6, 7), cut(2, 3)], trim(0, 10));
    expect(tidy.map((c) => c.start)).toEqual([2, 6]);
  });

  it("merges what overlaps, keeping the first id", () => {
    const tidy = tidyCuts([cut(2, 5, "a"), cut(4, 7, "b")], trim(0, 10));
    expect(tidy).toHaveLength(1);
    expect(tidy[0]).toMatchObject({ id: "a", start: 2, end: 7 });
  });

  it("merges what merely touches, since the join is the same", () => {
    const tidy = tidyCuts([cut(2, 4), cut(4, 6)], trim(0, 10));
    expect(tidy).toHaveLength(1);
    expect(tidy[0]).toMatchObject({ start: 2, end: 6 });
  });

  it("swallows a cut inside another", () => {
    const tidy = tidyCuts([cut(2, 8, "a"), cut(4, 5, "b")], trim(0, 10));
    expect(tidy).toHaveLength(1);
    expect(tidy[0]).toMatchObject({ id: "a", start: 2, end: 8 });
  });

  it("clips to the trim and drops what falls outside it", () => {
    const tidy = tidyCuts([cut(0, 3), cut(8, 12), cut(20, 22)], trim(2, 10));
    expect(tidy).toEqual([
      expect.objectContaining({ start: 2, end: 3 }),
      expect.objectContaining({ start: 8, end: 10 }),
    ]);
  });

  it("drops one that collapses to nothing", () => {
    expect(tidyCuts([cut(5, 5)], trim(0, 10))).toEqual([]);
    expect(tidyCuts([cut(-2, 0)], trim(0, 10))).toEqual([]);
  });

  it("rights a cut written backwards", () => {
    expect(tidyCuts([cut(6, 3)], trim(0, 10))[0]).toMatchObject({
      start: 3,
      end: 6,
    });
  });
});

describe("keptSegments", () => {
  it("is the whole trim with no cuts", () => {
    expect(keptSegments(trim(2, 8), [])).toEqual([
      { start: 2, end: 8, at: 0 },
    ]);
  });

  it("splits at a cut and stacks the output clock", () => {
    // A 10s clip with 4s to 6s removed is 8s long, and what was at 6s in the
    // source is at 4s in the output.
    expect(keptSegments(trim(0, 10), [cut(4, 6)])).toEqual([
      { start: 0, end: 4, at: 0 },
      { start: 6, end: 10, at: 4 },
    ]);
  });

  it("handles several cuts", () => {
    expect(keptSegments(trim(0, 12), [cut(2, 3), cut(6, 8)])).toEqual([
      { start: 0, end: 2, at: 0 },
      { start: 3, end: 6, at: 2 },
      { start: 8, end: 12, at: 5 },
    ]);
  });

  it("leaves no segment where a cut meets the in or out point", () => {
    // Dragging a cut onto the in point behaves as trimming to it.
    expect(keptSegments(trim(0, 10), [cut(0, 3)])).toEqual([
      { start: 3, end: 10, at: 0 },
    ]);
    expect(keptSegments(trim(0, 10), [cut(7, 10)])).toEqual([
      { start: 0, end: 7, at: 0 },
    ]);
  });

  it("is empty when everything is cut", () => {
    expect(keptSegments(trim(0, 10), [cut(0, 10)])).toEqual([]);
  });

  it("always leaves the segments in order and touching on the output", () => {
    const cuts = [cut(1, 2), cut(4, 4.5), cut(7, 9)];
    const segments = keptSegments(trim(0.5, 11), cuts);
    let expected = 0;
    for (const segment of segments) {
      expect(segment.at).toBeCloseTo(expected, 10);
      expect(segment.end).toBeGreaterThan(segment.start);
      expected += segment.end - segment.start;
    }
  });
});

describe("keptSeconds", () => {
  it("is the trim's length with no cuts", () => {
    expect(keptSeconds(trim(2, 8), [])).toBeCloseTo(6, 10);
  });

  it("takes off every cut", () => {
    expect(keptSeconds(trim(0, 10), [cut(4, 6)])).toBeCloseTo(8, 10);
    expect(keptSeconds(trim(0, 12), [cut(2, 3), cut(6, 8)])).toBeCloseTo(9, 10);
  });

  it("counts overlapping cuts once", () => {
    expect(keptSeconds(trim(0, 10), [cut(2, 6), cut(4, 8)])).toBeCloseTo(4, 10);
  });

  it("ignores a cut outside the trim", () => {
    expect(keptSeconds(trim(4, 8), [cut(0, 2)])).toBeCloseTo(4, 10);
  });

  it("is zero when everything is cut", () => {
    expect(keptSeconds(trim(0, 10), [cut(0, 10)])).toBe(0);
  });
});

describe("cutAt", () => {
  it("finds the cut covering a time", () => {
    expect(cutAt([cut(4, 6)], 5)?.start).toBe(4);
    expect(cutAt([cut(4, 6)], 4)?.start).toBe(4);
  });

  it("treats the end as exclusive, so two touching cuts never both answer", () => {
    expect(cutAt([cut(4, 6)], 6)).toBeNull();
    expect(cutAt([cut(4, 6)], 3.999)).toBeNull();
  });
});

describe("toOutput", () => {
  it("is the offset from the in point with no cuts", () => {
    expect(toOutput(trim(2, 8), [], 2)).toBeCloseTo(0, 10);
    expect(toOutput(trim(2, 8), [], 5)).toBeCloseTo(3, 10);
    expect(toOutput(trim(2, 8), [], 8)).toBeCloseTo(6, 10);
  });

  it("closes the gap a cut leaves", () => {
    const cuts = [cut(4, 6)];
    expect(toOutput(trim(0, 10), cuts, 3)).toBeCloseTo(3, 10);
    expect(toOutput(trim(0, 10), cuts, 6)).toBeCloseTo(4, 10);
    expect(toOutput(trim(0, 10), cuts, 10)).toBeCloseTo(8, 10);
  });

  it("maps a time inside a cut to the join", () => {
    // There is no frame there, so it reads as the moment the cut removes.
    const cuts = [cut(4, 6)];
    expect(toOutput(trim(0, 10), cuts, 4)).toBeCloseTo(4, 10);
    expect(toOutput(trim(0, 10), cuts, 5)).toBeCloseTo(4, 10);
    expect(toOutput(trim(0, 10), cuts, 5.999)).toBeCloseTo(4, 10);
  });

  it("clamps outside the trim", () => {
    expect(toOutput(trim(2, 8), [], 0)).toBeCloseTo(0, 10);
    expect(toOutput(trim(2, 8), [], 99)).toBeCloseTo(6, 10);
  });

  it("never goes backwards", () => {
    const cuts = [cut(1, 2), cut(5, 7)];
    let previous = -1;
    for (let t = 0; t <= 10; t += 0.05) {
      const out = toOutput(trim(0, 10), cuts, t);
      expect(out).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = out;
    }
  });

  it("ends at the kept length", () => {
    const cuts = [cut(1, 2), cut(5, 7)];
    expect(toOutput(trim(0, 10), cuts, 10)).toBeCloseTo(
      keptSeconds(trim(0, 10), cuts),
      10,
    );
  });

  it("is zero everywhere when everything is cut", () => {
    expect(toOutput(trim(0, 10), [cut(0, 10)], 5)).toBe(0);
  });
});

describe("outputAt", () => {
  it("agrees with toOutput everywhere", () => {
    // Two entry points, one arithmetic: the encode loop takes the segments it
    // already has and must not diverge from what the readouts show.
    const t = trim(0.5, 11);
    const cuts = [cut(2, 3), cut(6, 8)];
    const segments = keptSegments(t, cuts);
    for (let time = -1; time <= 12; time += 0.05) {
      expect(outputAt(segments, time)).toBeCloseTo(toOutput(t, cuts, time), 10);
    }
  });

  it("is zero with no segments at all", () => {
    expect(outputAt([], 5)).toBe(0);
  });
});

describe("toSource", () => {
  it("round-trips every kept time", () => {
    const cuts = [cut(2, 3), cut(6, 8)];
    const t = trim(0, 12);
    for (let time = 0; time <= 12; time += 0.05) {
      if (cutAt(cuts, time)) continue;
      const out = toOutput(t, cuts, time);
      expect(toSource(t, cuts, out)).toBeCloseTo(time, 6);
    }
  });

  it("lands on the far side of a cut at the join", () => {
    const cuts = [cut(4, 6)];
    expect(toSource(trim(0, 10), cuts, 4)).toBeCloseTo(6, 10);
  });

  it("clamps past the end to the last kept frame", () => {
    const cuts = [cut(4, 6)];
    expect(toSource(trim(0, 10), cuts, 99)).toBeCloseTo(10, 10);
  });

  it("clamps before the start to the in point", () => {
    expect(toSource(trim(2, 8), [], -5)).toBeCloseTo(2, 10);
  });

  it("answers the in point when everything is cut", () => {
    expect(toSource(trim(2, 8), [cut(2, 8)], 1)).toBe(2);
  });
});

describe("afterCuts", () => {
  it("leaves a kept time alone", () => {
    expect(afterCuts(trim(0, 10), [cut(4, 6)], 3)).toBe(3);
    expect(afterCuts(trim(0, 10), [cut(4, 6)], 6)).toBe(6);
  });

  it("steps over the cut a time is inside", () => {
    expect(afterCuts(trim(0, 10), [cut(4, 6)], 5)).toBeCloseTo(6, 10);
  });

  it("steps over merged neighbours in one go", () => {
    // Cuts are merged, so one step is always enough.
    expect(afterCuts(trim(0, 10), [cut(4, 6), cut(6, 8)], 5)).toBeCloseTo(8, 10);
  });

  it("stops at the out point when the cut reaches it", () => {
    expect(afterCuts(trim(0, 10), [cut(8, 20)], 9)).toBeCloseTo(10, 10);
  });
});

describe("nearestKept", () => {
  it("leaves a kept time alone", () => {
    expect(nearestKept(trim(0, 10), [cut(4, 6)], 3)).toBe(3);
    expect(nearestKept(trim(0, 10), [cut(4, 6)], 6)).toBe(6);
  });

  it("takes whichever edge of the cut is closer", () => {
    const cuts = [cut(4, 6)];
    expect(nearestKept(trim(0, 10), cuts, 4.4)).toBeCloseTo(4, 10);
    expect(nearestKept(trim(0, 10), cuts, 5.6)).toBeCloseTo(6, 10);
    // A tie goes back, so a scrub does not jump ahead of the pointer.
    expect(nearestKept(trim(0, 10), cuts, 5)).toBeCloseTo(4, 10);
  });

  it("has only one answer for a cut against an end", () => {
    expect(nearestKept(trim(0, 10), [cut(0, 3)], 0.1)).toBeCloseTo(3, 10);
    expect(nearestKept(trim(0, 10), [cut(7, 10)], 9.9)).toBeCloseTo(7, 10);
  });

  it("clamps to the trim", () => {
    expect(nearestKept(trim(2, 8), [], 0)).toBe(2);
    expect(nearestKept(trim(2, 8), [], 99)).toBe(8);
  });

  it("always lands on a kept segment, ends included", () => {
    // A cut's own start is the last kept instant as well as, by the half-open
    // rule `cutAt` uses, the first removed one. So the bound is the closed
    // kept set rather than `cutAt` answering null.
    const cuts = [cut(1, 2), cut(5, 7)];
    const t = trim(0.5, 9);
    const segments = keptSegments(t, cuts);
    for (let time = 0; time <= 10; time += 0.05) {
      const kept = nearestKept(t, cuts, time);
      expect(
        segments.some((s) => kept >= s.start - 1e-9 && kept <= s.end + 1e-9),
        `${time} -> ${kept}`,
      ).toBe(true);
    }
  });
});

describe("roomForCut", () => {
  it("is the whole trim with no cuts", () => {
    expect(roomForCut(trim(2, 8), [], 5)).toEqual({ lo: 2, hi: 8 });
  });

  it("stops at the neighbours either side", () => {
    const cuts = [cut(1, 2), cut(6, 7)];
    expect(roomForCut(trim(0, 10), cuts, 4)).toEqual({ lo: 2, hi: 6 });
  });

  it("is null for a time already inside a cut", () => {
    expect(roomForCut(trim(0, 10), [cut(4, 6)], 5)).toBeNull();
  });

  it("excludes a cut from its own bounds, which is what lets it be dragged", () => {
    const cuts = [cut(1, 2, "a"), cut(4, 5, "b"), cut(7, 8, "c")];
    expect(roomForCut(trim(0, 10), cuts, 4.5, "b")).toEqual({ lo: 2, hi: 7 });
  });
});

describe("placeCut", () => {
  it("runs the default length forward from the press", () => {
    expect(placeCut(trim(0, 10), [], 3)).toEqual({
      start: 3,
      end: 3 + DEFAULT_CUT_LENGTH,
    });
  });

  it("takes what is left when the out point is closer", () => {
    expect(placeCut(trim(0, 10), [], 9.5)).toEqual({ start: 9.5, end: 10 });
  });

  it("pulls back to fit only when less than the shortest is left forward", () => {
    const placed = placeCut(trim(0, 10), [], 9.9)!;
    expect(placed.end).toBe(10);
    expect(placed.end - placed.start).toBeCloseTo(MIN_CUT, 10);
  });

  it("stops at a neighbour rather than crossing it", () => {
    expect(placeCut(trim(0, 10), [cut(4, 6)], 3.5)).toEqual({
      start: 3.5,
      end: 4,
    });
  });

  it("is null inside an existing cut", () => {
    expect(placeCut(trim(0, 10), [cut(4, 6)], 5)).toBeNull();
  });

  it("is null in a gap too small", () => {
    const cuts = [cut(0, 5), cut(5.1, 10)];
    expect(placeCut(trim(0, 10), cuts, 5.05)).toBeNull();
  });

  it("shortens rather than refuses, so a short clip can still be cut", () => {
    // A cut can always be made smaller, unlike a zoom, which either fits or
    // does not. A 1s clip keeps its last MIN_KEPT and loses the rest.
    expect(placeCut(trim(0, 1), [], 0)).toEqual({ start: 0, end: 0.8 });
    expect(keptSeconds(trim(0, 1), [cut(0, 0.8)])).toBeCloseTo(MIN_KEPT, 10);
  });

  it("refuses when less than the shortest cut could be removed", () => {
    expect(placeCut(trim(0, 0.3), [], 0)).toBeNull();
    // And when earlier cuts have already taken the clip down to the minimum.
    expect(placeCut(trim(0, 10), [cut(0, 9.8)], 9.9)).toBeNull();
  });

  it("never leaves less picture than the minimum, wherever it is pressed", () => {
    for (const end of [0.5, 1, 1.4, 3, 10]) {
      for (let t = 0; t < end; t += 0.05) {
        const placed = placeCut(trim(0, end), [], t);
        if (!placed) continue;
        expect(
          keptSeconds(trim(0, end), [{ id: "x", ...placed }]),
        ).toBeGreaterThanOrEqual(MIN_KEPT - 1e-9);
      }
    }
  });

  it("never proposes anything outside the trim or shorter than the minimum", () => {
    for (let t = 2; t < 8; t += 0.1) {
      const placed = placeCut(trim(2, 8), [cut(4, 4.5)], t);
      if (!placed) continue;
      expect(placed.end - placed.start).toBeGreaterThanOrEqual(MIN_CUT - 1e-9);
      expect(placed.start).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(placed.end).toBeLessThanOrEqual(8 + 1e-9);
      expect(keptSeconds(trim(2, 8), [cut(4, 4.5), { id: "x", ...placed }]))
        .toBeGreaterThanOrEqual(MIN_KEPT - 1e-9);
    }
  });
});

/**
 * The export's own loop, on synthetic samples.
 *
 * The encode cannot run here: it needs WebCodecs. What can run is the
 * arithmetic it does per frame, which is the part that could be wrong. This
 * mirrors `renderVideo`: one pass per kept segment, `outputAt` for the
 * timestamp, and decimation into frame slots.
 */
function encode(
  t: { start: number; end: number },
  cuts: Cut[],
  options: { sourceFps: number; fps: number; speed: number },
) {
  const { sourceFps, fps, speed } = options;
  const gap = 1 / fps;
  const segments = keptSegments(t, cuts);

  const written: { at: number; span: number; from: number }[] = [];
  let lastSlot = -1;
  let carried = 0;

  for (const segment of segments) {
    // Every source frame whose timestamp falls in the segment, which is what
    // `sink.samples(from, to)` yields.
    for (let i = 0; i < Math.round(t.end * sourceFps); i++) {
      const timestamp = i / sourceFps;
      if (timestamp < segment.start || timestamp >= segment.end) continue;

      const at = outputAt(segments, timestamp) / speed;
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
  const t = trim(0, 6);
  const cuts = [cut(2, 3)];

  it("runs for exactly the kept length", () => {
    const frames = encode(t, cuts, { sourceFps: 30, fps: 60, speed: 1 });
    const last = frames[frames.length - 1];
    expect(last.at + last.span).toBeCloseTo(keptSeconds(t, cuts), 6);
  });

  it("writes no frame from inside a cut", () => {
    const frames = encode(t, cuts, { sourceFps: 30, fps: 60, speed: 1 });
    expect(frames).not.toHaveLength(0);
    for (const frame of frames) {
      expect(cutAt(cuts, frame.from), `${frame.from}`).toBeNull();
    }
  });

  it("starts at zero and never goes backwards", () => {
    const frames = encode(t, cuts, { sourceFps: 30, fps: 60, speed: 1 });
    expect(frames[0].at).toBeCloseTo(0, 6);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].at).toBeGreaterThan(frames[i - 1].at);
    }
  });

  it("tiles the output with no gap and no overlap", () => {
    // A dropped sample's time is carried onto the next kept one, so what
    // survives still covers the clip's real duration.
    const frames = encode(t, cuts, { sourceFps: 30, fps: 60, speed: 1 });
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].at).toBeCloseTo(
        frames[i - 1].at + frames[i - 1].span,
        6,
      );
    }
  });

  it("passes a source at or under the ceiling through untouched", () => {
    // 180 source frames over 6s, one second cut, so 150 out.
    const frames = encode(t, cuts, { sourceFps: 30, fps: 30, speed: 1 });
    expect(frames).toHaveLength(150);
  });

  it("halves the frames at half the ceiling", () => {
    const frames = encode(t, cuts, { sourceFps: 60, fps: 30, speed: 1 });
    expect(frames).toHaveLength(150);
    const last = frames[frames.length - 1];
    expect(last.at + last.span).toBeCloseTo(5, 6);
  });

  it("divides the whole timeline by the speed", () => {
    const frames = encode(t, cuts, { sourceFps: 30, fps: 60, speed: 2 });
    const last = frames[frames.length - 1];
    expect(last.at + last.span).toBeCloseTo(keptSeconds(t, cuts) / 2, 6);
  });

  it("holds for several cuts and an offset trim", () => {
    const many = [cut(2, 2.5), cut(4, 5), cut(7, 7.4)];
    const range = trim(1, 9);
    const frames = encode(range, many, { sourceFps: 30, fps: 60, speed: 1 });
    const last = frames[frames.length - 1];
    expect(last.at + last.span).toBeCloseTo(keptSeconds(range, many), 6);
    for (const frame of frames) {
      expect(cutAt(many, frame.from)).toBeNull();
      expect(frame.from).toBeGreaterThanOrEqual(1);
      expect(frame.from).toBeLessThan(9);
    }
  });

  it("is the same as before cuts existed when there are none", () => {
    const plain = encode(t, [], { sourceFps: 30, fps: 30, speed: 1 });
    expect(plain).toHaveLength(180);
    expect(plain[0].at).toBeCloseTo(0, 6);
    const last = plain[plain.length - 1];
    expect(last.at + last.span).toBeCloseTo(6, 6);
  });
});

describe("leavesEnough", () => {
  it("is true for a clip with no cuts", () => {
    expect(leavesEnough(trim(0, 10), [])).toBe(true);
  });

  it("is false when the cuts take everything", () => {
    // One cut's two edges, pulled to the in and out points. placeCut will not
    // propose this, but a drag can reach it.
    expect(leavesEnough(trim(0, 10), [cut(0, 10)])).toBe(false);
  });

  it("is false when what is left is under the minimum", () => {
    expect(leavesEnough(trim(0, 10), [cut(0, 9.9)])).toBe(false);
    expect(leavesEnough(trim(0, 10), [cut(0, 4), cut(4.1, 10)])).toBe(false);
  });

  it("is true at exactly the minimum", () => {
    expect(leavesEnough(trim(0, 10), [cut(0, 10 - MIN_KEPT)])).toBe(true);
  });

  it("holds for a trim brought in over a cut", () => {
    // Trimming can leave less picture than the cut itself is allowed to.
    const cuts = [cut(0, 5)];
    expect(leavesEnough(trim(0, 10), cuts)).toBe(true);
    expect(leavesEnough(trim(0, 5.1), cuts)).toBe(false);
  });
});

describe("longestCut", () => {
  it("is the clip less the minimum, for the only cut", () => {
    expect(longestCut(trim(0, 10), [cut(2, 3, "a")], "a")).toBeCloseTo(
      10 - MIN_KEPT,
      10,
    );
  });

  it("counts what the other cuts already take", () => {
    const cuts = [cut(0, 4, "a"), cut(6, 7, "b")];
    // Without "b" the clip keeps 6s, so "b" may be 6 - MIN_KEPT.
    expect(longestCut(trim(0, 10), cuts, "b")).toBeCloseTo(6 - MIN_KEPT, 10);
  });

  it("is zero rather than negative when nothing may be removed", () => {
    expect(longestCut(trim(0, 0.1), [], "a")).toBe(0);
  });

  it("is exactly the length that leaves the minimum", () => {
    const t = trim(0, 10);
    const longest = longestCut(t, [], "a");
    expect(leavesEnough(t, [cut(0, longest, "a")])).toBe(true);
    expect(leavesEnough(t, [cut(0, longest + 0.01, "a")])).toBe(false);
  });
});
