/**
 * An SVG document as a `background-image` value, over a solid base.
 *
 * The generated backgrounds that a gradient cannot draw (fluted columns) go
 * through here, so they stay on the one property every
 * other background uses and the cross-fade, the grain layer and both exports
 * need no branch for them.
 *
 * The base is a solid layer of its own rather than a rect in the SVG, so the
 * value stays opaque even in the moment before the image decodes, which is
 * what the cross-fade relies on.
 */
export function svgBackground(svg: string, base: string): string {
  const encoded = svg
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    // html-to-image looks for `url(` in every CSS value and fetches what it
    // finds, which inside this image is a gradient or filter reference such
    // as `url(#c3)`. It requested those from the server and the export lost
    // them. Encoded, the image decodes the same and nothing matches.
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
  return `url("data:image/svg+xml,${encoded}"), linear-gradient(0deg, ${base} 0%, ${base} 100%)`;
}

/**
 * The document every generated background is written into. The outer `<svg>`
 * has no size and no viewBox, so as a background it has no intrinsic size and
 * fills the box. The inner one maps its own units onto that box.
 */
export function svgDocument(
  viewBox: string,
  preserveAspectRatio: string,
  body: string,
): string {
  return (
    `<svg xmlns='http://www.w3.org/2000/svg'>` +
    `<svg viewBox='${viewBox}' preserveAspectRatio='${preserveAspectRatio}'>` +
    body +
    `</svg></svg>`
  );
}
