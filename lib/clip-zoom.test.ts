import { describe, expect, it } from "vitest";

import {
  DEFAULT_ZOOM_LENGTH,
  MIN_ZOOM_LENGTH,
  ZOOM_RAMP,
  type ZoomRegion,
  centredOn,
  placeZoom,
  roomAt,
  roomFor,
  sourceRect,
  suggestZooms,
  zoomAt,
} from "@/lib/clip-zoom";
import type { MotionTrack } from "@/lib/motion";

const region = (over: Partial<ZoomRegion> = {}): ZoomRegion => ({
  id: over.id ?? "a",
  start: 0,
  end: 4,
  scale: 2,
  focus: { x: 0.5, y: 0.5 },
  ...over,
});

/** A track from triples of time, x and y. */
function track(samples: number[], clicks: number[] = []): MotionTrack {
  return {
    samples: new Float32Array(samples),
    clicks: new Float32Array(clicks),
  };
}

describe("zoomAt", () => {
  it("is null where no region covers the time", () => {
    const regions = [region({ start: 2, end: 4 })];
    expect(zoomAt(regions, 0)).toBeNull();
    expect(zoomAt(regions, 1.99)).toBeNull();
    expect(zoomAt(regions, 10)).toBeNull();
    expect(zoomAt([], 1)).toBeNull();
  });

  it("covers its start and stops one instant short of its end", () => {
    const regions = [region({ start: 2, end: 4 })];
    expect(zoomAt(regions, 2)).not.toBeNull();
    expect(zoomAt(regions, 3.999)).not.toBeNull();
    // The end is exclusive, so two touching regions never both answer.
    expect(zoomAt(regions, 4)).toBeNull();
  });

  it("starts at 1 and reaches the region's scale after the ramp", () => {
    const regions = [region({ start: 0, end: 4, scale: 2 })];
    expect(zoomAt(regions, 0)!.scale).toBeCloseTo(1, 10);
    expect(zoomAt(regions, ZOOM_RAMP)!.scale).toBeCloseTo(2, 10);
    expect(zoomAt(regions, 2)!.scale).toBeCloseTo(2, 10);
    expect(zoomAt(regions, 4 - ZOOM_RAMP)!.scale).toBeCloseTo(2, 10);
  });

  it("opens back out at the end, symmetrically", () => {
    const regions = [region({ start: 0, end: 4, scale: 3 })];
    // Offsets from either end, not zero: the end is exclusive.
    for (const offset of [0.05, 0.1, 0.25, 0.4]) {
      expect(zoomAt(regions, offset)!.scale).toBeCloseTo(
        zoomAt(regions, 4 - offset)!.scale,
        10,
      );
    }
  });

  it("eases rather than stepping", () => {
    const regions = [region({ start: 0, end: 4, scale: 2 })];
    const scales = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map(
      (t) => zoomAt(regions, t)!.scale,
    );
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeGreaterThan(scales[i - 1]);
    }
    // Cubic in: a quarter of the way through the ramp is well under a quarter
    // of the way in.
    expect(zoomAt(regions, ZOOM_RAMP / 4)!.scale).toBeLessThan(1.15);
  });

  it("caps the ramp at half the region, so a short one never overshoots", () => {
    // 0.6s of region against a 0.5s ramp: the ramp becomes 0.3s and full
    // scale is reached exactly at the midpoint and nowhere else.
    const regions = [region({ start: 0, end: 0.6, scale: 3 })];
    expect(zoomAt(regions, 0.3)!.scale).toBeCloseTo(3, 10);
    expect(zoomAt(regions, 0.2)!.scale).toBeLessThan(3);
    expect(zoomAt(regions, 0.4)!.scale).toBeLessThan(3);
    // And it never exceeds the level it was asked for.
    for (let t = 0; t < 0.6; t += 0.01) {
      expect(zoomAt(regions, t)!.scale).toBeLessThanOrEqual(3 + 1e-9);
    }
  });

  it("lengthens the ramp with speed, so it holds in output seconds", () => {
    const regions = [region({ start: 0, end: 20, scale: 2 })];
    // Half a second of output at 2x is a second of source.
    expect(zoomAt(regions, 1, 2)!.scale).toBeCloseTo(2, 10);
    expect(zoomAt(regions, 0.5, 2)!.scale).toBeLessThan(
      zoomAt(regions, 0.5, 1)!.scale,
    );
  });

  it("holds the region's aim when it is not following", () => {
    const focus = { x: 0.25, y: 0.75 };
    const regions = [region({ focus })];
    expect(zoomAt(regions, 2)!.focus).toEqual(focus);
    // A track handed in changes nothing without the flag.
    const t = track([0, 0.9, 0.9, 4, 0.9, 0.9]);
    expect(zoomAt(regions, 2, 1, t)!.focus).toEqual(focus);
  });

  it("centres the window on the action when it is following", () => {
    const regions = [region({ follow: true, focus: { x: 0.1, y: 0.1 } })];
    const still = track([0, 0.75, 0.25, 4, 0.75, 0.25]);
    const state = zoomAt(regions, 2, 1, still)!;
    // The window centres the action, so the aim is the action pulled in by
    // half a window and rescaled, not the action itself.
    expect(state.focus).toEqual(centredOn({ x: 0.75, y: 0.25 }, state.scale));
    expect(state.focus).not.toEqual({ x: 0.1, y: 0.1 });
  });

  it("falls back to the region's aim where the track says nothing", () => {
    const focus = { x: 0.2, y: 0.8 };
    const regions = [region({ follow: true, focus })];
    // NaN is the track before any motion, so there is nothing to follow.
    const blank = track([0, NaN, NaN, 4, NaN, NaN]);
    expect(zoomAt(regions, 2, 1, blank)!.focus).toEqual(focus);
    // And with no track at all.
    expect(zoomAt(regions, 2, 1, null)!.focus).toEqual(focus);
  });
});

