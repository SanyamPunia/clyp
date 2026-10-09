/**
 * Fluted glass: a row of columns, each a vertical gradient of the same
 * colours, with the point where each column peaks moving from one column to
 * the next. Seen together the peaks draw a curve, an arch or a wave, across
 * hard column edges, the way light bends through reeded glass.
 *
 * A column is a rect with a gradient of its own, which CSS cannot draw
 * without a `background-size` per layer, so it is written as an SVG and goes
 * through `svgBackground`.
 *
 * The columns stretch with the frame rather than being cropped to it. Nothing
 * in them is round, so stretching distorts nothing, and a crop would lose the
 * outer columns on a tall frame, which is where the curve ends.
 */

import { svgBackground, svgDocument } from "@/lib/svg-background";

/** The line the peaks follow across the columns. */
export type FluteCurve = "arch" | "valley" | "wave" | "slope";

export interface FlutedGlass {
  /**
   * From the calm end to the peak. Each column rises through them to its
   * peak and falls back through them after it.
   */
  colors: string[];
  columns: number;
  curve: FluteCurve;
  /** The peak's height at the curve's two extremes, as fractions of the
   * frame's height. Past 1 the peak is below the frame. */
  high: number;
  low: number;
  /** How far below its peak a column takes to fall back to the calm end, as
   * a fraction of the height. */
  fall: number;
  /** How long the peak colour holds before the fall starts, as a fraction of
   * the height. The reference's red runs a third of the frame. */
  hold?: number;
  /** Waves across the row, for `wave`. */
  waves?: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return (
    "#" +
    ca
      .map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Where a column's peak sits, for its place `u` across the row, 0 to 1. */
function peakAt(glass: FlutedGlass, u: number): number {
  const { high, low } = glass;
  switch (glass.curve) {
    case "arch":
      // Highest in the middle, falling away to either edge.
      return high + (low - high) * Math.abs(2 * u - 1) ** 1.3;
    case "valley":
      return low + (high - low) * Math.abs(2 * u - 1) ** 1.3;
    case "wave":
      return high + (low - high) * (0.5 + 0.5 * Math.cos(2 * Math.PI * u * (glass.waves ?? 1)));
    case "slope":
      return high + (low - high) * u;
  }
}

/**
 * One column's stops as `[offset, colour]`, for the frame's height from 0 to
 * 1. The column rises from the calm colour at the top to the peak, holds
 * there for `hold` and falls back over `fall`. Stops outside the frame are
 * dropped and the colour where the frame cuts the ramp is interpolated in
 * their place.
 */
export function columnStops(glass: FlutedGlass, peak: number): [number, string][] {
  const { colors, fall } = glass;
  const hold = glass.hold ?? 0;
  const last = colors.length - 1;
  const ramp: [number, string][] = [
    ...colors.map((c, k): [number, string] => [(peak * k) / last, c]),
    ...(hold > 0 ? [[peak + hold, colors[last]] as [number, string]] : []),
    ...colors
      .slice(0, -1)
      .reverse()
      .map((c, k): [number, string] => [peak + hold + (fall * (k + 1)) / last, c]),
  ];
  const at = (y: number): string => {
    if (y <= ramp[0][0]) return ramp[0][1];
    for (let i = 1; i < ramp.length; i++) {
      const [y1, c1] = ramp[i];
      const [y0, c0] = ramp[i - 1];
      if (y <= y1) return y1 > y0 ? mix(c0, c1, (y - y0) / (y1 - y0)) : c1;
    }
    return ramp[ramp.length - 1][1];
  };
  const inside = ramp.filter(([y]) => y > 0 && y < 1);
  return [[0, at(0)], ...inside, [1, at(1)]];
}

export function flutedSvg(glass: FlutedGlass): string {
  const n = glass.columns;
  const defs: string[] = [];
  const rects: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const stops = columnStops(glass, peakAt(glass, u))
      .map(([y, c]) => `<stop offset='${(y * 100).toFixed(2)}%' stop-color='${c}'/>`)
      .join("");
    // The ids are private to this image's own document, so no two
    // backgrounds on the page can collide on them.
    defs.push(`<linearGradient id='c${i}' x1='0' y1='0' x2='0' y2='1'>${stops}</linearGradient>`);
    // A hair wider than the column, so antialiasing never opens a seam.
    rects.push(`<rect x='${i}' width='1.02' height='1' fill='url(#c${i})'/>`);
  }
  return svgDocument(`0 0 ${n} 1`, "none", `<defs>${defs.join("")}</defs>${rects.join("")}`);
}

/** The `background-image` value, over the calm colour. */
export function flutedToCss(glass: FlutedGlass): string {
  return svgBackground(flutedSvg(glass), glass.colors[0]);
}
