/**
 * Mixing the clip's own sound with a laid track.
 *
 * A soundtrack used to replace the clip's audio outright, which is one sound
 * or the other and needs no mixing. "Music on top of it" is two, so this
 * exists: both are read, placed on one timeline, and summed.
 *
 * **`OfflineAudioContext` does the summing rather than hand-written PCM
 * maths.** Two files rarely share a sample rate, a 48kHz recording under a
 * 44.1kHz track being the ordinary case, and resampling by hand is where that
 * kind of code goes wrong. A context resamples whatever buffer it is handed,
 * schedules by time rather than by sample index, and sums its inputs.
 *
 * **What it is handed is only the part that will be heard.** The first version
 * read each file with `decodeAudioData`, which decodes all of it: a 30 minute
 * track laid over a 20 second clip decoded 30 minutes, and at 48kHz that is
 * 346 MB measured, twice over, for four seconds of sound. Reading a range
 * through mediabunny instead means the file's own length stops mattering and
 * only the export's counts.
 *
 * **A cut clip is read as one range per kept segment and scheduled into place.**
 * Scheduling is what a context is for, so the segments are handed to it at
 * their own output times rather than being copied into one buffer by hand. All
 * of them come off a single decoder: opening one `Input` per segment would hold
 * that many decode states on the same forty megabyte Blob at once.
 */

import {
  ALL_FORMATS,
  AudioSampleSink,
  BlobSource,
  Input,
} from "mediabunny";

import {
  type Cut,
  type Segment,
  keptSeconds,
  keptSegments,
  toOutput,
} from "@/lib/clip-cuts";
import type { Soundtrack, Trim } from "@/types/screenshot";

/** What the mix is summed at, and what the encoder is handed. */
const RATE = 48000;
const CHANNELS = 2;

/**
 * The longest export the two can be mixed over.
 *
 * Three buffers are live at the peak, the two sources and the output, and each
 * costs the export's length at 48kHz stereo, which is 384 KB a second. Three
 * minutes is about 207 MB. The clip cap is ten minutes, which would be 690 MB,
 * so past this the modal asks for one of the two to be switched off rather
 * than letting the tab run out of memory mid-encode.
 *
 * Cuts do not change that. A cut clip is many buffers rather than one, but
 * they sum to the kept length, which is the export's own and is what this
 * caps.
 */
export const MAX_MIX_SECONDS = 180;

export interface MixRequest {
  /**
   * The clip's own file, read for its audio track. Absent leaves it out. Only
   * meaningful at 1x: the clip's sound is not stretched, so the caller leaves
   * it out at any other speed.
   */
  clip?: Blob;
  /** The laid track and where it sits. Absent leaves it out. */
  soundtrack?: Soundtrack;
  /** The export's range on the clip's own timeline. */
  trim: Trim;
  /** Stretches removed from the middle of it. */
  cuts?: Cut[];
  /** The playback rate, which is what maps the clip's axis onto the output's. */
  speed?: number;
}

/**
 * One buffer holding whatever was asked for, or null when that is nothing.
 *
 * The buffer is the export's own length, so a track placed part way through
 * carries real silence in front of it rather than a gap. That matters: an
 * empty stretch is not a quiet one, and a player that ignores an audio track's
 * start offset puts the music at the top of the file instead.
 */
