import { describe, expect, it } from "vitest";

import { halftoneDots, halftoneSvg, halftoneToCss, type HalftoneScreen } from "@/lib/halftone";

const screen: HalftoneScreen = {
  paper: "#f3efe9",
  ink: "#1d1a1a",
  field: { shape: "linear", angle: 90 },
  from: 0,
  to: 0.9,
  cells: 40,
};

/** Mean dot radius in a vertical strip of the square, in its own units. */
const meanRadius = (s: HalftoneScreen, from: number, to: number) => {
  const dots = halftoneDots(s).filter((d) => d.x >= from * 4000 && d.x < to * 4000);
  return dots.reduce((sum, d) => sum + d.r * d.r, 0) / dots.length;
};

describe("halftoneDots", () => {
  it("draws the same dots every time, so an export matches the preview", () => {
    const jittered = { ...screen, jitter: 0.4, seed: 9 };
    expect(halftoneDots(jittered)).toEqual(halftoneDots(jittered));
  });

  it("prints more ink where the field is darker", () => {
    // 90 degrees runs left to right, from bare paper to 0.9.
    expect(meanRadius(screen, 0.8, 1)).toBeGreaterThan(meanRadius(screen, 0, 0.2) * 4);
  });

  it("keeps the dots on or just past the square", () => {
    const pitch = 4000 / screen.cells;
    for (const dot of halftoneDots({ ...screen, screen: 30 })) {
      expect(dot.x).toBeGreaterThanOrEqual(-pitch);
      expect(dot.y).toBeLessThanOrEqual(4000 + pitch);
    }
  });

  it("thins a light tone out rather than drawing dots too small to see", () => {
    const pitch = 4000 / screen.cells;
    const light = halftoneDots({ ...screen, from: 0.002, to: 0.002 });
    for (const dot of light) expect(dot.r).toBeGreaterThanOrEqual(0.1 * pitch - 1e-9);
    // A few are kept, not none and not all.
    expect(light.length).toBeGreaterThan(0);
    expect(light.length).toBeLessThan(halftoneDots({ ...screen, from: 0.5, to: 0.5 }).length / 5);
  });
});

describe("halftoneSvg", () => {
  it("draws a plate under the ink for each colour it names", () => {
    const svg = halftoneSvg({ ...screen, plates: ["#ff0000", "#00ffff"] });
    expect(svg.indexOf("#ff0000")).toBeLessThan(svg.indexOf(screen.ink));
    expect(svg.indexOf("#00ffff")).toBeLessThan(svg.indexOf(screen.ink));
  });

  it("punches rings in paper colour only when asked", () => {
    expect(halftoneSvg(screen)).not.toContain(`stroke='${screen.paper}'`);
    expect(halftoneSvg({ ...screen, ring: 0.4 })).toContain(`stroke='${screen.paper}'`);
  });
});

describe("halftoneToCss", () => {
  it("escapes the colours, which would otherwise end the data URL", () => {
    const css = halftoneToCss(screen);
    const url = css.slice(0, css.indexOf('"),'));
    expect(url).not.toContain("#");
  });
});
