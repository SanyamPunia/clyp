/**
 * Paper stocks: a flat colour with the surface a real sheet has.
 *
 * The surface is an SVG filter inside the image: fractal noise read as a
 * height map and lit from the top left, which is what gives a sheet its
 * tooth and a crumpled one its creases. The light becomes two translucent
 * layers over the colour, black where the surface faces away and white where
 * it faces the light, so a flat patch of paper is its own colour exactly
 * rather than a shade of it.
 *
 * The filter runs inside the image, not on a DOM element, which is why it
 * survives `html-to-image`. That library drops a filter set on an element,
 * and `lib/noise.ts` moved the grain to a raster for that reason. An image's
 * own filters are the browser's to render, the same as its pixels.
 *
 * The sheet is laid out on a square and sliced to cover the frame, so the
 * tooth, the weave and the rules stay square at any shape. Everything is in
 * the square's units, so a 3x export shows the same sheet at three times the
 * detail, and everything random is seeded, so it is the same sheet each time.
 */

import { svgBackground, svgDocument } from "@/lib/svg-background";

export interface PaperStock {
  color: string;
  /** Fine surface texture. `size` is the grain, in thousandths of the side. */
  tooth?: { size: number; depth: number };
  /** Broad folds and dents, the same lighting at a far larger scale. */
  crumple?: { size: number; depth: number };
  /** Cloudy patches of a second colour, as in recycled or handmade stock. */
  mottle?: { color: string; size: number; amount: number };
  /** A canvas twill: diagonal ribs. `size` is a rib's pitch. */
  weave?: { size: number; depth: number; angle: number };
  /**
   * Creases where the sheet was folded, as fractions of the side. Each panel
   * between them catches the light a little differently.
   */
  folds?: { x: number[]; y: number[]; depth: number };
  /** Short curved strands pressed into the sheet. */
  fibres?: { color: string; count: number; opacity: number };
  /** Flecks of the pulp. */
  speckles?: { color: string; count: number; opacity: number };
  /** Soft blots, as of water or tea. */
  stains?: { color: string; count: number; opacity: number };
  /**
   * Printed or pressed lines. `ruled` is a notebook, `grid` graph paper,
   * `laid` the fine wire lines and wider chain lines of laid paper. `spacing`
   * is in thousandths of the side.
   */
  lines?: {
    kind: "ruled" | "grid" | "laid";
    color: string;
    spacing: number;
    opacity: number;
  };
  seed?: number;
}

const SIZE = 1000;

/** The light's height over the sheet. A flat surface lights to its sine. */
const ELEVATION = 55;

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

const round = (n: number, places = 1) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

const region = `x='0' y='0' width='${SIZE}' height='${SIZE}' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'`;

/**
 * Light as two layers, shade and highlight, from an image named `l`. Both
 * take their alpha from how far a point is from what a flat patch gets, so
 * a flat patch gets neither. The rows default to reading a lit image's red.
 */
function lightToLayers(
  depth: number,
  shade = litRow(depth, -1),
  light = litRow(depth, 1),
): string {
  return (
    `<feColorMatrix in='l' type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${shade}' result='s'/>` +
    `<feColorMatrix in='l' type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${light}' result='h'/>` +
    `<feMerge><feMergeNode in='s'/><feMergeNode in='h'/></feMerge>`
  );
}

/** A colour matrix's alpha row for a lit image: `sign` 1 for light, -1 for
 * shade, zero where the surface lights as flat paper does. */
function litRow(depth: number, sign: 1 | -1): string {
  const flat = Math.sin((ELEVATION * Math.PI) / 180);
  const k = round(1.6 * depth, 2) * sign;
  return `${k} 0 0 0 ${round(-k * flat, 3)}`;
}

/**
 * Fractal noise read as a height map and lit. The height scales with the
 * noise's own size, since a slope is height over distance.
 */
function relief(id: string, size: number, depth: number, seed: number): string {
  return (
    `<filter id='${id}' ${region}>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${round(1 / size, 4)}' numOctaves='3' seed='${seed}' result='n'/>` +
    `<feDiffuseLighting in='n' result='l' surfaceScale='${round(size * 0.6)}' diffuseConstant='1' lighting-color='#fff'>` +
    `<feDistantLight azimuth='225' elevation='${ELEVATION}'/></feDiffuseLighting>` +
    lightToLayers(depth) +
    `</filter>`
  );
}

/**
 * Broad noise as shade and light directly, with no lighting pass.
 *
 * A crumple is lit the way the tooth is in principle, but a height map is
 * eight bits deep, and at a crumple's scale in a 3x export one step of it
 * spans several pixels. The lighting then reads each step as a ledge and
 * the sheet is covered in contour lines. The noise itself, used as a tone,
 * has the same steps a 255th of the way apart, which nothing can see.
 */
