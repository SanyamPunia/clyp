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

/**
 * Marks the media itself, so the video export can leave it out.
 *
 * `html-to-image` substitutes a still of the current frame for a `<video>`,
 * and the composite then draws every decoded frame over that same box. At full
 * opacity the still is covered and nothing shows. Under a fade it would be
 * what shows through, instead of the background, so a clip with fades
 * rasterizes its chrome without the media and the box is a shadowed hole over
 * the gradient.
 */
export const EXPORT_MEDIA = "data-export-media";

/** The one raster both exports and the video's chrome come from. */
export function rasterize(
  frame: HTMLElement,
  pixelRatio: number,
  options: { dropMedia?: boolean } = {},
): Promise<string> {
  return toPng(frame, {
    cacheBust: true,
    pixelRatio,
    filter: (node) => {
      if (!(node instanceof Element)) return true;
      if (node.hasAttribute(EXPORT_IGNORE)) return false;
      return !(options.dropMedia && node.hasAttribute(EXPORT_MEDIA));
    },
  });
}
