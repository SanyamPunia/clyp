/**
 * Where the action is, read from the picture itself.
 *
 * A dropped file carries no pointer track, but the picture does: whatever
 * changed between two frames is where something happened, and for a screen
 * recording that is almost always where the cursor went. Each frame is shrunk
 * to a few thousand pixels, differenced against the one before, and the
 * centroid of what changed is one sample of the track. Smoothed, that is what a
 * following zoom looks toward.
 *
 * Two kinds of frame say nothing and are held rather than followed. One where
 * almost nothing changed has no motion to point at. One where most of the frame
 * changed is a scroll or a transition, and the centroid of everything is the
 * middle of the picture, which is not where anything is.
 *
 * **The whole clip is read once, when asked, and never again.** The read
 * decodes every frame, so it is the one heavy thing in the editor: measured at
 * 320 frames a second for 720p, which is about a minute for a ten minute clip.
 * It is asked for through a dialog that says so, it reports progress, and the
 * result is stored with the draft, so a region can be added, dragged or
 * switched to follow without any work starting in the background.
 *
 * `analyzeMotion` runs in a worker off a decode of its own, spawned from
 * `lib/read-motion.ts`. The spawner lives apart from this module on purpose:
 * the worker's entry imports this file, and a module that also referenced the
 * worker's URL would make a cycle through a worker entry, which the production
 * build did not finish. Everything below `analyzeMotion` is pure.
 */

import {
  ALL_FORMATS,
  BlobSource,
  Input,
  VideoSampleSink,
} from "mediabunny";

/**
 * A run of samples, three floats each: the source time in seconds and the
 * smoothed position of the action as fractions of the picture. Time is ascending.
 * A position is NaN before the first motion, where there is nothing to follow.
 */
export interface MotionTrack {
  samples: Float32Array;
}

export interface MotionRequest {
  source: Blob;
  from: number;
  to: number;
}

export type MotionReply =
  | { type: "progress"; fraction: number }
  | { type: "done"; samples: Float32Array }
  | { type: "error"; message: string };

/**
 * Frames a second the read gets through at 720p, measured: a 40 s 1280x720
 * clip, 1200 frames, in 3.75 s. Decode is the cost and it scales with pixels,
 * so other sizes are scaled from this.
 */
const READ_RATE_720P = 320;
const PIXELS_720P = 1280 * 720;
/** How often the worker reports, in frames. */
const PROGRESS_EVERY = 15;

/** How long reading a clip will take, in seconds. Assumes 30 fps, which a
 * `<video>` element cannot be asked about. */
export function estimateMotionSeconds(
  width: number,
  height: number,
  duration: number,
): number {
  const rate = Math.min(
    Math.max((READ_RATE_720P * PIXELS_720P) / Math.max(width * height, 1), 60),
    2000,
  );
  return (duration * 30) / rate;
}

/** "a few seconds", "about 40 seconds", "about 2 minutes". */
export function describeWait(seconds: number): string {
  if (seconds < 8) return "a few seconds";
  if (seconds < 90) return `about ${Math.round(seconds / 5) * 5} seconds`;
  return `about ${Math.round(seconds / 60)} minute${Math.round(seconds / 60) === 1 ? "" : "s"}`;
}

/**
 * The longest edge of the frame the difference is taken on.
 *
 * Coarse enough that a frame is a few thousand pixels, fine enough that a
 * cursor survives it: a 24px cursor on a 1440px capture is under 3px here, and
 * on a 64px grid it was under a pixel and vanished into the "nothing moved"
 * floor. Measured on a 24px square crossing a 640px frame at 160px a second,
 * the changed fraction per frame is 0.08% to 0.17%, against 0.17% to 0.35% at
 * 64px, where it straddled the old floor and most frames were held.
 */
const GRID = 160;
/** How much a pixel's gray has to move to count as changed, 0 to 255. */
const CHANGE = 16;
/** Below this fraction of the frame changed, nothing moved. About four pixels. */
const STILL = 0.0003;
/** Above it, everything did, which is a scroll rather than a cursor. */
const SWEEP = 0.35;
/**
 * The smoothing's time constant, in source seconds. Short, because the comfort
 * zone below is what absorbs a wiggle now: this only has to take the frame to
 * frame noise out of the centroid, and every tenth of a second here is a tenth
 * of a second the picture trails a pointer crossing the screen.
 */
const TAU = 0.2;
/**
 * How much of the window the action may roam before the window moves, as a
 * fraction of the window's size.
 *
 * The first build glued the window to the action, and every wiggle of the
 * mouse moved the picture. A camera operator lets the subject roam a comfort
 * zone and pans only when it nears the edge, which is what this is: the action
 * can cross the middle half of the window freely, and the window follows only
 * when the action reaches the zone's edge, by exactly enough to keep it there.
 */
const ZONE = 0.5;

/**
 * Reads the track for one stretch of a file. Worker-side: it draws to an
 * `OffscreenCanvas`, which every browser with WebCodecs has.
 */
