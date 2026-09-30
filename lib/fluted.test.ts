import { describe, expect, it } from "vitest";

import { columnStops, flutedSvg, type FlutedGlass } from "@/lib/fluted";

const glass: FlutedGlass = {
  colors: ["#000000", "#808080", "#ffffff"],
  columns: 5,
  curve: "arch",
  high: 0.2,
  low: 1,
  fall: 0.6,
};

describe("columnStops", () => {
  it("spans the whole column in order", () => {
    for (const peak of [0, 0.2, 0.5, 1, 1.4]) {
      const stops = columnStops(glass, peak);
      expect(stops[0][0]).toBe(0);
      expect(stops[stops.length - 1][0]).toBe(1);
      for (let i = 1; i < stops.length; i++) {
        expect(stops[i][0]).toBeGreaterThanOrEqual(stops[i - 1][0]);
      }
    }
  });

  it("starts calm and reaches the peak colour at its peak", () => {
    const stops = columnStops(glass, 0.4);
    expect(stops[0][1]).toBe("#000000");
    expect(stops.find(([y]) => Math.abs(y - 0.4) < 1e-9)?.[1]).toBe("#ffffff");
  });

  it("interpolates the colour where the frame cuts a ramp", () => {
    // The peak is past the bottom, so the bottom is partway up the rise.
    const stops = columnStops(glass, 4);
    expect(stops[stops.length - 1][1]).toBe("#404040");
  });

  it("holds the peak colour for the hold", () => {
    const stops = columnStops({ ...glass, hold: 0.2 }, 0.3);
    const peak = stops.filter(([, c]) => c === "#ffffff").map(([y]) => y);
    expect(peak[0]).toBeCloseTo(0.3, 9);
    expect(peak[peak.length - 1]).toBeCloseTo(0.5, 9);
  });
});

describe("flutedSvg", () => {
  it("draws one column per column", () => {
    expect(flutedSvg(glass).match(/<rect /g)).toHaveLength(glass.columns);
  });
});
