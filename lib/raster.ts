import { toPng } from "html-to-image";

/**
 * Marks a node inside the frame that must not reach the export.
 *
 * `html-to-image` serializes the frame subtree, so anything placed over the
 * picture as a control would be baked into the PNG and into the video's
 * chrome. A control that has to sit exactly on the picture, like the zoom's
 * focus marker, carries this attribute and the raster filters it out. Feedback
 * that does not need the picture's own coordinates, like the play flash, still
 * lives outside the frame instead.
 */
export const EXPORT_IGNORE = "data-export-ignore";

/** The one raster both exports and the video's chrome come from. */
export function rasterize(frame: HTMLElement, pixelRatio: number): Promise<string> {
  return toPng(frame, {
    cacheBust: true,
    pixelRatio,
    filter: (node) =>
      !(node instanceof Element && node.hasAttribute(EXPORT_IGNORE)),
  });
}
