/**
 * Mixing the clip's own sound with a laid track.
 *
 * A soundtrack used to replace the clip's audio outright, which is one sound
 * or the other and needs no mixing. "Music on top of it" is two, so this
 * exists: both are decoded, placed on one timeline, and summed.
 *
 * **`OfflineAudioContext` does the work rather than hand-written PCM maths.**
 * Two files rarely share a sample rate, a 48kHz recording under a 44.1kHz
 * track being the ordinary case, and resampling by hand is where that kind of
 * code goes wrong. A context resamples on `decodeAudioData`, schedules by time
 * rather than by sample index, and sums its inputs, which is the whole job.
 */

import type { Soundtrack, Trim } from "@/types/screenshot";

/** What everything is resampled to, and what the encoder is handed. */
const RATE = 48000;
const CHANNELS = 2;

export interface MixRequest {
  /** The clip's own file, read for its audio track. Absent leaves it out. */
  clip?: Blob;
  /** The laid track and where it sits. Absent leaves it out. */
  soundtrack?: Soundtrack;
  /** The export's range on the clip's own timeline. */
  trim: Trim;
}

/**
 * One buffer holding whatever was asked for, or null when that is nothing.
 *
 * The buffer is the export's own length, so a track placed part way through
 * carries real silence in front of it rather than a gap. That matters: an
 * empty stretch is not a quiet one, and a player that ignores an audio
 * track's start offset puts the music at the top of the file instead.
 */
export async function mixAudio({
  clip,
  soundtrack,
  trim,
}: MixRequest): Promise<AudioBuffer | null> {
  if (!clip && !soundtrack) return null;

  const length = Math.max(trim.end - trim.start, 0);
  if (!length) return null;

  const [clipSound, trackSound] = await Promise.all([
    clip ? decode(clip) : null,
    soundtrack ? decode(soundtrack.blob) : null,
  ]);
  if (!clipSound && !trackSound) return null;

  const context = new OfflineAudioContext(
    CHANNELS,
    Math.ceil(length * RATE),
    RATE,
  );

  // The clip's own sound is already in step with its picture, so it is placed
  // at zero and played from the in point.
  if (clipSound) play(context, clipSound, 0, trim.start, length);

  // A track carries its own slice and its own place on the clip's axis, so it
  // starts wherever that puts it relative to the in point. A negative start is
  // a track placed before the trim: the schedule begins at zero and skips that
  // much further into the file.
  if (trackSound && soundtrack) {
    const at = soundtrack.offset - trim.start;
    const skipped = Math.max(-at, 0);
    play(
      context,
      trackSound,
      Math.max(at, 0),
      soundtrack.start + skipped,
      Math.min(soundtrack.end - soundtrack.start - skipped, length - Math.max(at, 0)),
    );
  }

  return context.startRendering();
}

/** Decoding is what resamples, so nothing downstream has to. */
async function decode(blob: Blob): Promise<AudioBuffer | null> {
  const context = new AudioContext({ sampleRate: RATE });

  try {
    return await context.decodeAudioData(await blob.arrayBuffer());
  } catch {
    // A file with no audio track, or one this browser cannot decode. Either
    // way it contributes nothing and the other source still plays.
    return null;
  } finally {
    // Every context holds a hardware audio thread and a browser allows only a
    // handful, so one left behind per export eventually throws.
    void context.close();
  }
}

function play(
  context: OfflineAudioContext,
  buffer: AudioBuffer,
  at: number,
  from: number,
  duration: number,
): void {
  if (duration <= 0 || from >= buffer.duration) return;

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  // Clamped to what is actually there, since a trim can run past the end of a
  // shorter audio track and `start` throws on a negative duration.
  source.start(at, from, Math.min(duration, buffer.duration - from));
}