describe("centredOn", () => {
  it("puts the point at the centre of the window it produces", () => {
    for (const scale of [1.5, 2, 3]) {
      for (const point of [
        { x: 0.5, y: 0.5 },
        { x: 0.4, y: 0.6 },
        { x: 0.35, y: 0.65 },
      ]) {
        const rect = sourceRect({ scale, focus: centredOn(point, scale) }, 640, 360);
        expect((rect.x + rect.width / 2) / 640).toBeCloseTo(point.x, 6);
        expect((rect.y + rect.height / 2) / 360).toBeCloseTo(point.y, 6);
      }
    }
  });

  it("holds the window against the edge rather than leaving the picture", () => {
    const scale = 2;
    const topLeft = sourceRect({ scale, focus: centredOn({ x: 0, y: 0 }, scale) }, 640, 360);
    expect(topLeft.x).toBe(0);
    expect(topLeft.y).toBe(0);

    const bottomRight = sourceRect(
      { scale, focus: centredOn({ x: 1, y: 1 }, scale) },
      640,
      360,
    );
    expect(bottomRight.x + bottomRight.width).toBeCloseTo(640, 6);
    expect(bottomRight.y + bottomRight.height).toBeCloseTo(360, 6);
  });

  it("stays inside 0 to 1 wherever the point is", () => {
    for (const scale of [1.5, 2, 3]) {
      for (let v = -0.5; v <= 1.5; v += 0.1) {
        const focus = centredOn({ x: v, y: v }, scale);
        expect(focus.x).toBeGreaterThanOrEqual(0);
        expect(focus.x).toBeLessThanOrEqual(1);
        expect(focus.y).toBeGreaterThanOrEqual(0);
        expect(focus.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("returns the point untouched at a scale of 1, where there is no window", () => {
    // The span is zero, so there is no focus that centres anything.
    expect(centredOn({ x: 0.3, y: 0.7 }, 1)).toEqual({ x: 0.3, y: 0.7 });
  });

  it("is continuous in the scale, so nothing jumps during the ramp", () => {
    const point = { x: 0.05, y: 0.95 };
    let previous = centredOn(point, 1.001);
    for (let scale = 1.002; scale <= 2; scale += 0.001) {
      const next = centredOn(point, scale);
      expect(Math.abs(next.x - previous.x)).toBeLessThan(0.01);
      expect(Math.abs(next.y - previous.y)).toBeLessThan(0.01);
      previous = next;
    }
  });
});

describe("sourceRect", () => {
  it("is the whole picture at a scale of 1", () => {
    expect(sourceRect({ scale: 1, focus: { x: 0.5, y: 0.5 } }, 640, 360)).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 360,
    });
  });

  it("shrinks by the scale and never leaves the picture", () => {
    for (const scale of [1.5, 2, 3]) {
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const rect = sourceRect({ scale, focus: { x: f, y: f } }, 640, 360);
        expect(rect.width).toBeCloseTo(640 / scale, 6);
        expect(rect.height).toBeCloseTo(360 / scale, 6);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(640 + 1e-9);
        expect(rect.y + rect.height).toBeLessThanOrEqual(360 + 1e-9);
      }
    }
  });

  it("keeps the focus point where it was, which is what the CSS transform does", () => {
    // transform-origin at the focus: that point does not move as the picture
    // grows, so its fraction of the visible rect is its fraction of the whole.
    for (const scale of [1.5, 2, 3]) {
      for (const f of [0.2, 0.5, 0.8]) {
        const rect = sourceRect({ scale, focus: { x: f, y: f } }, 640, 360);
        expect((f * 640 - rect.x) / rect.width).toBeCloseTo(f, 6);
      }
    }
  });
});

describe("roomAt", () => {
  it("is null inside a region", () => {
    const regions = [region({ start: 2, end: 4 })];
    expect(roomAt(regions, 2, 10)).toBeNull();
    expect(roomAt(regions, 3.9, 10)).toBeNull();
  });

  it("is the whole clip with no regions", () => {
    expect(roomAt([], 5, 10)).toEqual({ lo: 0, hi: 10 });
  });

  it("stops at the neighbours either side", () => {
    const regions = [
      region({ id: "a", start: 1, end: 3 }),
      region({ id: "b", start: 6, end: 8 }),
    ];
    expect(roomAt(regions, 4, 10)).toEqual({ lo: 3, hi: 6 });
    expect(roomAt(regions, 0.5, 10)).toEqual({ lo: 0, hi: 1 });
    expect(roomAt(regions, 9, 10)).toEqual({ lo: 8, hi: 10 });
  });
});

describe("roomFor", () => {
  it("is the whole clip for an id that is not there", () => {
    expect(roomFor([], "missing", 10)).toEqual({ lo: 0, hi: 10 });
  });

  it("excludes the region itself and stops at its neighbours", () => {
    const regions = [
      region({ id: "a", start: 1, end: 2 }),
      region({ id: "b", start: 4, end: 5 }),
      region({ id: "c", start: 7, end: 8 }),
    ];
    expect(roomFor(regions, "b", 10)).toEqual({ lo: 2, hi: 7 });
    expect(roomFor(regions, "a", 10)).toEqual({ lo: 0, hi: 4 });
    expect(roomFor(regions, "c", 10)).toEqual({ lo: 5, hi: 10 });
  });
});

describe("placeZoom", () => {
  it("runs the default length forward from the press", () => {
    expect(placeZoom([], 3, 10)).toEqual({
      start: 3,
      end: 3 + DEFAULT_ZOOM_LENGTH,
    });
  });

  it("takes what is left when the end is closer than the default", () => {
    expect(placeZoom([], 9.5, 10)).toEqual({ start: 9.5, end: 10 });
  });

  it("pulls back to fit only when less than the shortest is left", () => {
    // A press means "from here" whenever that is possible.
    const tight = placeZoom([], 9.8, 10)!;
    expect(tight.end).toBe(10);
    expect(tight.end - tight.start).toBeCloseTo(MIN_ZOOM_LENGTH, 10);
  });

  it("stops at a neighbour rather than crossing it", () => {
    const regions = [region({ start: 4, end: 6 })];
    expect(placeZoom(regions, 3, 10)).toEqual({ start: 3, end: 4 });
  });

  it("is null inside an existing region", () => {
    expect(placeZoom([region({ start: 2, end: 5 })], 3, 10)).toBeNull();
  });

  it("is null in a gap too small for the shortest region", () => {
    const regions = [
      region({ id: "a", start: 0, end: 5 }),
      region({ id: "b", start: 5.2, end: 10 }),
    ];
    expect(placeZoom(regions, 5.1, 10)).toBeNull();
  });

  it("never proposes anything shorter than the shortest region", () => {
    for (let t = 0; t < 10; t += 0.1) {
      const placed = placeZoom([], t, 10);
      if (placed) {
        expect(placed.end - placed.start).toBeGreaterThanOrEqual(
          MIN_ZOOM_LENGTH - 1e-9,
        );
        expect(placed.start).toBeGreaterThanOrEqual(0);
        expect(placed.end).toBeLessThanOrEqual(10 + 1e-9);
      }
    }
  });
});

describe("suggestZooms", () => {
  it("proposes nothing from an empty track", () => {
    expect(suggestZooms(track([]), 10, [])).toEqual([]);
  });

  it("wraps a click, leading it and trailing it", () => {
    const suggestions = suggestZooms(track([], [2, 0.3, 0.4]), 10, []);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].start).toBeCloseTo(1.4, 6);
    expect(suggestions[0].end).toBeCloseTo(3.9, 6);
    expect(suggestions[0].focus.x).toBeCloseTo(0.3, 6);
    expect(suggestions[0].focus.y).toBeCloseTo(0.4, 6);
  });

  it("clamps a candidate to the clip", () => {
    const [suggestion] = suggestZooms(track([], [0.1, 0.5, 0.5]), 1.5, []);
    expect(suggestion.start).toBe(0);
    expect(suggestion.end).toBe(1.5);
  });

  it("merges clicks that nearly touch into one", () => {
    const suggestions = suggestZooms(
      track([], [2, 0.3, 0.4, 2.2, 0.35, 0.45]),
      10,
      [],
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].end).toBeCloseTo(4.1, 6);
  });

  it("proposes one for a stretch the action stayed put in", () => {
    const samples: number[] = [];
    for (let t = 0; t <= 3; t += 0.1) samples.push(t, 0.7, 0.65);
    const suggestions = suggestZooms(track(samples), 10, []);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].focus.x).toBeCloseTo(0.7, 4);
    expect(suggestions[0].end - suggestions[0].start).toBeGreaterThan(3);
  });

  it("proposes nothing for action that never settles", () => {
    // The square that never stops: every sample is well outside the radius of
    // the run it would join, so no run ever reaches the minimum.
    const samples: number[] = [];
    for (let i = 0; i <= 60; i++) samples.push(i * 0.1, i % 2 ? 0.2 : 0.8, 0.5);
    expect(suggestZooms(track(samples), 10, [])).toEqual([]);
  });

  it("drops anything over a region that is already there", () => {
    const clicks = [2, 0.3, 0.4, 8, 0.6, 0.6];
    const placed = [region({ start: 1, end: 4 })];
    const suggestions = suggestZooms(track([], clicks), 12, placed);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].start).toBeCloseTo(7.4, 6);
  });

  it("shows at most six, and in time order", () => {
    const clicks: number[] = [];
    for (let i = 0; i < 10; i++) clicks.push(2 + i * 5, 0.5, 0.5);
    const suggestions = suggestZooms(track([], clicks), 60, []);
    expect(suggestions).toHaveLength(6);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].start).toBeGreaterThan(suggestions[i - 1].start);
    }
  });

  it("never proposes one shorter than the shortest region, or overlapping", () => {
    const clicks: number[] = [];
    for (let i = 0; i < 8; i++) clicks.push(1 + i * 1.1, 0.5, 0.5);
    const suggestions = suggestZooms(track([], clicks), 12, []);
    for (let i = 0; i < suggestions.length; i++) {
      expect(suggestions[i].end - suggestions[i].start).toBeGreaterThanOrEqual(
        MIN_ZOOM_LENGTH - 1e-9,
      );
      if (i) expect(suggestions[i].start).toBeGreaterThanOrEqual(suggestions[i - 1].end - 1e-9);
    }
  });
});

describe("placeZoom with a length, which is what a paste needs", () => {
  it("keeps the copied length where there is room", () => {
    expect(placeZoom([], 3, 10, 3.5)).toEqual({ start: 3, end: 6.5 });
  });

  it("takes what is left when a neighbour is closer", () => {
    expect(placeZoom([region({ start: 5, end: 7 })], 3, 10, 3.5)).toEqual({
      start: 3,
      end: 5,
    });
  });

  it("still pulls back only to the shortest, never to the length", () => {
    const placed = placeZoom([], 9.9, 10, 4)!;
    expect(placed.end - placed.start).toBeCloseTo(MIN_ZOOM_LENGTH, 10);
  });

  it("defaults to the usual length when none is given", () => {
    expect(placeZoom([], 1, 10)).toEqual({
      start: 1,
      end: 1 + DEFAULT_ZOOM_LENGTH,
    });
  });
});
