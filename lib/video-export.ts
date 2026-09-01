/**
 * Exporting the styled video.
 *
 * `html-to-image` serializes the DOM to a still and there is no version of it
 * that makes a video, so the frame has to be composited a frame at a time. The
 * obvious way to do that is to redraw the whole thing in Canvas2D: the
 * gradient, the padding, the radius, the shadow, the title bar, the grain.
 * That is a second renderer, it has to be kept in step with the DOM one
 * forever, and the day it drifts the preview starts lying about the export.
 *
 * **So the chrome is rasterized once and the video is drawn over it.** One
 * `toPng` of the frame, exactly the call the PNG export already makes, bakes
 * every styled pixel including the video's own drop shadow. After that each
 * output frame is two draws: the chrome, then the decoded frame clipped to the
 * rounded rect the video occupies. The preview cannot drift from the export,
 * because the export is the preview.
 *
 * Frames come from decoding the original file rather than from scraping the
 * playing element. Seeking a `<video>` per frame is slow and only roughly
 * accurate, and capturing it while it plays pins the export to real time.
 */

import { toPng } from "html-to-image";
import type { Trim } from "@/types/screenshot";
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSampleSink,
} from "mediabunny";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Top left, top right, bottom right, bottom left, matching `roundRect`. */
export type Radii = [number, number, number, number];

export interface VideoExportRequest {
  /** The node the PNG export rasterizes, which is the whole frame. */
  frame: HTMLElement;
  /** The element inside it the decoded frames replace. */
  video: HTMLVideoElement;
  /** The original file. */
  source: Blob;
  /** The export scale, the same number the PNG export passes as `pixelRatio`. */
  scale: number;
  /** The clip's in and out points. Absent exports the whole file. */
  trim?: Trim;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface RenderRequest {
  /** The whole frame, already rasterized at the output scale. */
  chrome: CanvasImageSource & { width: number; height: number };
  /** Where the video sits inside it, in output pixels. */
  box: Box;
  radii: Radii;
  /** The original file. */
  source: Blob;
  /** The clip's in and out points. Absent exports the whole file. */
  trim?: Trim;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * The longest edge an export may have.
 *
 * H.264 encoders are specified by level rather than by pixels, and 4096 is
 * where the levels every browser actually ships stop. Past it the encoder
 * refuses to configure, so the scale that would produce it is not offered.
 */
export const MAX_VIDEO_EDGE = 4096;

/** WebCodecs, which everything here is built on. */
export function canExportVideo(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window;
}

/**
 * H.264 requires even dimensions, and a frame measured off the DOM lands on an
 * odd number about half the time. Rounding down loses at most one pixel from
 * each edge, which is invisible, where the alternative is an encoder that
 * refuses to configure.
 */
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/**
 * The output's frame rate ceiling.
 *
 * A 60 fps screen recording costs twice the encode time and close to twice the
 * file for motion nobody reads in a UI demo. A source already at or under this
 * is untouched, since the test is per sample rather than a resample.
 */
export const MAX_FPS = 30;
const MIN_FRAME_GAP = 1 / MAX_FPS;

export async function renderVideo({
  chrome,
  box,
  radii,
  source,
  trim,
  onProgress,
  signal,
}: RenderRequest): Promise<Blob> {
  const width = even(chrome.width);
  const height = even(chrome.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No 2D context");

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(source),
  });

  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("That file has no video track");

  const full = await input.computeDuration();
  const from = trim?.start ?? 0;
  const to = trim?.end ?? full;
  const length = Math.max(to - from, 0);

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });

  const frames = new CanvasSource(canvas, {
    codec: "avc",
    quality: QUALITY_HIGH,
  });
  output.addVideoTrack(frames);
  await output.start();

  try {
    const sink = new VideoSampleSink(track);

    // Decimation is by slot rather than by an interval since the last kept
    // frame. A running deadline accumulates float error against timestamps
    // that are exact multiples of the source's own period, so a 60 fps clip
    // dropped 96 of 180 frames instead of 90 and came out unevenly spaced.
    // Flooring into a slot with a small tolerance cannot drift, and a source
    // already at or under the ceiling maps every frame to its own slot and
    // passes through untouched.
    //
    // A dropped sample's time is carried onto the next kept one, so the frames
    // that survive still tile the clip's real duration. `CanvasSource.add`
    // captures the canvas as it is called, so this cannot be done with a
    // lookahead: the pixels of a frame not yet drawn are not available.
    let lastSlot = -1;
    let carried = 0;

    // A sample's timestamp is absolute, so a trim that starts at four seconds
    // would write an MP4 whose first frame is at four seconds: four seconds of
    // nothing at the front. Everything downstream works on the offset time.
    for await (const sample of sink.samples(from, to)) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const at = Math.max(sample.timestamp - from, 0);
      const slot = Math.floor(at / MIN_FRAME_GAP + 1e-6);
      if (slot === lastSlot) {
        carried += sample.duration || 0;
        sample.close();
        continue;
      }

      ctx.drawImage(chrome, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.width, box.height, radii);
      ctx.clip();
      sample.draw(ctx, box.x, box.y, box.width, box.height);
      ctx.restore();

      const span = (sample.duration || 0) + carried;
      carried = 0;
      lastSlot = slot;

      // Awaited, which is what applies the encoder's own backpressure. Without
      // it a short clip queues every frame at once and the tab runs out of
      // memory before the first one is written.
      await frames.add(at, span);
      // Reported after the frame is written and off its end rather than its
      // start, so the first report is above zero. Zero is what the caller
      // shows while the chrome is still rasterizing, which has no fraction of
      // its own to report.
      onProgress?.(length ? Math.min((at + span) / length, 1) : 0);

      sample.close();
    }

    await output.finalize();
    onProgress?.(1);

    const { buffer } = output.target;
    if (!buffer) throw new Error("The encoder produced nothing");
    return new Blob([buffer], { type: "video/mp4" });
  } catch (error) {
    // Cancelling releases the encoder. Leaving it open holds on to the decoded
    // frames still in flight, which for a 1080p clip is hundreds of megabytes.
    await output.cancel().catch(() => {});
    throw error;
  }
}

