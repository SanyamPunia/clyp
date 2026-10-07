/**
 * The encode itself, written to run inside a worker.
 *
 * Nothing here touches the document. The chrome arrives already rasterized as
 * an `ImageBitmap`, the canvas is an `OffscreenCanvas`, and the frames are
 * decoded from the original file through mediabunny, which works anywhere
 * WebCodecs does. `lib/video-export.ts` is the main-thread half: it rasterizes
 * the frame, measures where the video sits in it, mixes the audio and hands
 * all of that across.
 *
 * **The chrome is rasterized once and the video is drawn over it.** Each output
 * frame is two draws: the chrome, then the decoded frame clipped to the rounded
 * rect the video occupies. Do not replace this with a Canvas2D redraw of the
 * gradient, the padding, the radius and the title bar. That is a second
 * renderer, it has to be kept in step with the DOM one forever, and the day it
 * drifts the preview starts lying about the export.
 *
 * A moving background is the one layer under the chrome that changes. It is
 * drawn by the same shader the preview runs, through `paintBackdrop`, and the
 * chrome was rasterized without it. That is not a second renderer: there is
 * one shader, and the preview and the export both call it.
 */

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
} from "mediabunny";

import { type Backdrop, backdropPhase, paintBackdrop } from "@/lib/backdrop";
import { type ZoomRegion, sourceRect, zoomAt } from "@/lib/clip-zoom";
import { type FadeRegion, fadeAt } from "@/lib/clip-fade";
import {
  TRANSITION_BLUR,
  hasDissolve,
  joinsOf,
  transitionAt,
} from "@/lib/clip-transitions";
import { normalized, project } from "@/lib/marks";
import { type Piece, lengthOf, segmentsOf } from "@/lib/clip-pieces";
import type { MotionTrack } from "@/lib/motion";
import { drawRipple, ripplesAt } from "@/lib/ripples";
import { type ShaderRenderer, createShaderRenderer } from "@/lib/shader";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A blur mark as the encode needs it: its rectangle in fractions of the
 * picture, and its radius as a fraction of the picture's width.
 */
export interface BlurRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
}

/** Top left, top right, bottom right, bottom left, matching `roundRect`. */
export type Radii = [number, number, number, number];

/**
 * A finished mix, as planar 32-bit float: every sample of channel 0, then
 * every sample of channel 1. An `AudioBuffer` cannot cross into a worker and
 * cannot be built inside one, so this is the shape it travels in.
 */
export interface MixedAudio {
  data: Float32Array;
  sampleRate: number;
  channels: number;
}

export interface RenderRequest {
  /**
   * The whole frame, already rasterized at the output scale. With a moving
   * background it was rasterized without one, and `backdrop` is painted under
   * it on every frame.
   */
  chrome: ImageBitmap;
  /** A moving background, or null when the chrome already carries it. */
  backdrop: Backdrop | null;
  /**
   * How long to run when there is no clip: an image over a moving
   * background, written as one loop of it. Ignored when there is a source.
   */
  seconds: number;
  /** Where the video sits inside it, in output pixels. */
  box: Box;
  radii: Radii;
  /** The original file, or null for an image over a moving background. */
  source: Blob | null;
  /** The clip's pieces in play order. The loop decodes each in turn. */
  pieces: Piece[];
  /** The playback rate. 2 writes the clip in half its own time. */
  speed: number;
  /** Stretches of the clip that close in on a point of the picture. */
  zooms: ZoomRegion[];
  /** Stretches where the picture arrives or leaves. */
  fades: FadeRegion[];
  /** The clip's motion track, for the regions that follow. */
  motion: MotionTrack | null;
  /** Stream the clip's own sound across. Only true at 1x with nothing laid. */
  audio: boolean;
  /** A finished mix to write instead. Present whenever a track is laid. */
  mixed: MixedAudio | null;
  /** The output's frame rate ceiling. */
  fps: number;
  /** Every mark other than a blur, rasterized at the picture's own size. */
  overlay: ImageBitmap | null;
  /** The blur marks, applied to each decoded frame. */
  blurs: BlurRegion[];
  /** The motion pass's clicks, drawn as ripples, or null for none. */
  ripples: Float32Array | null;
  onProgress?: (fraction: number) => void;
}

