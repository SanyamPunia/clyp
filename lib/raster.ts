import { toPng } from "html-to-image";

import { type Backdrop, paintBackdrop } from "@/lib/backdrop";
import { NOISE_TILE_URL } from "@/lib/noise";
import { type ShaderField, createShaderRenderer } from "@/lib/shader";

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

/**
 * Marks the background's layers: the gradient, the grain over it and the
 * live shader canvas.
 *
 * A moving background cannot be one still of the DOM, so when one is showing
 * the frame is rasterized without these and `paintBackdrop` in
 * `lib/backdrop.ts` paints the shader and the grain under the result. With a
 * still background they rasterize like anything else.
 */
export const EXPORT_BACKDROP = "data-export-backdrop";

/**
 * The phase the live shader last drew, written on its canvas every frame.
 * A still export reads it off the DOM, so the PNG is the frame on screen.
 */
export const BACKDROP_PHASE = "data-backdrop-phase";

/**
 * Marks a blur mark, with its radius in picture pixels as the value.
 *
 * A blur is shown with `backdrop-filter`, which `html-to-image` cannot
 * serialize into its SVG, so the element is left out of the raster and the
 * blur is applied to the finished pixels afterwards by `bakeBlurs`. The
 * element stays in the DOM because it is what says where the blur sits.
 */
export const MARK_BLUR = "data-mark-blur";

/** Marks the layer the marks sit in, with the picture's width as the value. */
export const MARK_LAYER = "data-mark-layer";

/**
 * The export's size: a scale of the frame's own size, or exact pixels.
 *
 * Exact pixels are what a template asks for. `pixelRatio` stays at 1 and the
 * canvas is sized to the target, so `html-to-image` draws the frame's SVG
 * straight into it: text and shapes rasterize at the target size rather than
 * being resampled from another one.
 */
export type RasterSize = number | { width: number; height: number };

interface RasterOptions {
  /** Leave the media out, so a fade shows the background through its box. */
  dropMedia?: boolean;
  /** Leave the background out, so a moving one can be painted under it. */
  dropBackdrop?: boolean;
}

const keep = (options: RasterOptions) => (node: Node) => {
  if (!(node instanceof Element)) return true;
  if (node.hasAttribute(EXPORT_IGNORE)) return false;
  if (options.dropBackdrop && node.hasAttribute(EXPORT_BACKDROP)) return false;
  return !(options.dropMedia && node.hasAttribute(EXPORT_MEDIA));
};

/** The one raster both exports and the video's chrome come from. */
export function rasterize(
  frame: HTMLElement,
  size: RasterSize,
  options: RasterOptions = {},
): Promise<string> {
  const exact = typeof size === "object";
  return toPng(frame, {
    cacheBust: true,
    pixelRatio: exact ? 1 : size,
    ...(exact && { canvasWidth: size.width, canvasHeight: size.height }),
    filter: keep(options),
  });
}

/**
 * The marks layer on its own, at the picture's own size, for the video
 * encode to draw over every decoded frame.
 *
 * The preview may be mid-zoom, and the layer carries the same transform as
 * the video, so the clone is set back to none: the encode applies each
 * frame's zoom to this itself.
 */
export function rasterizeMarks(
  layer: HTMLElement,
  width: number,
  height: number,
): Promise<string> {
  return toPng(layer, {
    cacheBust: true,
    pixelRatio: 1,
    canvasWidth: width,
    canvasHeight: height,
    style: { transform: "none" },
    filter: keep({}),
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The export could not be read back"));
    image.src = src;
  });
}

const intersect = (a: DOMRect, b: DOMRect) => {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : null;
};

/**
 * Applies every blur mark in the frame to a finished raster.
 *
 * Each blur is measured off the live DOM against the frame, the same two
 * ratios the video composite uses, so the canvas zoom and a clip's own zoom
 * are both in the rects and nothing needs the scale. A blur is clipped to the
 * picture's box, since the layer can be larger than the box it shows through
 * while a clip is zoomed.
 *
 * The source for each blur is the raster as it was, not the canvas as it is
 * being written, so two blurs that overlap do not blur each other twice. A
 * margin of three radii is drawn round the region, so the edge of the region
 * is blurred against real pixels rather than against transparency.
 */
