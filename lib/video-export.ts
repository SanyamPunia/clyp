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
import type { Soundtrack, Trim } from "@/types/screenshot";
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSampleSink,
  canEncodeAudio,
  canEncodeVideo,
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
  /** Carry the audio across. Ignored when there is none to carry. */
  audio?: boolean;
  /** A track laid over the clip, which replaces the source's own. */
  soundtrack?: Soundtrack;
  /** The output's frame rate ceiling. */
  fps?: number;
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
  /** Carry the audio across. Ignored when there is none to carry. */
  audio?: boolean;
  /** A track laid over the clip, which replaces the source's own. */
  soundtrack?: Soundtrack;
  /** The output's frame rate ceiling. */
  fps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** What the audio track is re-encoded as, when there is one to carry. */
const AUDIO_CODEC = "aac";

/**
 * The chunk silence is written in, in seconds.
 *
 * A soundtrack placed part way through a clip leaves the audio track empty
 * before it, and an empty stretch is not the same as a quiet one: the track's
 * own `start_time` carries the offset, and a tool that ignores it plays the
 * music from the top of the file instead of where it was placed. Measured on
 * an export with the region at 5.2s: `start_time=5.066667` with 3.97s of
 * samples, and a straight decode put the music at zero. So the gap is filled.
 */
const SILENCE_CHUNK = 0.1;

/**
 * H.264 requires even dimensions, and a frame measured off the DOM lands on an
 * odd number about half the time. Rounding down loses at most one pixel from
 * each edge, which is invisible, where the alternative is an encoder that
 * refuses to configure.
 */
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

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
 * A ceiling rather than a rate: the decimation below only ever drops frames, so
 * a 30 fps source exports at 30 whichever of these is chosen, and choosing 60
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

export async function renderVideo({
  chrome,
  box,
  radii,
  source,
  trim,
  audio = true,
  soundtrack,
  fps = DEFAULT_FPS,
  onProgress,
  signal,
}: RenderRequest): Promise<Blob> {
  const minFrameGap = 1 / fps;
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

  // Declared before the output starts, because a track cannot be added to a
  // running output. A source with no encoder for it is worse than no sound, so
  // the capability is checked here rather than assumed.
  //
  // A soundtrack replaces the source's own audio rather than mixing with it.
  // Mixing means decoding both to PCM and summing, and a laid-over track is
  // almost always meant to be the sound rather than an addition to it.
  const laid = audio && soundtrack ? await openAudio(soundtrack.blob) : null;
  const audioTrack = laid ?? (audio ? await input.getPrimaryAudioTrack() : null);
  const sound =
    audioTrack && (await canEncodeAudio(AUDIO_CODEC))
      ? new AudioSampleSource({ codec: AUDIO_CODEC, quality: QUALITY_HIGH })
      : null;
  if (sound) output.addAudioTrack(sound);

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
      const slot = Math.floor(at / minFrameGap + 1e-6);
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

    // After the video rather than beside it. Both tracks write in order and
    // the muxer interleaves them at finalize, and audio for a clip this length
    // is a fraction of the video's time, so it is not worth a second progress
    // phase to report.
    if (sound && audioTrack) {
      const audioSink = new AudioSampleSink(audioTrack);
      // A soundtrack carries its own slice and its own place on the clip's
      // axis. The source's own track has neither: it is already in step with
      // the picture, so its slice is the trim and its place is where it is.
      const slice = soundtrack && laid
        ? { from: soundtrack.start, to: soundtrack.end }
        : { from, to };
      const shift = soundtrack && laid ? soundtrack.offset - from : -from;

      let filled = false;

      for await (const sample of audioSink.samples(slice.from, slice.to)) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        // Written from the first real sample, since that is the first point the
        // source's own rate and channel count are known.
        if (!filled) {
          filled = true;
          const gap = Math.max(sample.timestamp - slice.from + shift, 0);
          for (let at = 0; at < gap; at += SILENCE_CHUNK) {
            await sound.add(
              silence(sample, at, Math.min(SILENCE_CHUNK, gap - at)),
            );
          }
        }

        // The same absolute-timestamp problem the video has, and the same
        // answer: a trim starting at six seconds would otherwise write six
        // seconds of silence before the sound starts. A soundtrack adds its
        // own placement to that, which is what puts it in sync.
        const at = sample.timestamp - slice.from + shift;

        // Outside the clip entirely. Before it is dropped rather than faded
        // in, since a partial sample would land at a negative timestamp.
        if (at + (sample.duration || 0) <= 0) {
          sample.close();
          continue;
        }
        if (at >= length) {
          sample.close();
          break;
        }

        sample.setTimestamp(Math.max(at, 0));
        await sound.add(sample);
        sample.close();
      }
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

    // WebCodecs reports a refused configuration by quoting the codec string
    // back, which tells a reader nothing they can act on. The scale is the
    // thing they can change, so the message names the size instead. The probe
    // should have caught this before a frame was drawn, so reaching here means
    // the encoder changed its mind between being asked and being used.
    if (
      error instanceof Error &&
      /not supported in this environment/i.test(error.message)
    ) {
      throw new Error(
        `This browser cannot encode ${width}x${height}. Try a smaller scale.`,
      );
    }
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
  audio,
  soundtrack,
  fps,
  onProgress,
  signal,
}: VideoExportRequest): Promise<Blob> {
  const dataUrl = await toPng(frame, { cacheBust: true, pixelRatio: scale });
  const chrome = await loadImage(dataUrl);
  // The raster cannot be interrupted, so the earliest a cancel during it can
  // be heard is here, before any encoder is opened.
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const { box, radii } = measure(frame, video, chrome);

  return renderVideo({
    chrome,
    box,
    radii,
    source,
    trim,
    audio,
    soundtrack,
    fps,
    onProgress,
    signal,
  });
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

/** The laid-over file's own audio track, or null if it has none to read. */
async function openAudio(blob: Blob) {
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(blob),
    });
    return await input.getPrimaryAudioTrack();
  } catch {
    return null;
  }
}

/**
 * A run of quiet, in the shape of a sample that already exists.
 *
 * `f32` interleaved is what a `Float32Array` of zeros already is, whatever the
 * source's own format was, so nothing has to be converted.
 */
function silence(like: AudioSample, timestamp: number, duration: number) {
  const frames = Math.max(Math.round(duration * like.sampleRate), 1);

  return new AudioSample({
    data: new Float32Array(frames * like.numberOfChannels),
    format: "f32",
    numberOfChannels: like.numberOfChannels,
    sampleRate: like.sampleRate,
    timestamp,
  });
}