/** What the worker is sent: the request less its callback. */
export type RenderMessage = Omit<RenderRequest, "onProgress">;

export type RenderReply =
  | { type: "progress"; fraction: number }
  | { type: "done"; buffer: ArrayBuffer }
  | { type: "error"; message: string };

/** What the audio track is re-encoded as, when there is one to carry. */
const AUDIO_CODEC = "aac";

/**
 * The chunk silence is written in, in seconds.
 *
 * An empty stretch at the front of the audio track is not the same as a quiet
 * one: the track's own `start_time` carries the offset, and a tool that
 * ignores it plays the sound from the top of the file. So the gap is filled.
 */
const SILENCE_CHUNK = 0.1;

/** How much of a mix goes into one sample, in seconds. */
const MIX_CHUNK = 1;

/**
 * H.264 requires even dimensions, and a frame measured off the DOM lands on an
 * odd number about half the time. Rounding down loses at most one pixel from
 * each edge, which is invisible, where the alternative is an encoder that
 * refuses to configure.
 */
export const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

export async function renderVideo(request: RenderRequest): Promise<ArrayBuffer> {
  const under = request.backdrop ? backdropPainter(request.backdrop) : null;
  try {
    return request.source
      ? await renderClip(request, request.source, under)
      : await renderLoop(request, under);
  } finally {
    under?.dispose();
  }
}

/**
 * Paints the background under the chrome, at the time each frame lands.
 *
 * The shader draws on a WebGL canvas of its own at the output's size, and the
 * frame is copied from there. Held still, it draws once and every frame copies
 * the same picture.
 */
interface BackdropPainter {
  paint(ctx: OffscreenCanvasRenderingContext2D, seconds: number): void;
  dispose(): void;
}

function backdropPainter(backdrop: Backdrop): BackdropPainter {
  const renderer: ShaderRenderer | null = createShaderRenderer(
    new OffscreenCanvas(1, 1),
  );
  if (!renderer) {
    throw new Error("This browser cannot draw the moving background in an export");
  }
  return {
    paint(ctx, seconds) {
      // The corners outside the frame's radius are black in an MP4, the same
      // as a still background leaves them, and are filled every frame so a
      // previous frame's picture can never be left in them.
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      paintBackdrop(ctx, renderer, backdrop, backdropPhase(backdrop, seconds));
    },
    dispose() {
      renderer.dispose();
      backdrop.grain?.tile.close();
    },
  };
}

/** The output canvas and the file it is encoded into, set up the same for both paths. */
function openOutput(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No 2D context");

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  const frames = new CanvasSource(canvas, {
    codec: "avc",
    quality: QUALITY_HIGH,
  });
  output.addVideoTrack(frames);
  return { canvas, ctx, output, frames };
}

/**
 * An image over a moving background: the chrome, which already holds the
 * picture, drawn over the background at each frame's time, for one loop.
 * There is nothing to decode and no sound.
 */
async function renderLoop(
  { chrome, seconds, fps, onProgress }: RenderRequest,
  under: BackdropPainter | null,
): Promise<ArrayBuffer> {
  const width = even(chrome.width);
  const height = even(chrome.height);
  const { ctx, output, frames } = openOutput(width, height);
  await output.start();

  try {
    // Whole frames, so the last one ends exactly where the first begins and
    // the loop plays round without a seam.
    const count = Math.max(1, Math.round(seconds * fps));
    for (let i = 0; i < count; i++) {
      const at = i / fps;
      under?.paint(ctx, at);
      ctx.drawImage(chrome, 0, 0);
      await frames.add(at, 1 / fps);
      onProgress?.((i + 1) / count);
    }
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw refusal(error, width, height);
  }

  const { buffer } = output.target;
  if (!buffer) throw new Error("The encoder produced nothing");
  return buffer;
}