export async function mixAudio({
  clip,
  soundtrack,
  trim,
  cuts = [],
  speed = 1,
}: MixRequest): Promise<AudioBuffer | null> {
  if (!clip && !soundtrack) return null;

  // The output's length, not the source's: at 2x the buffer is half the trim,
  // and every cut comes off it.
  const segments = keptSegments(trim, cuts);
  const length = keptSeconds(trim, cuts) / speed;
  if (!length) return null;

  // Where the track's region lands inside the export, and which part of the
  // file that is. The region is anchored to a source frame, so its place on
  // the output's clock is that frame's own: `toOutput` closes the gap of any
  // cut in front of it, and the speed divides what is left. The track itself
  // plays at its own tempo from there. A negative placement means it starts
  // before the in point, so the schedule begins at zero and reads that much
  // further in.
  const at = soundtrack
    ? (soundtrack.offset >= trim.start
        ? toOutput(trim, cuts, soundtrack.offset)
        : soundtrack.offset - trim.start) / speed
    : 0;
  const skipped = Math.max(-at, 0);
  const place = Math.max(at, 0);
  const from = soundtrack ? soundtrack.start + skipped : 0;
  const span = soundtrack
    ? Math.min(soundtrack.end - from, length - place)
    : 0;

  const [clipSound, trackSound] = await Promise.all([
    clip ? readRanges(clip, segments) : [],
    soundtrack && span > 0 ? readRange(soundtrack.blob, from, from + span) : null,
  ]);
  if (clipSound.length === 0 && !trackSound) return null;

  const context = new OfflineAudioContext(
    CHANNELS,
    Math.ceil(length * RATE),
    RATE,
  );

  // Each kept segment goes at its own place on the output's clock, which with
  // no cuts is one buffer at zero. Every buffer is already exactly the range
  // that will be heard, so none needs an offset into itself.
  for (const { buffer, at: when } of clipSound) play(context, buffer, when / speed);
  if (trackSound) play(context, trackSound, place);

  return context.startRendering();
}

/**
 * One buffer per kept segment, off a single decoder, each carrying where it
 * belongs on the output's clock before speed.
 *
 * Segments that decode to nothing are dropped rather than scheduled as
 * silence, since the context's own buffer is already silent.
 */
async function readRanges(
  blob: Blob,
  segments: readonly Segment[],
): Promise<{ buffer: AudioBuffer; at: number }[]> {
  const sink = await openAudio(blob);
  if (!sink) return [];

  const out: { buffer: AudioBuffer; at: number }[] = [];
  for (const segment of segments) {
    const buffer = await readFromSink(sink, segment.start, segment.end);
    if (buffer) out.push({ buffer, at: segment.at });
  }
  return out;
}

/**
 * The samples between two times, as one buffer at the source's own rate.
 *
 * Left at that rate rather than resampled here, since the mixing context
 * resamples whatever it is given and doing it twice is one loss of quality for
 * nothing.
 */
async function readRange(
  blob: Blob,
  from: number,
  to: number,
): Promise<AudioBuffer | null> {
  const sink = await openAudio(blob);
  return sink ? readFromSink(sink, from, to) : null;
}

/**
 * A sink over a file's primary audio track, or null when it has none or this
 * browser cannot decode it. Either way that source contributes nothing and the
 * other still plays.
 */
async function openAudio(blob: Blob): Promise<AudioSampleSink | null> {
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(blob),
    });
    const track = await input.getPrimaryAudioTrack();
    return track ? new AudioSampleSink(track) : null;
  } catch {
    return null;
  }
}

async function readFromSink(
  sink: AudioSampleSink,
  from: number,
  to: number,
): Promise<AudioBuffer | null> {
  let out: AudioBuffer | null = null;

  try {
    for await (const sample of sink.samples(from, to)) {
      const piece = sample.toAudioBuffer();

      // Sized from the first sample, since that is the first point the rate
      // and the channel count are known.
      if (!out) {
        out = new AudioBuffer({
          length: Math.max(Math.ceil((to - from) * piece.sampleRate), 1),
          sampleRate: piece.sampleRate,
          numberOfChannels: piece.numberOfChannels,
        });
      }

      // A sink yields the sample that contains the start time, so the first
      // one usually begins before it. That much of it is dropped rather than
      // written at a negative offset.
      const offset = Math.round((sample.timestamp - from) * out.sampleRate);
      const skip = Math.max(-offset, 0);
      const room = out.length - Math.max(offset, 0);
      const take = Math.min(piece.length - skip, room);

      if (take > 0) {
        for (let c = 0; c < out.numberOfChannels; c++) {
          const source = piece.getChannelData(
            Math.min(c, piece.numberOfChannels - 1),
          );
          out.copyToChannel(
            source.subarray(skip, skip + take),
            c,
            Math.max(offset, 0),
          );
        }
      }

      sample.close();
    }

    return out;
  } catch {
    // A range this browser stumbles on. Whatever was written before it stands,
    // and the other sources still play.
    return out;
  }
}

function play(context: OfflineAudioContext, buffer: AudioBuffer, at: number) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(at);
}
