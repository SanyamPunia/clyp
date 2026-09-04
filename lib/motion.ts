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
 * The smoothing's time constant, in source seconds. Short: the glide below is
 * what makes the picture move smoothly now, so this only has to take the frame
 * to frame noise out of the centroid, and every tenth of a second here is a
 * tenth of a second the action leads the point the window is keeping in frame.
 */
const TAU = 0.1;

/*
 * How the window follows the action. Four numbers, and the picture is only as
 * calm as they make it.
 *
 * The first build glued the window to the action, and every wiggle of the
 * mouse moved the picture. The second let the action roam a comfort zone and
 * moved the window only when it reached the zone's edge, by exactly enough to
 * keep it there, which stopped the wiggles but made every pan start and stop
 * dead: the window was still, then moving at the action's own speed, then
 * still again. A camera operator does neither. They let the subject roam, wait
 * a beat to see whether it means it, and then ease the camera after it. And
 * because the whole track is known before anything is drawn, the operator
 * here also knows the choreography: the window aims at where the action is
 * about to be, so it arrives with it rather than after it.
 */

/**
 * How much of the window the action may roam before the window is asked to
 * move, as a fraction of the window's size. The middle 60%.
 */
const ZONE = 0.6;
/**
 * How long the action must stay outside the zone before the window reacts, in
 * source seconds. A brief overshoot, a flick to a button and back, moves
 * nothing.
 */
const DWELL = 0.15;
/**
 * The glide's time constant, in source seconds. The window follows its target
 * through a critically damped spring: it starts slowly, moves, and settles
 * slowly, with no overshoot. A step settles in about four of these.
 */
const GLIDE = 0.3;
/**
 * How far ahead the window aims, in source seconds. A critically damped spring
 * trails a moving target by twice its time constant, so aiming that far ahead
 * cancels the trail on a steady mover, and arriving early on a stop is what a
 * settle looks like.
 */
const LOOKAHEAD = 0.5;
/**
 * How far the action may get from the window's centre before the glide is
 * overruled, as a fraction of the window's half-extent. A flick across the
 * screen outruns any glide, and the one thing worse than a sudden pan is the
 * subject leaving the frame, so the window is dragged along by the hand at
 * that point and the glide takes over again once the action slows.
 */
const KEEP = 0.7;

/*
 * Clicks, read from the picture.
 *
 * A click leaves a mark a cursor's travel does not: a sudden, compact change,
 * a button's pressed state, a focus ring, a row lighting up. Detected, it is
 * the one moment the action's position is known exactly, so the action is
 * pinned there for a while rather than left to a centroid that the cursor
 * drifting off the button would pull away. Verified on a square that pauses
 * beside a two frame flash: the action snaps to the flash and holds until the
 * square moves on.
 */

/** A frame counts as a click when this much of the grid changed at once. About
 * 43 pixels of a 160 by 90 grid, well above a caret or a keystroke. */
const CLICK_MIN = 0.003;
/** And that much is at least this many times the frames just before it. A
 * video playing in a tab raises the baseline and never trips this. */
const CLICK_BOOST = 3;
/** Over how many frames the baseline is taken. */
const CLICK_BASELINE = 15;
/** And the change is compact: its root mean square spread from its own centre
 * is under this fraction of the grid's longer side. A scroll is not. */
const CLICK_SPREAD = 0.2;
/** How long the action stays pinned to a click, in source seconds. */
const CLICK_HOLD = 1;
/** Unless the centroid moves this far from it first, which is the cursor
 * leaving, as fractions of the picture. */
const CLICK_RELEASE = 0.2;
/** Two clicks closer than this are one. */
const CLICK_GAP = 0.3;

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
      const c = change(previous, gray, width, height);
      const held = c.fraction < STILL || c.fraction > SWEEP;
      raw.push(at, held ? NaN : c.x, held ? NaN : c.y, c.fraction, c.spread);
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

interface Change {
  /** The centre of what changed, as fractions of the picture. */
  x: number;
  y: number;
  /** How much of the grid changed. */
  fraction: number;
  /** The root mean square spread of the change from its centre, as a fraction
   * of the grid's longer side. Small for a button, large for a scroll. */
  spread: number;
}

/** What changed between two frames, and how much, and how compactly. */
function change(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
): Change {
  let count = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > CHANGE) {
      const x = i % width;
      const y = (i - x) / width;
      count++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
    }
  }
  if (count === 0) return { x: NaN, y: NaN, fraction: 0, spread: 0 };

  const mx = sx / count;
  const my = sy / count;
  const variance = Math.max(sxx / count - mx * mx + (syy / count - my * my), 0);
  return {
    x: (mx + 0.5) / width,
    y: (my + 0.5) / height,
    fraction: count / a.length,
    spread: Math.sqrt(variance) / Math.max(width, height),
  };
}

/** The raw record is five numbers a frame: time, centre, fraction, spread. */
const RAW = 5;