/**
 * Rasterizes the frame, measures where the video sits in it, and encodes.
 */
export async function exportVideo({
  frame,
  video,
  source,
  scale,
  trim,
  onProgress,
  signal,
}: VideoExportRequest): Promise<Blob> {
  const dataUrl = await toPng(frame, { cacheBust: true, pixelRatio: scale });
  const chrome = await loadImage(dataUrl);
  // The raster cannot be interrupted, so the earliest a cancel during it can
  // be heard is here, before any encoder is opened.
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const { box, radii } = measure(frame, video, chrome);

  return renderVideo({ chrome, box, radii, source, trim, onProgress, signal });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The frame could not be rasterized"));
    image.src = src;
  });
}

/**
 * Where the video sits inside the rasterized frame, in output pixels.
 *
 * Both factors are ratios against the raster rather than against the export
 * scale, so they absorb the canvas zoom, which is a transform on a wrapper
 * above the frame and therefore in both rects, and they absorb `toPng`'s own
 * rounding, so the clip lands on the pixel the chrome was baked at.
 *
 * A radius is read from computed style, which is unaffected by that transform,
 * so it takes the layout ratio instead.
 */
function measure(
  frame: HTMLElement,
  video: HTMLVideoElement,
  chrome: HTMLImageElement,
): { box: Box; radii: Radii } {
  const frameRect = frame.getBoundingClientRect();
  const videoRect = video.getBoundingClientRect();

  const onScreen = chrome.width / frameRect.width;
  const inLayout = chrome.width / frame.offsetWidth;

  const style = getComputedStyle(video);
  const radius = (value: string) =>
    (Number.parseFloat(value) || 0) * inLayout;

  return {
    box: {
      x: (videoRect.left - frameRect.left) * onScreen,
      y: (videoRect.top - frameRect.top) * onScreen,
      width: videoRect.width * onScreen,
      height: videoRect.height * onScreen,
    },
    radii: [
      radius(style.borderTopLeftRadius),
      radius(style.borderTopRightRadius),
      radius(style.borderBottomRightRadius),
      radius(style.borderBottomLeftRadius),
    ],
  };
}