export async function analyzeMotion(
  { source, from, to }: MotionRequest,
  onProgress?: (fraction: number) => void,
): Promise<Float32Array> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(source) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("That file has no video track");

  const aspect = track.displayWidth / track.displayHeight;
  const width = aspect >= 1 ? GRID : Math.max(2, Math.round(GRID * aspect));
  const height = aspect >= 1 ? Math.max(2, Math.round(GRID / aspect)) : GRID;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error("No 2D context");

  const sink = new VideoSampleSink(track);
  const raw: number[] = [];
  let previous: Uint8Array | null = null;
  let count = 0;
  const span = Math.max(to - from, 1e-6);

  for await (const sample of sink.samples(Math.max(from, 0), to)) {
    sample.draw(ctx, 0, 0, width, height);
    const gray = grayscale(ctx.getImageData(0, 0, width, height).data);
    const at = sample.timestamp;
    sample.close();

    if (previous) {
      const hit = centroid(previous, gray, width, height);
      raw.push(at, hit ? hit.x : NaN, hit ? hit.y : NaN);
    }
    previous = gray;

    if (++count % PROGRESS_EVERY === 0) {
      onProgress?.(Math.min((at - from) / span, 1));
    }
  }

  return smooth(raw);
}

function grayscale(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    // Integer luma weights, which is all a threshold needs.
    out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return out;
}

/** The centre of what changed, or null for a frame that says nothing. */
function centroid(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
): { x: number; y: number } | null {
  let count = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > CHANGE) {
      count++;
      sx += i % width;
      sy += Math.floor(i / width);
    }
  }
  const fraction = count / a.length;
  if (fraction < STILL || fraction > SWEEP) return null;
  return { x: (sx / count + 0.5) / width, y: (sy / count + 0.5) / height };
}

/**
 * An exponential moving average over the raw centroids, held through the
 * frames that said nothing. The first motion sets the value outright rather
 * than being pulled from an arbitrary start.
 */
function smooth(raw: number[]): Float32Array {
  const out = new Float32Array(raw.length);
  let x = NaN;
  let y = NaN;
  let last = NaN;

  for (let i = 0; i < raw.length; i += 3) {
    const t = raw[i];
    const cx = raw[i + 1];
    const cy = raw[i + 2];
    if (!Number.isNaN(cx)) {
      if (Number.isNaN(x)) {
        x = cx;
        y = cy;
      } else {
        const alpha = 1 - Math.exp(-Math.max(t - last, 0) / TAU);
        x += (cx - x) * alpha;
        y += (cy - y) * alpha;
      }
      last = t;
    }
    out[i] = t;
    out[i + 1] = x;
    out[i + 2] = y;
  }
  return out;
}

/**
 * Where the action is at `time`, interpolated between the two samples around
 * it, or null before the first motion or off the end of the track.
 */
export function motionAt(
  track: MotionTrack,
  time: number,
): { x: number; y: number } | null {
  return sampleAt(track.samples, time);
}

/**
 * Where the window's centre is at `time` for a region at `scale`, following
 * the action through its comfort zone.
 *
 * The path is a sequential pass over the whole track, so it is computed once
 * per track and scale and kept on the track. It is pure in the track, which is
 * what lets the preview and the export both call it and agree.
 */
export function windowAt(
  track: MotionTrack,
  scale: number,
  time: number,
): { x: number; y: number } | null {
  let byScale = paths.get(track);
  if (!byScale) {
    byScale = new Map();
    paths.set(track, byScale);
  }
  let path = byScale.get(scale);
  if (!path) {
    path = followPath(track.samples, scale);
    byScale.set(scale, path);
  }
  return sampleAt(path, time);
}

const paths = new WeakMap<MotionTrack, Map<number, Float32Array>>();

/**
 * The window's centre over time. It starts on the first motion and after that
 * moves only when the action leaves the zone, by exactly enough to bring the
 * zone's edge back to the action, so a steady mover rides the zone's edge and
 * a wiggle inside it moves nothing.
 */
function followPath(samples: Float32Array, scale: number): Float32Array {
  const out = new Float32Array(samples.length);
  const half = (ZONE / scale) / 2;
  let cx = NaN;
  let cy = NaN;

  for (let i = 0; i < samples.length; i += 3) {
    const ax = samples[i + 1];
    const ay = samples[i + 2];
    if (!Number.isNaN(ax)) {
      if (Number.isNaN(cx)) {
        cx = ax;
        cy = ay;
      } else {
        if (ax > cx + half) cx = ax - half;
        else if (ax < cx - half) cx = ax + half;
        if (ay > cy + half) cy = ay - half;
        else if (ay < cy - half) cy = ay + half;
      }
    }
    out[i] = samples[i];
    out[i + 1] = cx;
    out[i + 2] = cy;
  }
  return out;
}

function sampleAt(
  s: Float32Array,
  time: number,
): { x: number; y: number } | null {
  const n = s.length / 3;
  if (n === 0) return null;

  // Binary search for the last sample at or before `time`.
  let lo = 0;
  let hi = n - 1;
  if (time < s[0]) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid * 3] <= time) lo = mid;
    else hi = mid - 1;
  }
  const i = lo * 3;
  const x0 = s[i + 1];
  const y0 = s[i + 2];
  if (Number.isNaN(x0)) return null;
  if (lo === n - 1) return { x: x0, y: y0 };

  const t0 = s[i];
  const t1 = s[i + 3];
  const f = t1 > t0 ? Math.min((time - t0) / (t1 - t0), 1) : 0;
  return { x: x0 + (s[i + 4] - x0) * f, y: y0 + (s[i + 5] - y0) * f };
}
