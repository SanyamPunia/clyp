import { describe, expect, it } from "vitest";

import {
  CURVE_PRESETS,
  type Curve,
  type FadeRegion,
  DEFAULT_FADE_LENGTH,
  MIN_FADE,
  bendCurve,
  curveName,
  ease,
  opacityAt,
  placeFade,
  roomAt,
  roomFor,
} from "@/lib/clip-fade";

const LINEAR: Curve = [0, 0, 1, 1];

const fade = (
  start: number,
  end: number,
  kind: "in" | "out" = "in",
  curve: Curve = LINEAR,
  id = `${start}-${end}`,
): FadeRegion => ({ id, start, end, kind, curve });

describe("ease", () => {
  it("pins both ends whatever the curve", () => {
    for (const preset of CURVE_PRESETS) {
      expect(ease(preset.curve, 0), preset.value).toBe(0);
      expect(ease(preset.curve, 1), preset.value).toBe(1);
    }
  });

  it("clamps outside the unit range", () => {
    expect(ease(LINEAR, -1)).toBe(0);
    expect(ease(LINEAR, 2)).toBe(1);
  });

  it("is the identity for a linear curve", () => {
    for (let x = 0; x <= 1; x += 0.05) {
      expect(ease(LINEAR, x)).toBeCloseTo(x, 5);
    }
  });

  it("rises without ever going backwards", () => {
    for (const preset of CURVE_PRESETS) {
      let previous = -1;
      for (let x = 0; x <= 1; x += 0.02) {
        const y = ease(preset.curve, x);
        expect(y, `${preset.value} at ${x}`).toBeGreaterThanOrEqual(previous);
        previous = y;
      }
    }
  });

  it("starts slower than linear for a slow start", () => {
    const slow = CURVE_PRESETS.find((p) => p.value === "slow-start")!.curve;
    expect(ease(slow, 0.25)).toBeLessThan(0.25);
  });

  it("ends slower than linear for a slow end", () => {
    const slow = CURVE_PRESETS.find((p) => p.value === "slow-end")!.curve;
    expect(ease(slow, 0.75)).toBeGreaterThan(0.75);
  });

  it("stays inside 0 and 1 for every preset", () => {
    for (const preset of CURVE_PRESETS) {
      for (let x = 0; x <= 1; x += 0.01) {
        const y = ease(preset.curve, x);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("curveName", () => {
  it("names each preset", () => {
    for (const preset of CURVE_PRESETS) {
      expect(curveName(preset.curve)).toBe(preset.value);
    }
  });

  it("is null for a curve dragged off all of them", () => {
    expect(curveName([0.9, 0.1, 0.1, 0.9])).toBeNull();
  });
});

describe("opacityAt", () => {
  it("is one where nothing fades", () => {
    expect(opacityAt([], 5)).toBe(1);
    expect(opacityAt([fade(2, 3)], 1)).toBe(1);
  });

  it("ramps a fade in from nothing to the picture", () => {
    const fades = [fade(0, 2, "in")];
    expect(opacityAt(fades, 0)).toBeCloseTo(0, 6);
    expect(opacityAt(fades, 1)).toBeCloseTo(0.5, 6);
    expect(opacityAt(fades, 1.999)).toBeGreaterThan(0.99);
  });

  it("ramps a fade out the other way", () => {
    const fades = [fade(0, 2, "out")];
    expect(opacityAt(fades, 0)).toBeCloseTo(1, 6);
    expect(opacityAt(fades, 1)).toBeCloseTo(0.5, 6);
    expect(opacityAt(fades, 1.999)).toBeLessThan(0.01);
  });

  it("leaves the picture where the last fade left it", () => {
    // A fade out ends dark and stays dark, rather than snapping back the
    // instant its region ends.
    const out = [fade(1, 2, "out")];
    expect(opacityAt(out, 5)).toBe(0);

    const inn = [fade(1, 2, "in")];
    expect(opacityAt(inn, 5)).toBe(1);
  });

  it("comes back for a fade in after a fade out", () => {
    const fades = [fade(1, 2, "out"), fade(4, 5, "in", LINEAR, "b")];
    expect(opacityAt(fades, 3)).toBe(0);
    expect(opacityAt(fades, 4.5)).toBeCloseTo(0.5, 6);
    expect(opacityAt(fades, 6)).toBe(1);
  });

  it("stays inside 0 and 1 everywhere", () => {
    const fades = [fade(1, 2, "in"), fade(4, 6, "out", [0.9, 0, 0.1, 1], "b")];
    for (let t = 0; t <= 8; t += 0.05) {
      const opacity = opacityAt(fades, t);
      expect(opacity).toBeGreaterThanOrEqual(0);
      expect(opacity).toBeLessThanOrEqual(1);
    }
  });

  it("treats the end as exclusive, so two touching fades never both answer", () => {
    const fades = [fade(0, 2, "in"), fade(2, 4, "out", LINEAR, "b")];
    // At 2 the second one owns the instant, and it starts fully on.
    expect(opacityAt(fades, 2)).toBeCloseTo(1, 6);
  });
});

describe("placeFade", () => {
  it("runs the default length forward from the press", () => {
    expect(placeFade([], 3, 10)).toEqual({
      start: 3,
      end: 3 + DEFAULT_FADE_LENGTH,
    });
  });

  it("keeps a length it is handed, which is what a paste needs", () => {
    expect(placeFade([], 3, 10, 1.5)).toEqual({ start: 3, end: 4.5 });
  });

  it("stops at a neighbour rather than crossing it", () => {
    expect(placeFade([fade(4, 6)], 3.8, 10)).toEqual({ start: 3.8, end: 4 });
  });

  it("is null inside an existing fade", () => {
    expect(placeFade([fade(2, 5)], 3, 10)).toBeNull();
  });

  it("pulls back only to the shortest", () => {
    const placed = placeFade([], 9.95, 10)!;
    expect(placed.end).toBe(10);
    expect(placed.end - placed.start).toBeCloseTo(MIN_FADE, 10);
  });

  it("never proposes one shorter than the minimum or outside the clip", () => {
    for (let t = 0; t < 10; t += 0.1) {
      const placed = placeFade([fade(4, 4.5)], t, 10);
      if (!placed) continue;
      expect(placed.end - placed.start).toBeGreaterThanOrEqual(MIN_FADE - 1e-9);
      expect(placed.start).toBeGreaterThanOrEqual(0);
      expect(placed.end).toBeLessThanOrEqual(10 + 1e-9);
    }
  });
});

describe("roomAt and roomFor", () => {
  it("stops at the neighbours either side", () => {
    const fades = [fade(1, 2), fade(6, 7, "in", LINEAR, "b")];
    expect(roomAt(fades, 4, 10)).toEqual({ lo: 2, hi: 6 });
  });

  it("is null inside a fade", () => {
    expect(roomAt([fade(2, 4)], 3, 10)).toBeNull();
  });

  it("excludes a fade from its own bounds, which is what lets it be dragged", () => {
    const fades = [
      fade(1, 2, "in", LINEAR, "a"),
      fade(4, 5, "in", LINEAR, "b"),
      fade(7, 8, "in", LINEAR, "c"),
    ];
    expect(roomFor(fades, "b", 10)).toEqual({ lo: 2, hi: 7 });
  });
});

describe("bendCurve", () => {
  it("is the straight line at zero", () => {
    const curve = bendCurve(0);
    for (let x = 0; x <= 1; x += 0.05) {
      expect(ease(curve, x)).toBeCloseTo(x, 4);
    }
  });

  it("bows above the diagonal when bent up, which starts fast", () => {
    const curve = bendCurve(0.4);
    expect(ease(curve, 0.25)).toBeGreaterThan(0.25);
    expect(ease(curve, 0.5)).toBeGreaterThan(0.5);
  });

  it("bows below when bent down, which starts slow", () => {
    const curve = bendCurve(-0.4);
    expect(ease(curve, 0.25)).toBeLessThan(0.25);
    expect(ease(curve, 0.5)).toBeLessThan(0.5);
  });

  it("clamps the bend, so a drag off the lane cannot leave the unit square", () => {
    for (const bend of [-5, -0.5, 0, 0.5, 5]) {
      for (const n of bendCurve(bend)) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(1);
      }
    }
  });

  it("stays a usable curve at every bend", () => {
    for (let bend = -0.5; bend <= 0.5; bend += 0.05) {
      const curve = bendCurve(bend);
      let previous = -1;
      for (let x = 0; x <= 1; x += 0.05) {
        const y = ease(curve, x);
        expect(y).toBeGreaterThanOrEqual(previous - 1e-6);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
        previous = y;
      }
    }
  });
});