function shading(id: string, size: number, depth: number, seed: number): string {
  const k = round(0.4 * depth, 2);
  return (
    `<filter id='${id}' ${region}>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${round(1 / size, 4)}' numOctaves='3' seed='${seed}' result='l'/>` +
    // Fractal noise sits round half, so half is flat paper.
    lightToLayers(depth, `0 0 0 ${-k} ${round(k * 0.5, 3)}`, `0 0 0 ${k} ${round(-k * 0.5, 3)}`) +
    `</filter>`
  );
}

export function paperSvg(stock: PaperStock): string {
  const seed = stock.seed ?? 1;
  const rand = mulberry32(seed);
  const defs: string[] = [];
  const body: string[] = [];
  const sheet = (filter: string, fill = "#000") =>
    `<rect width='${SIZE}' height='${SIZE}' fill='${fill}' filter='url(#${filter})'/>`;

  if (stock.mottle) {
    const { color, size, amount } = stock.mottle;
    // Low noise as the alpha of a flood of the second colour.
    const a = round(amount * 4, 2);
    defs.push(
      `<filter id='m' ${region}>` +
        `<feTurbulence type='fractalNoise' baseFrequency='${round(1 / size, 4)}' numOctaves='3' seed='${seed + 7}' result='n'/>` +
        `<feColorMatrix in='n' type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${a} 0 0 0 ${round(-a * 0.45, 2)}' result='a'/>` +
        `<feFlood flood-color='${color}'/>` +
        `<feComposite in2='a' operator='in'/>` +
        `</filter>`,
    );
    body.push(sheet("m"));
  }

  if (stock.stains) {
    const { color, count, opacity } = stock.stains;
    defs.push(
      `<radialGradient id='st'><stop offset='0' stop-color='${color}' stop-opacity='${opacity}'/>` +
        `<stop offset='0.7' stop-color='${color}' stop-opacity='${round(opacity * 0.8, 2)}'/>` +
        `<stop offset='1' stop-color='${color}' stop-opacity='0'/></radialGradient>`,
    );
    const blots: string[] = [];
    for (let i = 0; i < count; i++) {
      const r = 2 + rand() ** 3 * 12;
      blots.push(
        `<ellipse cx='${round(rand() * SIZE)}' cy='${round(rand() * SIZE)}' rx='${round(r)}' ry='${round(r * (0.7 + rand() * 0.5))}'/>`,
      );
    }
    body.push(`<g fill='url(#st)'>${blots.join("")}</g>`);
  }

  if (stock.lines) {
    const { kind, color, spacing, opacity } = stock.lines;
    const d: string[] = [];
    if (kind === "laid") {
      // Wire lines close together, chain lines far apart across them.
      for (let y = spacing / 2; y < SIZE; y += spacing) d.push(`M0 ${round(y)}H${SIZE}`);
      body.push(`<path d='${d.join("")}' stroke='${color}' stroke-opacity='${opacity}' stroke-width='${round(spacing * 0.35)}'/>`);
      const chain: string[] = [];
      for (let x = spacing * 12; x < SIZE; x += spacing * 25) chain.push(`M${round(x)} 0V${SIZE}`);
      body.push(`<path d='${chain.join("")}' stroke='${color}' stroke-opacity='${round(opacity * 1.6, 2)}' stroke-width='${round(spacing * 0.5)}'/>`);
    } else {
      for (let y = spacing; y < SIZE; y += spacing) d.push(`M0 ${round(y)}H${SIZE}`);
      if (kind === "grid") {
        for (let x = spacing; x < SIZE; x += spacing) d.push(`M${round(x)} 0V${SIZE}`);
      }
      // A notebook's rules are printed heavier than graph paper's minor lines.
      const width = kind === "ruled" ? 1.8 : 1;
      body.push(`<path d='${d.join("")}' stroke='${color}' stroke-opacity='${opacity}' stroke-width='${width}'/>`);
      if (kind === "grid") {
        // Every fifth line heavier, the way graph paper is printed.
        const major: string[] = [];
        for (let v = spacing * 5; v < SIZE; v += spacing * 5) {
          major.push(`M0 ${round(v)}H${SIZE}M${round(v)} 0V${SIZE}`);
        }
        body.push(`<path d='${major.join("")}' stroke='${color}' stroke-opacity='${opacity}' stroke-width='2'/>`);
      }
    }
  }

  if (stock.fibres) {
    const { color, count, opacity } = stock.fibres;
    const d: string[] = [];
    for (let i = 0; i < count; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const a = rand() * Math.PI * 2;
      const len = 6 + rand() * 20;
      const bend = (rand() - 0.5) * len;
      const ex = x + Math.cos(a) * len;
      const ey = y + Math.sin(a) * len;
      const cx = (x + ex) / 2 - Math.sin(a) * bend;
      const cy = (y + ey) / 2 + Math.cos(a) * bend;
      d.push(`M${round(x)} ${round(y)}Q${round(cx)} ${round(cy)} ${round(ex)} ${round(ey)}`);
    }
    body.push(`<path d='${d.join("")}' fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='0.6' stroke-linecap='round'/>`);
  }

  if (stock.speckles) {
    const { color, count, opacity } = stock.speckles;
    const d: string[] = [];
    for (let i = 0; i < count; i++) d.push(`M${round(rand() * SIZE)} ${round(rand() * SIZE)}h0`);
    // Mostly small, since pulp flecks are.
    const cut = Math.floor(count * 0.8);
    body.push(`<path d='${d.slice(0, cut).join("")}' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1.2' stroke-linecap='round'/>`);
    body.push(`<path d='${d.slice(cut).join("")}' stroke='${color}' stroke-opacity='${opacity}' stroke-width='2.6' stroke-linecap='round'/>`);
  }

  if (stock.weave) {
    const { size, depth, angle } = stock.weave;
    // A rib is a shaded band and a lit edge. The weft crossing it breaks each
    // rib into stitches, and a slight displacement keeps the threads from
    // reading as ruled.
    defs.push(
      `<pattern id='wv' width='${size}' height='${size}' patternUnits='userSpaceOnUse' patternTransform='rotate(${angle})'>` +
        `<rect width='${size}' height='${round(size * 0.45, 2)}' fill='#000' fill-opacity='${round(0.22 * depth, 3)}'/>` +
        `<rect y='${round(size * 0.5, 2)}' width='${size}' height='${round(size * 0.18, 2)}' fill='#fff' fill-opacity='${round(0.35 * depth, 3)}'/>` +
        `<rect x='${round(size * 0.9, 2)}' width='${round(size * 0.12, 2)}' height='${size}' fill='#000' fill-opacity='${round(0.12 * depth, 3)}'/>` +
        `</pattern>` +
        `<filter id='wf' ${region}>` +
        `<feTurbulence type='fractalNoise' baseFrequency='${round(0.35 / size, 4)}' numOctaves='2' seed='${seed + 11}' result='n'/>` +
        `<feDisplacementMap in='SourceGraphic' in2='n' scale='${round(size * 0.3, 2)}'/>` +
        `</filter>`,
    );
    body.push(`<rect width='${SIZE}' height='${SIZE}' fill='url(#wv)' filter='url(#wf)'/>`);
  }

  if (stock.folds) {
    const { x, y, depth } = stock.folds;
    // Each panel between the creases catches the light a little differently.
    const xs = [0, ...x, 1];
    const ys = [0, ...y, 1];
    const panels: string[] = [];
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < ys.length - 1; j++) {
        const tone = rand() * 2 - 1;
        const fill = tone < 0 ? "#000" : "#fff";
        panels.push(
          `<rect x='${round(xs[i] * SIZE)}' y='${round(ys[j] * SIZE)}' width='${round((xs[i + 1] - xs[i]) * SIZE)}' height='${round((ys[j + 1] - ys[j]) * SIZE)}' fill='${fill}' fill-opacity='${round(Math.abs(tone) * 0.035 * depth, 3)}'/>`,
        );
      }
    }
    body.push(panels.join(""));
    // A crease is a soft shadow on the side away from the light and a hard
    // lit ridge on the other, across the whole sheet.
    const w = 30;
    const shade = round(0.07 * depth, 3);
    const lit = round(0.3 * depth, 3);
    defs.push(
      `<linearGradient id='fv' x1='0' x2='1' y1='0' y2='0'>` +
        `<stop offset='0' stop-color='#000' stop-opacity='0'/>` +
        `<stop offset='0.495' stop-color='#000' stop-opacity='${shade}'/>` +
        `<stop offset='0.5' stop-color='#fff' stop-opacity='${lit}'/>` +
        `<stop offset='0.75' stop-color='#fff' stop-opacity='0'/>` +
        `</linearGradient>` +
        `<linearGradient id='fh' x1='0' x2='0' y1='0' y2='1' href='#fv'/>`,
    );
    for (const fx of x) {
      body.push(`<rect x='${round(fx * SIZE - w)}' width='${w * 2}' height='${SIZE}' fill='url(#fv)'/>`);
    }
    for (const fy of y) {
      body.push(`<rect y='${round(fy * SIZE - w)}' width='${SIZE}' height='${w * 2}' fill='url(#fh)'/>`);
    }
  }

  // The light goes last, so fibres, flecks and rules sit in the surface
  // rather than on top of it.
  if (stock.crumple) {
    const { size, depth } = stock.crumple;
    defs.push(shading("c", size, depth, seed + 3));
    body.push(sheet("c"));
  }
  if (stock.tooth) {
    const { size, depth } = stock.tooth;
    defs.push(relief("t", size, depth, seed));
    body.push(sheet("t"));
  }

  return svgDocument(`0 0 ${SIZE} ${SIZE}`, "xMidYMid slice", `<defs>${defs.join("")}</defs>${body.join("")}`);
}

const cache = new Map<string, string>();

/**
 * The `background-image` value: the surface over the sheet's colour.
 * Memoised on the stock, since the picker and the canvas both ask on every
 * render.
 */
export function paperToCss(stock: PaperStock): string {
  const key = JSON.stringify(stock);
  const hit = cache.get(key);
  if (hit) return hit;
  const css = svgBackground(paperSvg(stock), stock.color);
  cache.set(key, css);
  return css;
}
