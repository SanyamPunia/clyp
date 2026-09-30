import { describe, expect, it } from "vitest";

import { paperSvg, paperToCss, type PaperStock } from "@/lib/paper";

const plain: PaperStock = { color: "#eeeeec" };

describe("paperSvg", () => {
  it("is the same sheet every time", () => {
    const stock = { ...plain, fibres: { color: "#888888", count: 50, opacity: 0.4 }, seed: 3 };
    expect(paperSvg(stock)).toBe(paperSvg(stock));
  });

  it("draws only the parts a stock names", () => {
    const svg = paperSvg(plain);
    expect(svg).not.toContain("<filter");
    expect(svg).not.toContain("<path");
    expect(paperSvg({ ...plain, tooth: { size: 3, depth: 0.5 } })).toContain("feDiffuseLighting");
  });

  it("lights the tooth last, so everything else sits in the surface", () => {
    const svg = paperSvg({
      ...plain,
      tooth: { size: 3, depth: 0.5 },
      lines: { kind: "ruled", color: "#6a94d4", spacing: 40, opacity: 0.6 },
    });
    expect(svg.lastIndexOf("url(#t)")).toBeGreaterThan(svg.indexOf("<path"));
  });

  it("rules a line for each spacing down the sheet", () => {
    const svg = paperSvg({ ...plain, lines: { kind: "ruled", color: "#000000", spacing: 100, opacity: 1 } });
    expect(svg.match(/M0 /g)).toHaveLength(9);
  });

  it("gives each fold a crease and each panel a tone", () => {
    const svg = paperSvg({ ...plain, folds: { x: [0.5], y: [0.3, 0.6], depth: 1 } });
    expect(svg.match(/fill='url\(#f[vh]\)'/g)).toHaveLength(3);
    // Two columns of three panels.
    expect(svg.match(/<rect x='[\d.]+' y='[\d.]+'/g)).toHaveLength(6);
  });
});

describe("paperToCss", () => {
  it("lays the surface over a solid sheet", () => {
    expect(paperToCss(plain).endsWith("linear-gradient(0deg, #eeeeec 0%, #eeeeec 100%)")).toBe(true);
  });
});
