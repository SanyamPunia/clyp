import { describe, expect, it } from "vitest";

import {
  estimateBytes,
  estimateMovingBytes,
  estimateVideoBytes,
  formatBytes,
  outputSize,
} from "@/lib/export-size";

describe("outputSize", () => {
  it("multiplies the frame by the scale and rounds", () => {
    expect(outputSize({ width: 1408, height: 878 }, 1)).toEqual({
      width: 1408,
      height: 878,
    });
    expect(outputSize({ width: 1408, height: 878 }, 2)).toEqual({
      width: 2816,
      height: 1756,
    });
    expect(outputSize({ width: 1139, height: 731 }, 3)).toEqual({
      width: 3417,
      height: 2193,
    });
  });
});

describe("estimateBytes", () => {
  it("is zero for an empty frame", () => {
    expect(estimateBytes(0, 0, false)).toBe(0);
    expect(estimateBytes(1408, 0, true)).toBe(0);
  });

  // The samples the power-law fit came from, in bytes per pixel. Content varies
  // by roughly a fifth either way, so the fit is checked to 10%.
  const samples = [
    { megapixels: 1.27, grain: false, perPixel: 0.0732 },
    { megapixels: 5.09, grain: false, perPixel: 0.0573 },
    { megapixels: 11.45, grain: false, perPixel: 0.0519 },
    { megapixels: 1.27, grain: true, perPixel: 0.2447 },
    { megapixels: 5.09, grain: true, perPixel: 0.2029 },
  ];

  it("lands within 10% of every measured sample", () => {
    for (const { megapixels, grain, perPixel } of samples) {
      const pixels = megapixels * 1e6;
      const side = Math.sqrt(pixels);
      const estimate = estimateBytes(side, side, grain);
      expect(estimate / pixels).toBeGreaterThan(perPixel * 0.9);
      expect(estimate / pixels).toBeLessThan(perPixel * 1.1);
    }
  });

  it("costs more per pixel with grain than without", () => {
    expect(estimateBytes(1408, 878, true)).toBeGreaterThan(
      estimateBytes(1408, 878, false) * 2,
    );
  });

  it("falls in bytes per pixel as the output grows", () => {
    const small = estimateBytes(1000, 1000, false) / 1e6;
    const large = estimateBytes(3000, 3000, false) / 9e6;
    expect(large).toBeLessThan(small);
  });

  it("still grows in total as the output grows", () => {
    expect(estimateBytes(3000, 3000, false)).toBeGreaterThan(
      estimateBytes(1000, 1000, false),
    );
  });
});

describe("formatBytes", () => {
  it("uses bytes under a kilobyte", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("uses whole kilobytes up to the switch", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(934_000)).toBe("912 KB");
  });

  it("switches to megabytes before an awkward four-digit KB readout", () => {
    // 1000 KB, not 1024, so "1009 KB" can never be shown.
    expect(formatBytes(1000 * 1024 - 1)).toBe("1000 KB");
    expect(formatBytes(1000 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2.1 * 1024 * 1024)).toBe("2.1 MB");
  });
});

describe("estimateVideoBytes", () => {
  it("is zero without pixels or without a length", () => {
    expect(estimateVideoBytes(0, 0, 10)).toBe(0);
    expect(estimateVideoBytes(1408, 878, 0)).toBe(0);
  });

  it("tracks the linear size, so doubling the scale roughly doubles the file", () => {
    const at1x = estimateVideoBytes(1280, 720, 10);
    const at2x = estimateVideoBytes(2560, 1440, 10);
    expect(at2x / at1x).toBeCloseTo(2, 6);
  });

  it("is linear in the clip's length", () => {
    const short = estimateVideoBytes(1280, 720, 4);
    expect(estimateVideoBytes(1280, 720, 8) / short).toBeCloseTo(2, 6);
  });

  it("lands between the still and the panning samples measured", () => {
    // Bytes per root pixel per second: about 35 for a static recording and
    // about 69 for one panning a whole window. The constant is the middle.
    const perRootPixelSecond =
      estimateVideoBytes(1280, 720, 10) / (Math.sqrt(1280 * 720) * 10);
    expect(perRootPixelSecond).toBeGreaterThan(35);
    expect(perRootPixelSecond).toBeLessThan(69);
  });

  it("charges the measured 1.4 for doubling the frame rate", () => {
    const at30 = estimateVideoBytes(1280, 720, 10, 30);
    expect(estimateVideoBytes(1280, 720, 10, 60) / at30).toBeCloseTo(1.4, 6);
  });

  it("treats anything at or under 30 as the base rate", () => {
    const at30 = estimateVideoBytes(1280, 720, 10, 30);
    expect(estimateVideoBytes(1280, 720, 10, 24)).toBe(at30);
    expect(estimateVideoBytes(1280, 720, 10)).toBe(at30);
  });
});

describe("estimateMovingBytes", () => {
  it("is nothing for an empty frame or no length", () => {
    expect(estimateMovingBytes(0, 0, 12)).toBe(0);
    expect(estimateMovingBytes(608, 428, 0)).toBe(0);
  });

  it("lands inside the measured spread at every scale", () => {
    // The fit's own samples, in bytes per second at 30 fps: Inkwell is the
    // low end and Nightshade the high one.
    const samples = [
      { w: 608, h: 428, low: 62_200, high: 106_500 },
      { w: 1216, h: 856, low: 179_500, high: 395_400 },
      { w: 1824, h: 1284, low: 351_300, high: 845_700 },
    ];
    for (const { w, h, low, high } of samples) {
      const perSecond = estimateMovingBytes(w, h, 1);
      expect(perSecond).toBeGreaterThan(low);
      expect(perSecond).toBeLessThan(high);
    }
  });

  it("costs more at 60 fps than a recording does", () => {
    const ratio = estimateMovingBytes(1216, 856, 12, 60) / estimateMovingBytes(1216, 856, 12, 30);
    expect(ratio).toBeGreaterThan(1.4);
    expect(ratio).toBeLessThan(2);
  });
});
