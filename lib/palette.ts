/**
 * A gradient that matches the picture, from the picture's own pixels.
 *
 * The colours are read by hue rather than by averaging: the average of a UI
 * with a blue header and an orange button is a brown nobody would pick. So
 * every coloured pixel votes for one of twelve hues, weighted by how coloured
 * it is, and the gradient runs between the strongest hue and the strongest one
 * far enough from it to read as a second colour.
 *
 * The lightness is set rather than taken. A screenshot's accent is usually a
 * button colour, which is too loud to fill the whole frame behind it, and its
 * background is usually near white or near black, which is too flat. So the
 * hues are kept and the lightness is placed in the band a background reads
 * well in, lighter at the start and darker at the end.
 *
 * Every colour out of here is a six-digit hex, which is what the gradient
 * registry requires of every layer.
 */

export interface PictureGradient {
  from: string;
  to: string;
}

const BUCKETS = 12;
/** How far apart two hues must be to count as two colours, in degrees. */
const MIN_HUE_GAP = 40;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h =
    max === rn
      ? ((gn - bn) / d) % 6
      : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const hex = (v: number) =>
    Math.round(Math.min(Math.max((v + m) * 255, 0), 255))
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * `data` is RGBA, as `getImageData` returns it. A few thousand pixels is
 * plenty: the caller draws the picture into a small canvas first.
 */
export function paletteFrom(data: Uint8ClampedArray): PictureGradient {
  const weight = new Float64Array(BUCKETS);
  // Hue is circular, so each bucket's mean is taken as a vector.
  const vx = new Float64Array(BUCKETS);
  const vy = new Float64Array(BUCKETS);
  const sat = new Float64Array(BUCKETS);
  let lightSum = 0;
  let count = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    lightSum += l;
    count++;
    // Near grey, near white and near black say nothing about the hue.
    if (s < 0.2 || l < 0.12 || l > 0.9) continue;
    const w = s * (1 - Math.abs(2 * l - 1));
    const b = Math.floor(h / (360 / BUCKETS)) % BUCKETS;
    weight[b] += w;
    vx[b] += Math.cos((h * Math.PI) / 180) * w;
    vy[b] += Math.sin((h * Math.PI) / 180) * w;
    sat[b] += s * w;
  }

  const total = weight.reduce((a, b) => a + b, 0);

  // A picture with almost no colour in it: a terminal, a grey UI, a document.
  // A neutral gradient keyed to how light it is, slightly cool, so a dark
  // capture sits on a dark frame and a light one on a light frame.
  if (count === 0 || total < count * 0.01) {
    const light = count ? lightSum / count : 0.5;
    return light > 0.5
      ? { from: hslToHex(220, 0.12, 0.86), to: hslToHex(220, 0.1, 0.66) }
      : { from: hslToHex(220, 0.12, 0.3), to: hslToHex(220, 0.14, 0.14) };
  }

  const hueOf = (b: number) => {
    const h = (Math.atan2(vy[b], vx[b]) * 180) / Math.PI;
    return h < 0 ? h + 360 : h;
  };
  const satOf = (b: number) => sat[b] / weight[b];

  const order = [...weight.keys()].sort((a, b) => weight[b] - weight[a]);
  const first = order[0];
  const h1 = hueOf(first);
  const second = order.find(
    (b) =>
      b !== first &&
      weight[b] >= weight[first] * 0.2 &&
      hueGap(hueOf(b), h1) >= MIN_HUE_GAP,
  );
  // One colour alone: its neighbour a little round the wheel, which keeps the
  // gradient in the picture's family rather than inventing a second colour.
  const h2 = second === undefined ? (h1 + 35) % 360 : hueOf(second);
  const s1 = Math.min(Math.max(satOf(first), 0.5), 0.85);
  const s2 =
    second === undefined ? s1 : Math.min(Math.max(satOf(second), 0.5), 0.85);

  return { from: hslToHex(h1, s1, 0.6), to: hslToHex(h2, s2, 0.36) };
}
