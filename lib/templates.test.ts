import { describe, expect, it } from "vitest";

import {
  MAX_SLIDES,
  enlargement,
  getTemplate,
  outputFor,
  platforms,
  slideCount,
  slideRects,
  templateName,
  templateRatio,
  templates,
} from "@/lib/templates";

describe("templates", () => {
  it("has even dimensions everywhere, which H.264 needs", () => {
    for (const t of templates) {
      expect(t.width % 2, t.id).toBe(0);
      expect(t.height % 2, t.id).toBe(0);
    }
  });

  it("gives every template a unique id and a unique name", () => {
    const ids = templates.map((t) => t.id);
    const names = templates.map(templateName);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("puts every template under a platform the picker lists", () => {
    const listed = new Set(platforms.map((p) => p.id));
    for (const t of templates) expect(listed.has(t.platform), t.id).toBe(true);
  });

  it("keeps each safe zone inside its template", () => {
    for (const t of templates) {
      if (!t.safe) continue;
      expect(t.safe.top + t.safe.bottom, t.id).toBeLessThan(t.height);
      expect(t.safe.left + t.safe.right, t.id).toBeLessThan(t.width);
    }
  });

  it("matches the sizes checked on 2026-09-28", () => {
    expect(outputFor(getTemplate("ig-portrait")!)).toEqual({ width: 1080, height: 1350 });
    expect(outputFor(getTemplate("ig-story")!)).toEqual({ width: 1080, height: 1920 });
    expect(outputFor(getTemplate("x-post")!)).toEqual({ width: 1600, height: 900 });
    expect(outputFor(getTemplate("li-landscape")!)).toEqual({ width: 1200, height: 628 });
    expect(outputFor(getTemplate("web-og")!)).toEqual({ width: 1200, height: 630 });
  });

  it("matches the sizes checked on 2026-09-30", () => {
    expect(outputFor(getTemplate("x-header")!)).toEqual({ width: 1500, height: 500 });
    expect(outputFor(getTemplate("li-banner")!)).toEqual({ width: 1584, height: 396 });
    expect(outputFor(getTemplate("gh-social")!)).toEqual({ width: 1280, height: 640 });
    expect(outputFor(getTemplate("as-iphone")!)).toEqual({ width: 1320, height: 2868 });
    expect(outputFor(getTemplate("gp-feature")!)).toEqual({ width: 1024, height: 500 });
    expect(outputFor(getTemplate("cws-marquee")!)).toEqual({ width: 1400, height: 560 });
  });

  it("keeps a YouTube banner's safe zone to the middle every device shows", () => {
    const banner = getTemplate("yt-banner")!;
    const safe = banner.safe!;
    expect(banner.width - safe.left - safe.right).toBe(1546);
    expect(banner.height - safe.top - safe.bottom).toBe(423);
  });
});

describe("slides", () => {
  const portrait = getTemplate("ig-portrait")!;
  const story = getTemplate("ig-story")!;

  it("is one for a format that cannot be a carousel, whatever was stored", () => {
    expect(slideCount(story, 5)).toBe(1);
    expect(slideCount(null, 5)).toBe(1);
  });

  it("clamps to the platform's range", () => {
    expect(slideCount(portrait, 0)).toBe(1);
    expect(slideCount(portrait, 3)).toBe(3);
    expect(slideCount(portrait, 99)).toBe(MAX_SLIDES);
  });

  it("lays the slides side by side in one frame", () => {
    expect(outputFor(portrait, 3)).toEqual({ width: 3240, height: 1350 });
    expect(templateRatio(portrait, 3)).toBeCloseTo(3240 / 1350, 10);
  });

  it("splits the frame into slides that tile it exactly", () => {
    const rects = slideRects(portrait, 3);
    expect(rects).toHaveLength(3);
    expect(rects[0]).toEqual({ x: 0, y: 0, width: 1080, height: 1350 });
    expect(rects[2].x + rects[2].width).toBe(outputFor(portrait, 3).width);
  });
});

describe("enlargement", () => {
  const portrait = getTemplate("ig-portrait")!;

  it("is 1 when the frame is larger than the template", () => {
    expect(enlargement({ width: 1408, height: 1760 }, portrait)).toBe(1);
  });

  it("is the stretch when the frame is smaller", () => {
    expect(enlargement({ width: 540, height: 675 }, portrait)).toBe(2);
  });

  it("measures a carousel against the whole strip", () => {
    expect(enlargement({ width: 1620, height: 675 }, portrait, 3)).toBe(2);
  });
});
