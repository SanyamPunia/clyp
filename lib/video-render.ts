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

import {
  type MotionTracks,
  type ZoomRegion,
  sourceRect,
  zoomAt,
} from "@/lib/clip-zoom";
import type { Trim } from "@/types/screenshot";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
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
  /** The whole frame, already rasterized at the output scale. */
  chrome: ImageBitmap;
  /** Where the video sits inside it, in output pixels. */
  box: Box;
  radii: Radii;
  /** The original file. */
  source: Blob;
  /** The clip's in and out points. */
  trim: Trim;
  /** The playback rate. 2 writes the clip in half its own time. */
  speed: number;
  /** Stretches of the clip that close in on a point of the picture. */
  zooms: ZoomRegion[];
  /** The motion tracks for the regions that follow, by region id. */
  tracks: MotionTracks;
  /** Stream the clip's own sound across. Only true at 1x with nothing laid. */
  audio: boolean;
  /** A finished mix to write instead. Present whenever a track is laid. */
  mixed: MixedAudio | null;
  /** The output's frame rate ceiling. */
  fps: number;
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

export async function renderVideo({
  chrome,
  box,
  radii,
  source,
  trim,
  speed,
  zooms,
  tracks,
  audio,
  mixed,
  fps,
  onProgress,
}: RenderRequest): Promise<ArrayBuffer> {
  const minFrameGap = 1 / fps;
  const width = even(chrome.width);
  const height = even(chrome.height);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No 2D context");

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(source),
  });

  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("That file has no video track");

  const from = trim.start;
  const to = trim.end;
  // The output's own length. Everything written is on this clock, which runs
  // `speed` times faster than the source's.
  const length = Math.max(to - from, 0) / speed;

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

    // A sample's timestamp is absolute, so a trim that starts at four seconds
    // would write an MP4 whose first frame is at four seconds: four seconds of
    // nothing at the front. Everything downstream works on the offset time,
    // divided by the speed, which is what makes 2x a file half as long.
    for await (const sample of sink.samples(from, to)) {
      const at = Math.max(sample.timestamp - from, 0) / speed;
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
      // A zoom is the same draw from a smaller source rectangle. The chrome
      // stays baked, and the rectangle comes from the same arithmetic the
      // preview's transform does, on the source's own clock.
      const zoom = zoomAt(zooms, sample.timestamp, speed, tracks);
      if (zoom) {
        const rect = sourceRect(zoom, sample.displayWidth, sample.displayHeight);
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
      ctx.restore();

      const span = ((sample.duration || 0) + carried) / speed;
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
    if (sound && mixed) {
      await writeMix(sound, mixed);
    } else if (sound && audioTrack) {
      const audioSink = new AudioSampleSink(audioTrack);
      let filled = false;

      for await (const sample of audioSink.samples(from, to)) {
        // Written from the first real sample, since that is the first point the
        // source's own rate and channel count are known.
        if (!filled) {
          filled = true;
          const gap = Math.max(sample.timestamp - from, 0);
          for (let at = 0; at < gap; at += SILENCE_CHUNK) {
            const quiet = silence(sample, at, Math.min(SILENCE_CHUNK, gap - at));
            await sound.add(quiet);
            quiet.close();
          }
        }

        // The same absolute-timestamp problem the video has, and the same
        // answer. No speed here: the clip's own sound is only carried at 1x.
        const at = sample.timestamp - from;

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
    return buffer;
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
