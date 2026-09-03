/**
 * Exporting the styled video, the main-thread half.
 *
 * `html-to-image` serializes the DOM to a still and there is no version of it
 * that makes a video, so the frame is composited a frame at a time. That loop
 * lives in `lib/video-render.ts` and runs in a worker: decoding and encoding a
 * minute of 1080p is seconds of solid work, and on the main thread that is
 * seconds of a frozen tab, with the progress bar itself unable to move.
 *
 * What has to happen here is what needs the document. The frame is rasterized
 * with the same `toPng` call the PNG export makes, the video's box is measured
 * off the live DOM, and a laid soundtrack is mixed through an
 * `OfflineAudioContext`, which no worker has. The result of all three is posted
 * across and the worker does the rest.
 */

import { toPng } from "html-to-image";

import { mixAudio } from "@/lib/audio-mix";
import {
  type Box,
  type MixedAudio,
  type Radii,
  type RenderMessage,
  type RenderReply,
  even,
} from "@/lib/video-render";
import type { Soundtrack, Trim } from "@/types/screenshot";
import { QUALITY_HIGH, canEncodeVideo } from "mediabunny";

export interface VideoExportRequest {
  /** The node the PNG export rasterizes, which is the whole frame. */
  frame: HTMLElement;
  /** The element inside it the decoded frames replace. */
  video: HTMLVideoElement;
  /** The original file. */
  source: Blob;
  /** The export scale, the same number the PNG export passes as `pixelRatio`. */
  scale: number;
  /** The clip's in and out points. */
  trim: Trim;
  /** The playback rate. */
  speed?: number;
  /** Carry the clip's own sound across. Ignored when it has none, or past 1x. */
  audio?: boolean;
  /** A track laid over the clip. */
  soundtrack?: Soundtrack;
  /** Carry the laid track across. Ignored when there is none. */
  music?: boolean;
  /** The output's frame rate ceiling. */
  fps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Whether this browser can encode an output of this size.
 *
 * **Asked, never assumed.** The first version of this capped the longest edge
 * at 4096px, which is not the constraint: an H.264 level is a budget of
 * macroblocks, so a 3932x3136 frame passes a 4096 edge check while being 48020
 * macroblocks, needing level 6.0, and the encoder refuses it outright with
 * "this specific encoder configuration (avc1.64003c ...) is not supported in
 * this environment". Rewriting that check as a level table would only be a
 * better guess, and the browser already knows.
 *
 * It probes through mediabunny with the same codec and quality the export
 * uses, so the config asked about is the config that will run. The frame rate
 * is not part of it: the level is derived from the size alone.
 */
export async function canEncodeSize(
  width: number,
  height: number,
): Promise<boolean> {
  if (!canExportVideo()) return false;

  try {
    return await canEncodeVideo("avc", {
      width: even(width),
      height: even(height),
      quality: QUALITY_HIGH,
    });
  } catch {
    // A probe that cannot answer is not a reason to block the export. The
    // encode itself reports a refusal, and it says what to do about it.
    return true;
  }
}

/** WebCodecs, which everything here is built on. */
export function canExportVideo(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window;
}

/**
 * What the output's frame rate may be.
 *
 * A ceiling rather than a rate: the decimation only ever drops frames, so a
 * 30 fps source exports at 30 whichever of these is chosen, and choosing 60
 * means nothing is dropped. 30 halves the encode time and takes a good deal off
 * the file for motion a UI demo rarely shows.
 */
export const FPS_OPTIONS = [30, 60] as const;
export const DEFAULT_FPS = 60;

/**
 * The grid the trim's own handles land on, which is deliberately the coarser of
 * the two rates rather than whichever was last exported at.
 *
 * A point on the 30 fps grid is also a point on the 60 fps grid, so a trim made
 * here is exact at either rate. Following the export's choice instead would
 * move every existing in and out point the moment that choice changed.
 */
export const EDIT_FPS = 30;

/**
 * How fast the clip may play.
 *
 * 1x is the file as recorded. Anything above it is for a walkthrough that was
 * recorded at the pace of the hand doing it and is watched at the pace of the
 * eye: 1.5x for a clip with a little dead time, 2x and 3x for a long form or a
 * slow install. The clip's own sound is left out above 1x, since a browser
 * offers no offline time stretch that keeps the pitch, and voice at double
 * speed with the pitch doubled is worse than none.
 */
export const SPEED_OPTIONS = [1, 1.5, 2, 3] as const;

/** "1x", "1.5x". */
export function formatSpeed(speed: number): string {
  return `${speed}x`;
}

/**
 * Rasterizes the frame, measures where the video sits in it, mixes the sound,
 * and hands the encode to a worker.
 */
export async function exportVideo({
  frame,
  video,
  source,
  scale,
  trim,
  speed = 1,
  audio = true,
  soundtrack,
  music = true,
  fps = DEFAULT_FPS,
  onProgress,
  signal,
}: VideoExportRequest): Promise<Blob> {
  const dataUrl = await toPng(frame, { cacheBust: true, pixelRatio: scale });
  const chrome = await createImageBitmap(await (await fetch(dataUrl)).blob());
  // The raster cannot be interrupted, so the earliest a cancel during it can
  // be heard is here, before any encoder is opened.
  if (signal?.aborted) throw aborted();

  const { box, radii } = measure(frame, video, chrome);

  // The clip's own sound exists only at 1x. See `SPEED_OPTIONS`.
  const clipSound = audio && speed === 1;
  const laid = music ? soundtrack : undefined;
  // A laid track means a mix, which is a whole decode of both sources into one
  // buffer and needs the document's audio context, so it happens here. The
  // clip's own sound alone streams inside the worker instead and costs nothing
  // beyond the frames in flight.
  const mixed = laid
    ? await mixAudio({
        clip: clipSound ? source : undefined,
        soundtrack: laid,
        trim,
        speed,
      })
    : null;
  if (signal?.aborted) throw aborted();

  return encodeInWorker(
    {
      chrome,
      box,
      radii,
      source,
      trim,
      speed,
      audio: clipSound && !mixed,
      mixed: mixed ? planar(mixed) : null,
      fps,
    },
    onProgress,
    signal,
  );
}

/**
 * One worker per export. It is terminated when the reply lands, and
 * terminating it is also the cancel: that releases the encoder and every
 * decoded frame in flight in one step, with nothing left to check inside the
 * loop.
 */
function encodeInWorker(
  message: RenderMessage,
  onProgress: ((fraction: number) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./video-render.worker.ts", import.meta.url),
      { type: "module" },
    );

    const finish = () => {
      worker.terminate();
      signal?.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      finish();
      reject(aborted());
    };
    signal?.addEventListener("abort", cancel);

    worker.onmessage = (event: MessageEvent<RenderReply>) => {
      const reply = event.data;
      if (reply.type === "progress") {
        onProgress?.(reply.fraction);
      } else if (reply.type === "done") {
        finish();
        resolve(new Blob([reply.buffer], { type: "video/mp4" }));
      } else {
        finish();
        reject(new Error(reply.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "The encoder could not start"));
    };

    // Moved rather than copied. The chrome at 3x is tens of megabytes and the
    // mix is the export's own length in floats, and neither is needed here
    // once the worker has it.
    const transfer: Transferable[] = [message.chrome];
    if (message.mixed) transfer.push(message.mixed.data.buffer as ArrayBuffer);
    worker.postMessage(message, transfer);
  });
}

/**
 * An `AudioBuffer` as one planar float array, which is the shape that can be
 * posted to a worker. Bulk copies per channel rather than a sample loop.
 */
function planar(buffer: AudioBuffer): MixedAudio {
  const channels = buffer.numberOfChannels;
  const data = new Float32Array(buffer.length * channels);
  for (let c = 0; c < channels; c++) {
    data.set(buffer.getChannelData(c), c * buffer.length);
  }
  return { data, sampleRate: buffer.sampleRate, channels };
}

function aborted() {
  return new DOMException("Aborted", "AbortError");
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
  chrome: { width: number },
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
