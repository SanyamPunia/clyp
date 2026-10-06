/**
 * A moving background, painted under a finished raster.
 *
 * `html-to-image` takes one still of the DOM, so a background that changes
 * every frame cannot be part of that still. The frame is rasterized with its
 * background layers left out instead (`EXPORT_BACKDROP` in `lib/raster.ts`),
 * and this paints the shader and the grain under it: once for a PNG, and once
 * a frame inside the encode's worker.
 *
 * **Alpha compositing is associative, which is what makes this exact.** The
 * raster without its background is every layer above the background,
 * composited together, with the background's area left transparent. Drawing
 * that over the background gives the same pixels as drawing everything in one
 * pass, the media's drop shadow included. The grain is the one layer that is
 * not a plain over: it is an overlay blend onto the background alone, so it is
 * left out of the raster with the background and blended here, before the
 * raster goes on top.
 *
 * Nothing here touches the document, so the worker runs the same code.
 */

import { type ShaderField, type ShaderRenderer, phaseAt } from "@/lib/shader";

export interface Grain {
  /** The 64px noise tile. */
  tile: ImageBitmap;
  /** From `grainOpacity`. */
  opacity: number;
  /** Output pixels per layout pixel, which is how large a tile is drawn. */
  scale: number;
}

/** A moving background as an export needs it. */
export interface Backdrop {
  field: ShaderField;
  /** From `BACKGROUND_SPEEDS`. 0 holds it at `moment`. */
  speed: number;
  /** The phase it holds at, or starts from. */
  moment: number;
  /** The frame's outer radius, in output pixels. */
  radius: number;
  grain: Grain | null;
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Paints the backdrop at a phase over the whole canvas, clipped to the frame's
 * rounded corners. Outside them the canvas is left as it was: transparent for
 * a PNG, black for an MP4, which is what each already shows there.
 */
export function paintBackdrop(
  ctx: Context2D,
  renderer: ShaderRenderer,
  backdrop: Backdrop,
  phase: number,
): void {
  const { width, height } = ctx.canvas;
  renderer.draw(backdrop.field, phase, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, backdrop.radius);
  ctx.clip();
  ctx.drawImage(renderer.canvas, 0, 0, width, height);

  const grain = backdrop.grain;
  if (grain && grain.opacity > 0) {
    const pattern = ctx.createPattern(grain.tile, "repeat");
    if (pattern) {
      pattern.setTransform(new DOMMatrix().scale(grain.scale));
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = grain.opacity;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    }
  }
  ctx.restore();
}

/** The phase a backdrop is at, `seconds` into an export. */
export function backdropPhase(backdrop: Backdrop, seconds: number): number {
  return phaseAt(seconds, backdrop.speed, backdrop.moment);
}
