/**
 * Halftone screens: a tone field printed as dots on paper.
 *
 * A gradient cannot draw a dot, so a screen is written as an SVG and handed to
 * `background-image` through `svgBackground`. It is vector, so a 3x export
 * prints the same dots three times sharper rather than enlarging a raster of
 * them.
 *
 * The screen is laid out on a square and sliced to cover the frame, the way
 * `background-size: cover` would, so a dot stays round and the same size
 * against the frame's long edge at any shape.
 *
 * Everything is seeded, so the same preset draws the same dots on every
 * render and in every export.
 */

import { svgBackground, svgDocument } from "@/lib/svg-background";

/** How dark the paper is at a point, from 0 (bare paper) to 1 (solid ink). */
export type ToneField =
  | {
      shape: "linear";
      /** CSS angle convention: 90 runs left to right, 180 top to bottom. */
      angle: number;
    }
  | {
      shape: "radial";
      /** Centre, in percent of the square. */
      x: number;
      y: number;
      /** Where the ramp ends, in percent of the square's side. */
      r: number;
    }
  | {
      shape: "noise";
      /** Noise cells across the square. More is a finer cloud. */
      scale: number;
    };

export interface HalftoneScreen {
  /** The paper, painted under the dots as a solid layer. */
  paper: string;
  ink: string;
  field: ToneField;
  /** Coverage at the start of the field's axis and at its end, 0 to 1. */
  from: number;
  to: number;
  /**
   * The stretch of the axis the ramp runs over, as fractions. Outside it the
   * tone holds at `from` before and `to` after. Defaults to the whole axis.
   */
  ramp?: [number, number];
  /** Dots across the square's side. */
  cells: number;
  /** Screen angle, in degrees. */
  screen?: number;
  grid?: "hex" | "square";
  /** How far a dot may wander from its cell, as a fraction of the pitch. */
  jitter?: number;
  /**
   * A paper hole in each dot, as a fraction of its radius, which turns dots
   * into rings. Small dots are left solid, since a hole in them is sub-pixel.
   */
  ring?: number;
  /**
   * Misregistered colour plates printed under the ink, each nudged a little
   * off the key plate, which is what leaves a colour fringe round every dot.
   */
  plates?: string[];
  seed?: number;
}

/** The square the screen is laid out on. Integer coordinates at this size
 * are within about 1% of a pitch, which reads as exact. */
const SIZE = 4000;

/** Radius steps. Dots are grouped by radius so each group is one path. */
const LEVELS = 24;

/**
 * The smallest dot drawn, as a fraction of the pitch. A lighter tone than
 * this keeps a dot of this size at random, often enough to print the same
 * amount of ink, so a fade thins out into bare paper rather than stopping at
 * a hard edge where the dots get too small to see.
 */
const MIN_DOT = 0.1;

/** How far a plate sits off the key plate, as a fraction of the pitch. */
const PLATE_SHIFT = 0.16;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}

/** Value noise, summed over four octaves and normalised to 0 to 1. */
function noise2(seed: number): (x: number, y: number) => number {
  const hash = (ix: number, iy: number, octave: number) => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed + octave, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const octave = (x: number, y: number, o: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smoothstep(x - ix);
    const fy = smoothstep(y - iy);
    const top = hash(ix, iy, o) + (hash(ix + 1, iy, o) - hash(ix, iy, o)) * fx;
    const bottom = hash(ix, iy + 1, o) + (hash(ix + 1, iy + 1, o) - hash(ix, iy + 1, o)) * fx;
    return top + (bottom - top) * fy;
  };
  return (x, y) => {
    let sum = 0;
    let weight = 0;
    for (let o = 0, amp = 1, freq = 1; o < 4; o++, amp /= 2, freq *= 2) {
      sum += octave(x * freq, y * freq, o) * amp;
      weight += amp;
    }
    // Summed octaves bunch round the middle, so the spread is pulled back out
    // to use most of 0 to 1.
    return Math.min(Math.max((sum / weight - 0.5) * 2.2 + 0.5, 0), 1);
  };
}