/**
 * The action's track from the raw frames: an exponential moving average over
 * the centroids, held through the frames that said nothing, and pinned to a
 * click while the cursor lingers on it. The first motion sets the value
 * outright rather than being pulled from an arbitrary start.
 */
function smooth(raw: number[]): Float32Array {
  const frames = raw.length / RAW;
  const out = new Float32Array(frames * 3);
  let x = NaN;
  let y = NaN;
  let last = NaN;
  let clickAt = -Infinity;
  let clickX = NaN;
  let clickY = NaN;
  const recent: number[] = [];

  for (let f = 0; f < frames; f++) {
    const i = f * RAW;
    const t = raw[i];
    const cx = raw[i + 1];
    const cy = raw[i + 2];
    const fraction = raw[i + 3];
    const spread = raw[i + 4];

    // A click: a sudden, compact change against what came just before.
    const baseline = Math.max(median(recent), 0.0005);
    const rawX = raw[i + 1];
    const rawY = raw[i + 2];
    if (
      fraction >= CLICK_MIN &&
      fraction >= CLICK_BOOST * baseline &&
      spread <= CLICK_SPREAD &&
      !Number.isNaN(rawX) &&
      t - clickAt >= CLICK_GAP
    ) {
      clickAt = t;
      clickX = rawX;
      clickY = rawY;
      x = rawX;
      y = rawY;
    }
    recent.push(fraction);
    if (recent.length > CLICK_BASELINE) recent.shift();

    const pinned =
      t - clickAt <= CLICK_HOLD &&
      (Number.isNaN(cx) || Math.hypot(cx - clickX, cy - clickY) <= CLICK_RELEASE);

    if (pinned) {
      x = clickX;
      y = clickY;
      last = t;
    } else if (!Number.isNaN(cx)) {
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
    out[f * 3] = t;
    out[f * 3 + 1] = x;
    out[f * 3 + 2] = y;
  }
  return out;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
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
 * The window's centre over time.
 *
 * Two things move. The target is where the window wants to be: it starts on
 * the first motion and moves only when the action, read a little ahead of
 * now, has been outside the zone for the dwell, by exactly enough to bring
 * the zone's edge back to it. The centre is where the window is: it glides
 * toward the target through a critically damped spring, and is dragged along
 * outright when the present action would otherwise leave the frame.
 *
 * One pass over the track, so it is computed once per track and scale.
 */
function followPath(samples: Float32Array, scale: number): Float32Array {
  const out = new Float32Array(samples.length);
  const half = 1 / scale / 2;
  const zone = half * ZONE;
  const keep = half * KEEP;
  const w = 1 / GLIDE;

  let tx = NaN;
  let ty = NaN;
  let cx = NaN;
  let cy = NaN;
  let vx = 0;
  let vy = 0;
  let outsideSince = NaN;
  let last = NaN;
  // The sample the lookahead has reached. It only ever moves forward.
  let ahead = 0;

  for (let i = 0; i < samples.length; i += 3) {
    const t = samples[i];
    const ax = samples[i + 1];
    const ay = samples[i + 2];

    if (!Number.isNaN(ax)) {
      if (Number.isNaN(cx)) {
        tx = cx = ax;
        ty = cy = ay;
      } else {
        // A gap in the track is a gap, not a huge step for the spring.
        const dt = Math.min(Math.max(t - last, 0), 0.1);

        // Where the action is about to be, which is what the target aims at.
        // Off the end of the track it is where the action is.
        while (ahead + 3 < samples.length && samples[ahead] < t + LOOKAHEAD) {
          ahead += 3;
        }
        const fx = Number.isNaN(samples[ahead + 1]) ? ax : samples[ahead + 1];
        const fy = Number.isNaN(samples[ahead + 2]) ? ay : samples[ahead + 2];

        // The target waits out the dwell, then tracks the zone's edge.
        const dx = fx - tx;
        const dy = fy - ty;
        const outside = Math.abs(dx) > zone || Math.abs(dy) > zone;
        if (!outside) outsideSince = NaN;
        else if (Number.isNaN(outsideSince)) outsideSince = t;
        if (outside && t - outsideSince >= DWELL) {
          if (dx > zone) tx = fx - zone;
          else if (dx < -zone) tx = fx + zone;
          if (dy > zone) ty = fy - zone;
          else if (dy < -zone) ty = fy + zone;
        }

        // The centre glides after the target, critically damped.
        vx += (w * w * (tx - cx) - 2 * w * vx) * dt;
        vy += (w * w * (ty - cy) - 2 * w * vy) * dt;
        cx += vx * dt;
        cy += vy * dt;

        // Never let the action leave the frame.
        if (ax - cx > keep) {
          cx = ax - keep;
          vx = 0;
        } else if (cx - ax > keep) {
          cx = ax + keep;
          vx = 0;
        }
        if (ay - cy > keep) {
          cy = ay - keep;
          vy = 0;
        } else if (cy - ay > keep) {
          cy = ay + keep;
          vy = 0;
        }
      }
      last = t;
    }
    out[i] = t;
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