export async function bakeBlurs(
  dataUrl: string,
  frame: HTMLElement,
): Promise<string> {
  const blurs = [...frame.querySelectorAll<HTMLElement>(`[${MARK_BLUR}]`)];
  if (blurs.length === 0) return dataUrl;

  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0);

  const frameRect = frame.getBoundingClientRect();
  const kx = canvas.width / frameRect.width;
  const ky = canvas.height / frameRect.height;

  for (const element of blurs) {
    const layer = element.closest<HTMLElement>(`[${MARK_LAYER}]`);
    if (!layer) continue;
    const layerRect = layer.getBoundingClientRect();
    const boxRect = layer.parentElement?.getBoundingClientRect() ?? layerRect;
    const shown = intersect(element.getBoundingClientRect(), boxRect);
    if (!shown) continue;

    const pictureWidth = Number(layer.getAttribute(MARK_LAYER)) || layerRect.width;
    const radius =
      Number(element.getAttribute(MARK_BLUR)) * (layerRect.width / pictureWidth) * kx;
    const x = (shown.left - frameRect.left) * kx;
    const y = (shown.top - frameRect.top) * ky;
    const w = shown.width * kx;
    const h = shown.height * ky;
    const m = radius * 3;
    const sx = Math.max(x - m, 0);
    const sy = Math.max(y - m, 0);
    const sw = Math.min(x + w + m, canvas.width) - sx;
    const sh = Math.min(y + h + m, canvas.height) - sy;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(image, sx, sy, sw, sh, sx, sy, sw, sh);
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}

/** A moving background in the frame's own layout pixels. */
export interface BackdropSpec {
  field: ShaderField;
  speed: number;
  moment: number;
  /** The frame's outer radius, in layout pixels. */
  radius: number;
  /** The grain's opacity, from `grainOpacity`. */
  grain: number;
}

/**
 * A backdrop at the size of a raster of the frame.
 *
 * The scale is the raster's width over the frame's layout width, the ratio
 * the video composite measures its radius by, so the canvas zoom is not in it
 * and a template's exact pixels are.
 */
export async function scaleBackdrop(
  spec: BackdropSpec,
  frame: HTMLElement,
  rasterWidth: number,
): Promise<Backdrop> {
  const scale = rasterWidth / frame.offsetWidth;
  const tile =
    spec.grain > 0
      ? await createImageBitmap(await (await fetch(NOISE_TILE_URL)).blob())
      : null;
  return {
    field: spec.field,
    speed: spec.speed,
    moment: spec.moment,
    radius: spec.radius * scale,
    grain: tile ? { tile, opacity: spec.grain, scale } : null,
  };
}

/**
 * A raster taken without its background, with the moving background painted
 * under it at one phase. Its own renderer, released before returning: an
 * export is rare, and a context held for it would count against the handful a
 * browser allows for the whole page.
 */
export async function underBackdrop(
  dataUrl: string,
  frame: HTMLElement,
  spec: BackdropSpec,
  phase: number,
): Promise<string> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  const renderer = createShaderRenderer(new OffscreenCanvas(1, 1));
  if (!ctx || !renderer) {
    throw new Error("This browser cannot draw the moving background");
  }

  try {
    const backdrop = await scaleBackdrop(spec, frame, canvas.width);
    paintBackdrop(ctx, renderer, backdrop, phase);
    backdrop.grain?.tile.close();
    ctx.drawImage(image, 0, 0);
  } finally {
    renderer.dispose();
  }
  return canvas.toDataURL("image/png");
}

/** Cuts a raster into rectangles, one PNG each, for a carousel's slides. */
export async function slice(
  dataUrl: string,
  rects: readonly { x: number; y: number; width: number; height: number }[],
): Promise<Blob[]> {
  const image = await loadImage(dataUrl);
  return Promise.all(
    rects.map(
      (rect) =>
        new Promise<Blob>((resolve, reject) => {
          const canvas = document.createElement("canvas");
          canvas.width = rect.width;
          canvas.height = rect.height;
          canvas
            .getContext("2d")
            ?.drawImage(
              image,
              rect.x,
              rect.y,
              rect.width,
              rect.height,
              0,
              0,
              rect.width,
              rect.height,
            );
          canvas.toBlob(
            (blob) =>
              blob ? resolve(blob) : reject(new Error("A slide could not be written")),
            "image/png",
          );
        }),
    ),
  );
}
