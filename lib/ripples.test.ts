import { describe, expect, it } from "vitest";

import { RIPPLE_SECONDS, rippleRadius, ripplesAt } from "@/lib/ripples";

const clicks = new Float32Array([1, 0.25, 0.5, 1.3, 0.75, 0.5, 4, 0.5, 0.5]);

describe("ripplesAt", () => {
  it("shows nothing before the first click", () => {
    expect(ripplesAt(clicks, 0.5)).toEqual([]);
  });

  it("shows a click from the moment it lands", () => {
    const [ripple] = ripplesAt(clicks, 1);
    expect(ripple.progress).toBe(0);
    expect(ripple.x).toBe(0.25);
  });

  it("shows two that overlap in time together", () => {
    expect(ripplesAt(clicks, 1.4)).toHaveLength(2);
  });

  it("is gone once its time is up", () => {
    expect(ripplesAt(clicks, 1 + RIPPLE_SECONDS + 0.31)).toEqual([]);
  });

  it("reads nothing from an empty track", () => {
    expect(ripplesAt(new Float32Array(0), 3)).toEqual([]);
  });
});

describe("rippleRadius", () => {
  it("grows from small to large and never shrinks", () => {
    let last = 0;
    for (let p = 0; p <= 1; p += 0.1) {
      const r = rippleRadius(p);
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
    expect(rippleRadius(0)).toBeLessThan(0.01);
    expect(rippleRadius(1)).toBeCloseTo(0.04, 10);
  });
});