async function renderClip(
  {
    chrome,
    box,
    radii,
    pieces,
    speed,
    zooms,
    fades,
    motion,
    audio,
    mixed,
    fps,
    overlay,
    blurs,
    ripples,
    onProgress,
  }: RenderRequest,
  source: Blob,
  under: BackdropPainter | null,
): Promise<ArrayBuffer> {
  const minFrameGap = 1 / fps;
  const width = even(chrome.width);
  const height = even(chrome.height);

  const { canvas, ctx, output, frames } = openOutput(width, height);

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(source),
  });

  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("That file has no video track");

  // Each piece's footage in play order, carrying where it lands on the
  // output's clock.
  const segments = segmentsOf(pieces);
  // The output's own length. Everything written is on this clock, which runs
  // `speed` times faster than the source's.
  const length = lengthOf(pieces) / speed;
  // Each join's transition on the output's clock, from the same arithmetic the
  // preview's loop uses.
  const joins = joinsOf(pieces, speed);
  // A dissolve fades the last frame before its join out over the part after
  // it. The picture is copied here on every frame outside a dissolve, so the
  // first frame past a join still finds the one before it.
  const held = hasDissolve(joins)
    ? new OffscreenCanvas(Math.max(Math.round(box.width), 1), Math.max(Math.round(box.height), 1))
    : null;
  const heldCtx = held?.getContext("2d") ?? null;

  // Declared before the output starts, because a track cannot be added to a
  // running output. A source with no encoder for it is worse than no sound, so
  // the capability is checked here rather than assumed.
  //
  // Two shapes. A laid track arrives as a finished mix and is written in
  // chunks. The clip's own sound on its own is the common case and streams
  // sample by sample, which costs no memory beyond the frames in flight.
  const audioTrack = audio && !mixed ? await input.getPrimaryAudioTrack() : null;
  const encodable = await canEncodeAudio(AUDIO_CODEC);

  const sound =
    (mixed || audioTrack) && encodable
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

    // One decode per piece, in play order, rather than one across the whole
    // file with the unused frames thrown away. `sink.samples` seeks to the
    // keyframe at or before its in point, so footage no piece holds is time
    // the decoder never spends, and a piece played out of order is a seek.
    //
    // A sample's timestamp is absolute, so it is placed against its own
    // piece's start: a piece starting at four seconds would otherwise write
    // four seconds of nothing in front of it. The first sample can start a
    // little before its piece, and lands on the piece's own start.
    for (const segment of segments) {
      for await (const sample of sink.samples(segment.start, segment.end)) {
        const at =
          (segment.at + Math.max(sample.timestamp - segment.start, 0)) / speed;
        const slot = Math.floor(at / minFrameGap + 1e-6);
        if (slot === lastSlot) {
          carried += sample.duration || 0;
          sample.close();
          continue;
        }

        const fade = fadeAt(fades, sample.timestamp);

        under?.paint(ctx, at);
        ctx.drawImage(chrome, 0, 0);
        ctx.save();
        // Under a picture-only fade the chrome shows through, which is the
        // background: the media was left out of the raster for exactly this.
        // At 1 the draw is opaque and covers the box as it always did.
        ctx.globalAlpha = fade.media;
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.width, box.height, radii);
        ctx.clip();
        // A zoom is the same draw from a smaller source rectangle. The chrome
        // stays baked, and the rectangle comes from the same arithmetic the
        // preview's transform does, on the source's own clock. A zoom
        // transition pushes in on top of any region.
        const move = transitionAt(joins, at);
        const region = zoomAt(zooms, sample.timestamp, speed, motion);
        const zoom =
          move.scale !== 1
            ? {
                scale: (region?.scale ?? 1) * move.scale,
                focus: region?.focus ?? { x: 0.5, y: 0.5 },
              }
            : region;
        if (move.blur) {
          ctx.filter = `blur(${move.blur * TRANSITION_BLUR * box.width}px)`;
        }
        if (zoom) {
          const rect = sourceRect(
            zoom,
            sample.displayWidth,
            sample.displayHeight,
          );
          sample.draw(
            ctx,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            box.x,
            box.y,
            box.width,
            box.height,
          );
        } else {
          sample.draw(ctx, box.x, box.y, box.width, box.height);
        }
        ctx.filter = "none";

        // The marks ride the same zoom as the picture, through the same
        // arithmetic the preview's transform uses, so a blur stays on what it
        // hides and an arrow on what it points at.
        const view = project(zoom, box);
        const W = sample.displayWidth;
        const H = sample.displayHeight;

        // A blur is the frame drawn again through a filter, clipped to the
        // region. Only the region and a margin of three radii are drawn, since
        // filtering the whole frame for each blur is most of a frame's budget.
        for (const blur of blurs) {
          const r = normalized(blur);
          const radius = blur.radius * view.unit;
          const mx = (radius * 3) / view.unit;
          const my = (radius * 3) / (view.unit * (box.height / box.width));
          const x0 = Math.max(r.x - mx, 0);
          const y0 = Math.max(r.y - my, 0);
          const x1 = Math.min(r.x + r.w + mx, 1);
          const y1 = Math.min(r.y + r.h + my, 1);
          const a = view.at({ x: r.x, y: r.y });
          const c = view.at({ x: r.x + r.w, y: r.y + r.h });
          const d0 = view.at({ x: x0, y: y0 });
          const d1 = view.at({ x: x1, y: y1 });

          ctx.save();
          ctx.beginPath();
          ctx.rect(a.x, a.y, c.x - a.x, c.y - a.y);
          ctx.clip();
          ctx.filter = `blur(${radius}px)`;
          sample.draw(
            ctx,
            x0 * W,
            y0 * H,
            (x1 - x0) * W,
            (y1 - y0) * H,
            d0.x,
            d0.y,
            d1.x - d0.x,
            d1.y - d0.y,
          );
          ctx.restore();
        }

        if (overlay) {
          const { window } = view;
          ctx.drawImage(
            overlay,
            window.x * overlay.width,
            window.y * overlay.height,
            window.size * overlay.width,
            window.size * overlay.height,
            box.x,
            box.y,
            box.width,
            box.height,
          );
        }

        if (ripples) {
          for (const ripple of ripplesAt(ripples, sample.timestamp)) {
            const at = view.at(ripple);
            drawRipple(ctx, at.x, at.y, view.unit, ripple.progress);
          }
        }

        if (held && heldCtx) {
          if (move.dissolve > 0) {
            ctx.save();
            ctx.globalAlpha = move.dissolve;
            ctx.drawImage(held, box.x, box.y, box.width, box.height);
            ctx.restore();
          } else {
            heldCtx.drawImage(
              canvas,
              box.x,
              box.y,
              box.width,
              box.height,
              0,
              0,
              held.width,
              held.height,
            );
          }
        }

        // A dip is a flat colour over the picture, inside its own corners, so
        // the frame round it holds while the picture goes to black or white.
        if (move.veil) {
          ctx.save();
          ctx.globalAlpha = move.veil.alpha;
          ctx.fillStyle = move.veil.color;
          ctx.fillRect(box.x, box.y, box.width, box.height);
          ctx.restore();
        }
        ctx.restore();

        // A whole-frame fade is a veil over the finished composite rather
        // than an opacity on each layer, which would show the background
        // through the picture on the way down. Black, because that is the
        // only thing an MP4 fades to.
        if (fade.veil > 0) {
          ctx.save();
          ctx.globalAlpha = fade.veil;
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }

        const span = ((sample.duration || 0) + carried) / speed;
        carried = 0;
        lastSlot = slot;

        // Awaited, which is what applies the encoder's own backpressure.
        // Without it a short clip queues every frame at once and the tab runs
        // out of memory before the first one is written.
        await frames.add(at, span);
        // Reported after the frame is written and off its end rather than its
        // start, so the first report is above zero. Zero is what the caller
        // shows while the chrome is still rasterizing, which has no fraction
        // of its own to report.
        onProgress?.(length ? Math.min((at + span) / length, 1) : 0);

        sample.close();
      }
    }

    // After the video rather than beside it. Both tracks write in order and
    // the muxer interleaves them at finalize, and audio for a clip this length
    // is a fraction of the video's time, so it is not worth a second progress
    // phase to report.
    if (sound && mixed) {
      await writeMix(sound, mixed);
    } else if (sound && audioTrack) {
      const audioSink = new AudioSampleSink(audioTrack);
      let filled = false;
      // The output time the next sample must start at or after. A sample is
      // about 21ms of audio and a segment boundary falls inside one about
      // always, so the sample straddling a join would otherwise be written
      // twice: once at the end of one segment and again at the start of the
      // next, at a timestamp the muxer has already passed. AAC needs its
      // samples in order and not overlapping, so the later copy is dropped.
      // What is lost is the tail of one sample at each join, which is well
      // under a frame of picture.
      let next = 0;

      for (const segment of segments) {
        for await (const sample of audioSink.samples(segment.start, segment.end)) {
          // Written from the first real sample, since that is the first point
          // the source's own rate and channel count are known.
          if (!filled) {
            filled = true;
            const gap = Math.max(sample.timestamp - segment.start, 0);
            for (let at = 0; at < gap; at += SILENCE_CHUNK) {
              const quiet = silence(
                sample,
                at,
                Math.min(SILENCE_CHUNK, gap - at),
              );
              await sound.add(quiet);
              quiet.close();
            }
          }

          // The same absolute-timestamp problem the video has, and the same
          // answer. No speed here: the clip's own sound is only carried at 1x.
          // A sample straddling the piece's start lands on it.
          const at = segment.at + Math.max(sample.timestamp - segment.start, 0);

          // Outside the clip entirely, or already covered by what a previous
          // segment wrote. Dropped rather than faded, since a partial sample
          // would land at a timestamp that is already behind.
          if (at + (sample.duration || 0) <= 0 || at < next) {
            sample.close();
            continue;
          }
          if (at >= length) {
            sample.close();
            break;
          }

          next = at + (sample.duration || 0);
          sample.setTimestamp(Math.max(at, 0));
          await sound.add(sample);
          sample.close();
        }
      }
    }

    await output.finalize();
    onProgress?.(1);

    const { buffer } = output.target;
    if (!buffer) throw new Error("The encoder produced nothing");
    return buffer;
  } catch (error) {
    // Cancelling releases the encoder. Leaving it open holds on to the decoded
    // frames still in flight, which for a 1080p clip is hundreds of megabytes.
    await output.cancel().catch(() => {});

    throw refusal(error, width, height);
  }
}

