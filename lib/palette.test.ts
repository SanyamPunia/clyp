import { describe, expect, it } from "vitest";

import { hslToHex, paletteFrom } from "@/lib/palette";

/** An RGBA buffer of `count` pixels of one colour, then the next. */
function pixels(...runs: [number, [number, number, number]][]) {
  const total = runs.reduce((sum, [count]) => sum + count, 0);
  const data = new Uint8ClampedArray(total * 4);
  let at = 0;
  for (const [count, [r, g, b]] of runs) {
    for (let i = 0; i < count; i++, at += 4) {
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
      data[at + 3] = 255;
    }
  }
  return data;
}

const hue = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (r >= g && r >= b) return "red";
  if (b >= r && b >= g) return "blue";
  return "green";
};

describe("paletteFrom", () => {
  it("always answers in six-digit hex", () => {
    for (const data of [
      pixels([100, [255, 0, 0]]),
      pixels([100, [128, 128, 128]]),
      new Uint8ClampedArray(0),
    ]) {
      const { from, to } = paletteFrom(data);
      expect(from).toMatch(/^#[0-9a-f]{6}$/);
      expect(to).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("runs between the two strongest hues", () => {
    const { from, to } = paletteFrom(
      pixels([600, [230, 40, 40]], [300, [40, 60, 230]], [2000, [250, 250, 250]]),
    );
    expect(hue(from)).toBe("red");
    expect(hue(to)).toBe("blue");
  });

  it("ignores a near-white page around the colour", () => {
    const { from } = paletteFrom(pixels([50, [30, 90, 240]], [5000, [252, 252, 252]]));
    expect(hue(from)).toBe("blue");
  });

  it("is a light neutral for a light grey picture and a dark one for a dark one", () => {
    const light = paletteFrom(pixels([100, [220, 220, 222]]));
    const dark = paletteFrom(pixels([100, [24, 24, 26]]));
    expect(parseInt(light.from.slice(1, 3), 16)).toBeGreaterThan(180);
    expect(parseInt(dark.from.slice(1, 3), 16)).toBeLessThan(100);
  });

  it("skips transparent pixels", () => {
    const data = pixels([100, [0, 0, 255]], [100, [255, 0, 0]]);
    for (let i = 3; i < 400; i += 4) data[i] = 0;
    expect(hue(paletteFrom(data).from)).toBe("red");
  });
});

describe("hslToHex", () => {
  it("converts the primaries", () => {
    expect(hslToHex(0, 1, 0.5)).toBe("#ff0000");
    expect(hslToHex(120, 1, 0.5)).toBe("#00ff00");
    expect(hslToHex(240, 1, 0.5)).toBe("#0000ff");
    expect(hslToHex(0, 0, 1)).toBe("#ffffff");
  });
});
