/**
 * Peaks for the soundtrack's lane.
 *
 * The whole file is decoded once, to PCM, and reduced to a fixed number of
 * buckets. That is the expensive part and it happens once per upload: after it
 * the lane redraws from a small array, so dragging the region costs nothing.
 *
 * A bucket keeps the loudest sample it saw rather than an average. An average
 * over a few thousand samples of music tends toward a flat band, which is a
 * picture of nothing. The peak is what gives a waveform its shape.
 */

/** Enough detail for a lane a few hundred pixels wide at any trim. */
const BUCKETS = 2048;

export interface Waveform {
  /** One 0 to 1 amplitude per bucket, over the file's whole length. */
  peaks: Float32Array;
  /** Seconds the peaks span, which is the decoded length. */
  duration: number;
}

export async function readWaveform(blob: Blob): Promise<Waveform> {
  // `AudioContext` rather than `OfflineAudioContext`: decoding needs no
  // rendering, and an offline context wants a length up front, which is the
  // thing being measured.
  const context = new AudioContext();

  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const channel = audio.getChannelData(0);
    const per = Math.max(Math.floor(channel.length / BUCKETS), 1);
    const peaks = new Float32Array(BUCKETS);

    let ceiling = 0;

    for (let bucket = 0; bucket < BUCKETS; bucket++) {
      const from = bucket * per;
      let loudest = 0;

      for (let i = from; i < from + per && i < channel.length; i++) {
        const level = Math.abs(channel[i]);
        if (level > loudest) loudest = level;
      }
      peaks[bucket] = loudest;
      if (loudest > ceiling) ceiling = loudest;
    }

    // Normalised to the file's own loudest moment. The lane is for finding a
    // beat to line the picture up against, not for judging level, and a track
    // mastered quietly draws as a flat line otherwise: this one peaks at 0.12,
    // which on a 28px lane is three pixels of shape. The floor stops pure
    // silence being amplified into noise.
    if (ceiling > 0.001) {
      for (let bucket = 0; bucket < BUCKETS; bucket++) peaks[bucket] /= ceiling;
    }

    return { peaks, duration: audio.duration };
  } finally {
    // Every context holds a hardware audio thread open, and a browser allows
    // only a handful, so one left behind per upload eventually throws.
    void context.close();
  }
}

/**
 * Draws the slice between two times, filling the canvas.
 *
 * Mirrored about the middle, since a peak drawn from the baseline up reads as
 * a bar chart rather than as sound.
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  { peaks, duration }: Waveform,
  from: number,
  to: number,
  color: string,
): void {
  const context = canvas.getContext("2d");
  if (!context || !duration) return;

  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(Math.round(canvas.clientWidth * ratio), 1);
  const height = Math.max(Math.round(canvas.clientHeight * ratio), 1);

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  context.clearRect(0, 0, width, height);
  context.fillStyle = color;

  const first = (from / duration) * peaks.length;
  const span = Math.max(((to - from) / duration) * peaks.length, 1);
  const middle = height / 2;
  // A hair under a pixel of gap, so neighbouring columns read as separate
  // strokes at any width without the whole band turning into a comb.
  const bar = Math.max(ratio, 1);
  const step = bar * 2;

  for (let x = 0; x < width; x += step) {
    const at = Math.floor(first + (x / width) * span);
    const level = peaks[Math.min(Math.max(at, 0), peaks.length - 1)] ?? 0;
    // A floor of one device pixel, or silence disappears and the region looks
    // like it failed to load rather than like it is quiet.
    const tall = Math.max(level * height, bar);
    context.fillRect(x, middle - tall / 2, bar, tall);
  }
}