/**
 * WebCodecs reports a refused configuration by quoting the codec string back,
 * which tells a reader nothing they can act on. The scale is the thing they
 * can change, so the message names the size instead. The probe should have
 * caught this before a frame was drawn, so reaching here means the encoder
 * changed its mind between being asked and being used.
 */
function refusal(error: unknown, width: number, height: number): unknown {
  if (
    error instanceof Error &&
    /not supported in this environment/i.test(error.message)
  ) {
    return new Error(
      `This browser cannot encode ${width}x${height}. Try a smaller scale.`,
    );
  }
  return error;
}

/**
 * The mix, a second at a time.
 *
 * One buffer is already the export's own length, so the placement and any
 * silence in front of a laid track are inside it rather than being a gap in
 * the stream. It is sliced rather than handed over whole so the encoder's
 * backpressure has something to act on.
 */
async function writeMix(sound: AudioSampleSource, mixed: MixedAudio) {
  const { data, sampleRate, channels } = mixed;
  const frames = data.length / channels;
  const chunk = Math.round(MIX_CHUNK * sampleRate);

  for (let at = 0; at < frames; at += chunk) {
    const take = Math.min(chunk, frames - at);
    const piece = new Float32Array(take * channels);
    for (let c = 0; c < channels; c++) {
      piece.set(data.subarray(c * frames + at, c * frames + at + take), c * take);
    }

    const sample = new AudioSample({
      data: piece,
      format: "f32-planar",
      numberOfChannels: channels,
      sampleRate,
      timestamp: at / sampleRate,
    });
    await sound.add(sample);
    // Closed rather than left to the collector, which mediabunny warns about
    // and which holds a second of floats for longer than it needs to.
    sample.close();
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