/** Where a point of the unit square sits along the field's axis, 0 to 1. */
function axisOf(field: ToneField, seed: number): (x: number, y: number) => number {
  if (field.shape === "linear") {
    const a = (field.angle * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    // The CSS gradient line: long enough that the corners land on 0 and 1.
    const span = Math.abs(dx) + Math.abs(dy);
    return (x, y) => ((x - 0.5) * dx + (y - 0.5) * dy) / span + 0.5;
  }
  if (field.shape === "radial") {
    const cx = field.x / 100;
    const cy = field.y / 100;
    const r = field.r / 100;
    return (x, y) => Math.hypot(x - cx, y - cy) / r;
  }
  const n = noise2(seed);
  return (x, y) => n(x * field.scale, y * field.scale);
}

/** The screen's dots, as centres and radii in the square's units. */
export function halftoneDots(
  screen: HalftoneScreen,
): { x: number; y: number; r: number }[] {
  const seed = screen.seed ?? 1;
  const rand = mulberry32(seed);
  const axis = axisOf(screen.field, seed);
  const [lo, hi] = screen.ramp ?? [0, 1];
  const hex = (screen.grid ?? "hex") === "hex";
  const pitch = SIZE / screen.cells;
  const row = hex ? (pitch * Math.sqrt(3)) / 2 : pitch;
  // Coverage is dot area over cell area, so a radius comes from its root.
  const cellArea = pitch * row;
  const theta = ((screen.screen ?? 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const jitter = (screen.jitter ?? 0) * pitch;
  // A rotated lattice has to reach the corners, which are further out than
  // the sides.
  const reach = (SIZE * Math.SQRT2) / 2 + pitch;

  const dots: { x: number; y: number; r: number }[] = [];
  const rows = Math.ceil(reach / row);
  const cols = Math.ceil(reach / pitch);
  for (let j = -rows; j <= rows; j++) {
    for (let i = -cols; i <= cols; i++) {
      const lx = i * pitch + (hex && j % 2 !== 0 ? pitch / 2 : 0);
      const ly = j * row;
      // Drawn for every lattice point, kept or not, so what one preset keeps
      // never shifts the dots after it.
      const jx = (rand() * 2 - 1) * jitter;
      const jy = (rand() * 2 - 1) * jitter;
      const keep = rand();
      const x = SIZE / 2 + lx * cos - ly * sin + jx;
      const y = SIZE / 2 + lx * sin + ly * cos + jy;
      if (x < -pitch || y < -pitch || x > SIZE + pitch || y > SIZE + pitch) continue;

      const along = hi > lo ? (axis(x / SIZE, y / SIZE) - lo) / (hi - lo) : 0;
      const tone = screen.from + (screen.to - screen.from) * smoothstep(along);
      const coverage = Math.min(Math.max(tone, 0), 1);
      const r = Math.sqrt((coverage * cellArea) / Math.PI);
      const least = MIN_DOT * pitch;
      if (r >= least) dots.push({ x, y, r });
      else if (r > 0 && keep < (r / least) ** 2) dots.push({ x, y, r: least });
    }
  }
  return dots;
}

/**
 * One path per radius step. A dot is a zero-length line with a round cap,
 * `m dx dy h0`, which is about eight bytes against thirty for a `<circle>`,
 * and a screen is ten thousand dots.
 */
function paths(
  dots: { x: number; y: number; r: number }[],
  rmax: number,
  shift: { x: number; y: number },
): string {
  const buckets = new Map<number, string[]>();
  const last = new Map<number, { x: number; y: number }>();
  for (const dot of dots) {
    const level = Math.round((dot.r / rmax) * LEVELS);
    if (level <= 0) continue;
    const x = Math.round(dot.x + shift.x);
    const y = Math.round(dot.y + shift.y);
    const prev = last.get(level);
    const move = prev ? `m${x - prev.x} ${y - prev.y}` : `M${x} ${y}`;
    last.set(level, { x, y });
    const list = buckets.get(level) ?? [];
    list.push(`${move}h0`);
    buckets.set(level, list);
  }
  return [...buckets.entries()]
    .map(([level, moves]) => {
      const width = ((2 * level * rmax) / LEVELS).toFixed(1);
      return `<path stroke-width='${width}' d='${moves.join("").replace(/ -/g, "-")}'/>`;
    })
    .join("");
}

/** The screen as an SVG document. The paper is not in it: see `svgBackground`. */
export function halftoneSvg(screen: HalftoneScreen): string {
  const dots = halftoneDots(screen);
  const pitch = SIZE / screen.cells;
  // The largest a dot gets, full coverage. Plates run a touch larger so their
  // fringe clears the key plate's edge.
  const rmax = Math.sqrt((pitch * pitch) / Math.PI) * 1.1;
  const group = (colour: string, body: string) =>
    `<g fill='none' stroke='${colour}' stroke-linecap='round'>${body}</g>`;

  const layers: string[] = [];
  (screen.plates ?? []).forEach((colour, i) => {
    const a = ((i * 360) / (screen.plates?.length ?? 1) + 30) * (Math.PI / 180);
    const shift = { x: Math.cos(a) * PLATE_SHIFT * pitch, y: Math.sin(a) * PLATE_SHIFT * pitch };
    layers.push(group(colour, paths(dots, rmax, shift)));
  });
  layers.push(group(screen.ink, paths(dots, rmax, { x: 0, y: 0 })));
  if (screen.ring) {
    const ring = screen.ring;
    // Holes only in dots big enough to hold one a pixel wide at 1x.
    const holes = dots
      .filter((dot) => dot.r > pitch * 0.2)
      .map((dot) => ({ ...dot, r: dot.r * ring }));
    layers.push(group(screen.paper, paths(holes, rmax, { x: 0, y: 0 })));
  }

  // Sliced, so the square covers the frame and a dot stays round.
  return svgDocument(`0 0 ${SIZE} ${SIZE}`, "xMidYMid slice", layers.join(""));
}

const cache = new Map<string, string>();

/**
 * The `background-image` value: the screen over its paper.
 *
 * Memoised on the screen, since a screen is ten thousand dots and the picker
 * and the canvas both ask for it on every render.
 */
export function halftoneToCss(screen: HalftoneScreen): string {
  const key = JSON.stringify(screen);
  const hit = cache.get(key);
  if (hit) return hit;
  const css = svgBackground(halftoneSvg(screen), screen.paper);
  cache.set(key, css);
  return css;
}
