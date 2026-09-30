import { describe, expect, it } from "vitest";

import { svgBackground } from "@/lib/svg-background";

describe("svgBackground", () => {
  const css = svgBackground(
    "<svg><rect fill='url(#g)' width='50%'/></svg>",
    "#123456",
  );
  const image = css.slice(0, css.indexOf('"),') + 2);

  it("leaves no url( inside the image for html-to-image to fetch", () => {
    // It fetched `url(#g)` from the server, and the export lost the gradient.
    expect(image.slice(4)).not.toContain("url(");
  });

  it("escapes what would end or break the data URL", () => {
    expect(image).not.toContain("#");
    expect(image).toContain("50%25");
  });

  it("decodes back to the document it was given", () => {
    const data = image.slice('url("data:image/svg+xml,'.length, -2);
    expect(decodeURIComponent(data)).toBe("<svg><rect fill='url(#g)' width='50%'/></svg>");
  });

  it("lays the image over a solid base", () => {
    expect(css.endsWith("linear-gradient(0deg, #123456 0%, #123456 100%)")).toBe(true);
  });
});
