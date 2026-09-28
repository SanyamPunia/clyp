import { describe, expect, it } from "vitest";

import {
  type Mark,
  arrowHead,
  blurRadius,
  isKeepable,
  moveMark,
  normalized,
  project,
  resizeMark,
  strokeWidth,
  tidyMarks,
} from "@/lib/marks";
import { sourceRect } from "@/lib/clip-zoom";

const rect = (over: Partial<Mark> = {}): Mark => ({
  id: "m",
  kind: "box",
  x: 0.2,
  y: 0.2,
  w: 0.3,
  h: 0.2,
  color: "red",
  ...over,
});

describe("normalized", () => {
  it("turns a rectangle drawn up and left into a positive one", () => {
    expect(normalized({ x: 0.5, y: 0.5, w: -0.2, h: -0.1 })).toEqual({
      x: 0.3,
      y: 0.4,
      w: 0.2,
      h: 0.1,
    });
  });
});

describe("isKeepable", () => {
  it("drops a press that barely moved", () => {
    expect(isKeepable(rect({ w: 0.005, h: 0.2 }))).toBe(false);
    expect(isKeepable(rect({ kind: "arrow", w: 0.004, h: 0.004 }))).toBe(false);
  });

  it("keeps text however small, since its content sizes it", () => {
    expect(isKeepable(rect({ kind: "text", w: 0, h: 0 }))).toBe(true);
  });
});

describe("moveMark", () => {
  it("stops a rectangle at the edge without squashing it", () => {
    const moved = moveMark(rect(), 1, 1);
    expect(moved.x + moved.w).toBeCloseTo(1, 10);
    expect(moved.y + moved.h).toBeCloseTo(1, 10);
    expect(moved.w).toBe(0.3);
  });

  it("keeps an arrow's length and angle", () => {
    const arrow = rect({ kind: "arrow", w: -0.1, h: 0.1 });
    const moved = moveMark(arrow, 0.1, 0);
    expect(moved.w).toBe(-0.1);
    expect(moved.h).toBe(0.1);
    expect(moved.x).toBeCloseTo(0.3, 10);
  });
});

describe("resizeMark", () => {
  it("holds the opposite corner", () => {
    const next = resizeMark(rect(), "se", { x: 0.9, y: 0.8 });
    expect(next.x).toBe(0.2);
    expect(next.y).toBe(0.2);
    expect(next.w).toBeCloseTo(0.7, 10);
    expect(next.h).toBeCloseTo(0.6, 10);
  });

  it("flips rather than going negative past the opposite corner", () => {
    const next = resizeMark(rect(), "se", { x: 0.1, y: 0.1 });
    expect(next.w).toBeGreaterThan(0);
    expect(next.h).toBeGreaterThan(0);
    expect(next.x).toBeCloseTo(0.1, 10);
  });

  it("moves an arrow's head and holds its tail", () => {
    const arrow = rect({ kind: "arrow" });
    const next = resizeMark(arrow, "head", { x: 0.9, y: 0.9 });
    expect(next.x).toBe(0.2);
    expect(next.x + next.w).toBeCloseTo(0.9, 10);
  });

  it("moves an arrow's tail and holds its head", () => {
    const arrow = rect({ kind: "arrow" });
    const next = resizeMark(arrow, "tail", { x: 0, y: 0 });
    expect(next.x + next.w).toBeCloseTo(0.5, 10);
    expect(next.y + next.h).toBeCloseTo(0.4, 10);
  });
});

describe("sizes", () => {
  it("scales with the picture and has a floor", () => {
    expect(strokeWidth(2560)).toBe(13);
    expect(strokeWidth(200)).toBe(3);
    expect(blurRadius(2560)).toBe(31);
    expect(blurRadius(300)).toBe(8);
  });
});

describe("arrowHead", () => {
  it("sits behind the point, either side of the shaft", () => {
    const [a, b] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(a.x).toBeLessThan(100);
    expect(b.x).toBeLessThan(100);
    expect(a.y).toBeCloseTo(-b.y, 10);
  });
});

describe("project", () => {
  const box = { x: 100, y: 50, width: 640, height: 360 };

  it("maps straight across the box with no zoom", () => {
    const { at, unit } = project(null, box);
    expect(at({ x: 0.5, y: 0.5 })).toEqual({ x: 420, y: 230 });
    expect(unit).toBe(640);
  });

  it("agrees with the zoom's own source rectangle", () => {
    // A point at the visible window's corners lands on the box's corners,
    // which is what the encode's crop does with the same zoom.
    const zoom = { scale: 2, focus: { x: 0.25, y: 0.75 } };
    const crop = sourceRect(zoom, 640, 360);
    const { at, unit } = project(zoom, box);
    const topLeft = at({ x: crop.x / 640, y: crop.y / 360 });
    const bottomRight = at({
      x: (crop.x + crop.width) / 640,
      y: (crop.y + crop.height) / 360,
    });
    expect(topLeft.x).toBeCloseTo(box.x, 8);
    expect(topLeft.y).toBeCloseTo(box.y, 8);
    expect(bottomRight.x).toBeCloseTo(box.x + box.width, 8);
    expect(bottomRight.y).toBeCloseTo(box.y + box.height, 8);
    expect(unit).toBe(1280);
  });
});

describe("tidyMarks", () => {
  it("keeps a well-formed mark", () => {
    expect(tidyMarks([rect()])).toEqual([rect()]);
  });

  it("drops what cannot be drawn", () => {
    expect(
      tidyMarks([
        null,
        { id: "a", kind: "laser", x: 0, y: 0, w: 0.2, h: 0.2 },
        { id: "b", kind: "box", x: NaN, y: 0, w: 0.2, h: 0.2 },
        { id: "c", kind: "box", x: 0, y: 0, w: 0.001, h: 0.2 },
      ]),
    ).toEqual([]);
  });

  it("clamps into the picture and fills a missing colour", () => {
    const [mark] = tidyMarks([{ id: "a", kind: "block", x: 2, y: -1, w: 0.2, h: 0.2 }]);
    expect(mark.x).toBe(1);
    expect(mark.y).toBe(0);
    expect(mark.color).toBe("red");
  });

  it("gives text a size the picker offers", () => {
    const [mark] = tidyMarks([
      { id: "t", kind: "text", x: 0.1, y: 0.1, w: 0, h: 0, text: "Hi", size: 0.33 },
    ]);
    expect(mark.size).toBe(0.04);
    expect(mark.text).toBe("Hi");
  });
});
