import { describe, expect, it } from "vitest";

import {
  ALL_CORNERS,
  aspectBox,
  aspectOptions,
  aspectRatio,
  cornerRadius,
} from "@/lib/style-options";

describe("aspectRatio", () => {
  it("is null for auto, which has no target", () => {
    expect(aspectRatio("auto")).toBeNull();
  });

  it("divides width by height", () => {
    expect(aspectRatio("1:1")).toBe(1);
    expect(aspectRatio("16:9")).toBeCloseTo(16 / 9, 10);
    expect(aspectRatio("9:16")).toBeCloseTo(9 / 16, 10);
    expect(aspectRatio("4:5")).toBe(0.8);
  });

  it("parses a decimal ratio, which the link-preview shape needs", () => {
    expect(aspectRatio("1.91:1")).toBeCloseTo(1.91, 10);
  });

  it("answers for every shape the picker offers", () => {
    for (const option of aspectOptions) {
      const ratio = aspectRatio(option.value);
      if (option.value === "auto") {
        expect(ratio, option.value).toBeNull();
      } else {
        expect(ratio, option.value).toBeGreaterThan(0);
      }
    }
  });

  it("lists the shapes tallest first, with auto leading", () => {
    // The row reads as a scale, so the one being looked for is where its
    // proportions say it is.
    expect(aspectOptions[0].value).toBe("auto");
    const ratios = aspectOptions.slice(1).map((o) => aspectRatio(o.value)!);
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]).toBeGreaterThan(ratios[i - 1]);
    }
  });

  it("has a count the picker's grid lays out evenly", () => {
    // Four across, so a ragged last row is a spec failure rather than a
    // surprise in the panel.
    expect(aspectOptions.length % 4).toBe(0);
  });

  it("is null for anything that is not two positive numbers", () => {
    expect(aspectRatio("")).toBeNull();
    expect(aspectRatio("0:1")).toBeNull();
    expect(aspectRatio("1:0")).toBeNull();
    expect(aspectRatio("16")).toBeNull();
  });
});

describe("aspectBox", () => {
  // The artwork, not the media: the measured exports in CLAUDE.md were a
  // 1280x720 clip under a title bar, so the box the shape has to hold is 30px
  // taller than the picture. At 64px of padding that is 1408x878.
  const clip = { width: 1280, height: 750 };
  const padding = 64;

  it("grows the short axis and never shrinks the long one", () => {
    const box = aspectBox(clip, padding, 1);
    expect(box).toEqual({ width: 1408, height: 1408 });
  });

  it("matches the exports measured for a 1280x720 clip", () => {
    expect(aspectBox(clip, padding, 4 / 5)).toEqual({
      width: 1408,
      height: 1760,
    });
    expect(aspectBox(clip, padding, 16 / 9)).toEqual({
      width: 1561,
      height: 878,
    });
    expect(aspectBox(clip, padding, 9 / 16)).toEqual({
      width: 1408,
      height: 2503,
    });
  });

  it("grows the width for a tall clip, the other branch", () => {
    const tall = { width: 886, height: 1918 };
    expect(aspectBox(tall, 79, 1)).toEqual({ width: 2076, height: 2076 });
    expect(aspectBox(tall, 79, 16 / 9)).toEqual({ width: 3691, height: 2076 });
  });

  it("holds the ratio it was asked for", () => {
    for (const ratio of [1, 0.8, 16 / 9, 9 / 16]) {
      const box = aspectBox(clip, padding, ratio);
      expect(box.width / box.height).toBeCloseTo(ratio, 2);
    }
  });

  it("never returns a box smaller than the artwork plus its padding", () => {
    for (const ratio of [1, 0.8, 16 / 9, 9 / 16, 3]) {
      const box = aspectBox(clip, padding, ratio);
      expect(box.width).toBeGreaterThanOrEqual(clip.width + padding * 2);
      expect(box.height).toBeGreaterThanOrEqual(clip.height + padding * 2);
    }
  });
});

describe("cornerRadius", () => {
  it("writes the shorthand in tl tr br bl order", () => {
    expect(cornerRadius(12, ALL_CORNERS)).toBe("12px 12px 12px 12px");
  });

  it("zeroes the corners that are switched off", () => {
    expect(
      cornerRadius(8, { tl: true, tr: false, br: true, bl: false }),
    ).toBe("8px 0px 8px 0px");
  });

  it("restricts to one edge, which is how a bar and the media meet flush", () => {
    // The bar takes the top, the media the bottom, and the two always agree.
    expect(cornerRadius(10, ALL_CORNERS, "top")).toBe("10px 10px 0px 0px");
    expect(cornerRadius(10, ALL_CORNERS, "bottom")).toBe("0px 0px 10px 10px");
  });

  it("takes the corner's own switch and the restriction together", () => {
    const corners = { tl: true, tr: false, br: false, bl: true };
    expect(cornerRadius(6, corners, "top")).toBe("6px 0px 0px 0px");
    expect(cornerRadius(6, corners, "bottom")).toBe("0px 0px 0px 6px");
  });
});
