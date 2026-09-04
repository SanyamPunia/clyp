import { describe, expect, it } from "vitest";

import {
  DEFAULT_PACE,
  type MotionTrack,
  describeWait,
  estimateMotionSeconds,
  motionAt,
  windowAt,
} from "@/lib/motion";

function track(samples: number[]): MotionTrack {
  return { samples: new Float32Array(samples), clicks: new Float32Array() };
}

/** A track at 30fps whose action moves from `from` to `to` over `seconds`. */
function crossing(from: number, to: number, seconds: number): MotionTrack {
  const samples: number[] = [];
  const frames = Math.round(seconds * 30);
  for (let i = 0; i <= frames; i++) {
    const p = i / frames;
    samples.push(i / 30, from + (to - from) * p, 0.5);
  }
  return track(samples);
}

describe("estimateMotionSeconds", () => {
  it("matches the read that was measured", () => {
    // A 40s 1280x720 clip, 1200 frames, read in 3.75s.
    expect(estimateMotionSeconds(1280, 720, 40)).toBeCloseTo(3.75, 6);
  });

  it("costs about twice as much at 1080p, which is 2.25 times the pixels", () => {
    const ratio =
      estimateMotionSeconds(1920, 1080, 40) / estimateMotionSeconds(1280, 720, 40);
    expect(ratio).toBeCloseTo(2.25, 6);
  });

  it("is linear in the clip's length", () => {
    expect(estimateMotionSeconds(1280, 720, 80)).toBeCloseTo(
      estimateMotionSeconds(1280, 720, 40) * 2,
      6,
    );
  });

  it("clamps the rate at both ends", () => {
    // A tiny frame cannot be read faster than 2000 frames a second.
    expect(estimateMotionSeconds(2, 2, 60)).toBeCloseTo((60 * 30) / 2000, 6);
    // And an enormous one no slower than 60.
    expect(estimateMotionSeconds(8000, 8000, 60)).toBeCloseTo((60 * 30) / 60, 6);
  });

  it("survives a zero-sized frame", () => {
    expect(Number.isFinite(estimateMotionSeconds(0, 0, 10))).toBe(true);
  });
});

describe("describeWait", () => {
  it("says a few seconds under eight", () => {
    expect(describeWait(0)).toBe("a few seconds");
    expect(describeWait(3.75)).toBe("a few seconds");
    expect(describeWait(7.99)).toBe("a few seconds");
  });

  it("rounds to five seconds up to ninety", () => {
    expect(describeWait(8)).toBe("about 10 seconds");
    expect(describeWait(40)).toBe("about 40 seconds");
    expect(describeWait(42)).toBe("about 40 seconds");
    expect(describeWait(43)).toBe("about 45 seconds");
    expect(describeWait(89)).toBe("about 90 seconds");
  });

  it("becomes minutes at ninety, where a number needs converting", () => {
    expect(describeWait(90)).toBe("about 2 minutes");
    expect(describeWait(150)).toBe("about 3 minutes");
    expect(describeWait(600)).toBe("about 10 minutes");
  });
});

describe("motionAt", () => {
  it("is null before the first sample", () => {
    expect(motionAt(track([1, 0.5, 0.5, 2, 0.6, 0.6]), 0.5)).toBeNull();
  });

  it("is null for an empty track", () => {
    expect(motionAt(track([]), 1)).toBeNull();
  });

  it("is null where the track says nothing yet", () => {
    // NaN is the stretch before any motion, which has nothing to follow.
    expect(motionAt(track([0, NaN, NaN, 1, 0.5, 0.5]), 0.5)).toBeNull();
  });

  it("returns a sample it lands on", () => {
    const at = motionAt(track([0, 0.2, 0.3, 1, 0.8, 0.9]), 0)!;
    expect(at.x).toBeCloseTo(0.2, 6);
    expect(at.y).toBeCloseTo(0.3, 6);
  });

  it("interpolates between the two samples around it", () => {
    const at = motionAt(track([0, 0, 0, 1, 1, 0.5]), 0.25)!;
    expect(at.x).toBeCloseTo(0.25, 6);
    expect(at.y).toBeCloseTo(0.125, 6);
  });

  it("holds the last sample off the end", () => {
    const at = motionAt(track([0, 0.2, 0.3, 1, 0.8, 0.9]), 99)!;
    expect(at.x).toBeCloseTo(0.8, 6);
    expect(at.y).toBeCloseTo(0.9, 6);
  });

  it("finds the right sample across a long track", () => {
    const samples: number[] = [];
    for (let i = 0; i < 500; i++) samples.push(i / 30, i / 500, 0.5);
    const at = motionAt(track(samples), 300 / 30)!;
    expect(at.x).toBeCloseTo(300 / 500, 6);
  });
});

describe("windowAt", () => {
  const HALF = (scale: number) => 1 / scale / 2;

  it("is null before the first motion", () => {
    const t = track([0, NaN, NaN, 1, 0.5, 0.5]);
    expect(windowAt(t, 2, DEFAULT_PACE, 0.5)).toBeNull();
  });

  it("is null for an empty track", () => {
    expect(windowAt(track([]), 2, DEFAULT_PACE, 1)).toBeNull();
  });

  it("starts on the first motion rather than an arbitrary place", () => {
    const t = crossing(0.3, 0.3, 2);
    expect(windowAt(t, 2, DEFAULT_PACE, 0)!.x).toBeCloseTo(0.3, 6);
  });

  it("holds still for action that does not move", () => {
    const t = crossing(0.4, 0.4, 3);
    for (let time = 0; time <= 3; time += 0.25) {
      expect(windowAt(t, 2, DEFAULT_PACE, time)!.x).toBeCloseTo(0.4, 4);
    }
  });

  it("keeps the action in frame across a clip that never pauses", () => {
    // The worst case for a glide: a square crossing the picture at a quarter
    // of the frame a second, which is what the export was verified on.
    for (const scale of [1.5, 2, 3]) {
      const t = crossing(0.1, 0.9, 3.2);
      const s = t.samples;
      for (let i = 0; i < s.length; i += 3) {
        const centre = windowAt(t, scale, DEFAULT_PACE, s[i])!;
        expect(Math.abs(s[i + 1] - centre.x)).toBeLessThanOrEqual(
          HALF(scale) + 1e-6,
        );
      }
    }
  });

  it("never lets the action get further than the hard bound", () => {
    // KEEP is 0.7 of the window's half-extent, and it is a hard drag rather
    // than part of the glide.
    const scale = 3;
    const t = crossing(0.05, 0.95, 1.5);
    const s = t.samples;
    for (let i = 0; i < s.length; i += 3) {
      const centre = windowAt(t, scale, DEFAULT_PACE, s[i])!;
      expect(Math.abs(s[i + 1] - centre.x)).toBeLessThanOrEqual(
        HALF(scale) * 0.7 + 1e-6,
      );
    }
  });

  it("ignores a flick out and back, which is what the dwell is for", () => {
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) samples.push(i / 30, 0.5, 0.5);
    // Two frames away and back: under the dwell, so the target must not move.
    samples.push(1, 0.62, 0.5, 1 + 1 / 30, 0.62, 0.5);
    for (let i = 0; i < 30; i++) samples.push(1.1 + i / 30, 0.5, 0.5);
    const t = track(samples);
    for (let time = 0; time <= 2; time += 0.1) {
      expect(windowAt(t, 2, DEFAULT_PACE, time)!.x).toBeCloseTo(0.5, 2);
    }
  });

  it("moves for action that leaves the zone and stays out", () => {
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) samples.push(i / 30, 0.35, 0.5);
    for (let i = 0; i < 90; i++) samples.push(1 + i / 30, 0.75, 0.5);
    const t = track(samples);
    // Still before the lookahead can see the step, which is 0.5s of the
    // balanced pace, and already moving after it.
    expect(windowAt(t, 2, DEFAULT_PACE, 0.4)!.x).toBeCloseTo(0.35, 3);
    expect(windowAt(t, 2, DEFAULT_PACE, 0.9)!.x).toBeGreaterThan(0.36);
    // It settles at the zone's edge, not on the action: the window's half is
    // 0.25 at this scale, the balanced zone is 0.6 of that, so the target is
    // the action less 0.15.
    expect(windowAt(t, 2, DEFAULT_PACE, 3.9)!.x).toBeCloseTo(0.6, 3);
  });

  it("glides without overshooting, which is what critical damping buys", () => {
    const samples: number[] = [];
    for (let i = 0; i < 15; i++) samples.push(i / 30, 0.3, 0.5);
    for (let i = 0; i < 150; i++) samples.push(0.5 + i / 30, 0.7, 0.5);
    const t = track(samples);
    let previous = windowAt(t, 2, DEFAULT_PACE, 0.5)!.x;
    for (let time = 0.5; time <= 5.4; time += 1 / 30) {
      const next = windowAt(t, 2, DEFAULT_PACE, time)!.x;
      // Monotonic toward the target and never past it.
      expect(next).toBeGreaterThanOrEqual(previous - 1e-6);
      expect(next).toBeLessThanOrEqual(0.7 + 1e-6);
      previous = next;
    }
  });

  it("reacts sooner the quicker the pace", () => {
    const samples: number[] = [];
    for (let i = 0; i < 15; i++) samples.push(i / 30, 0.3, 0.5);
    for (let i = 0; i < 60; i++) samples.push(0.5 + i / 30, 0.7, 0.5);
    const t = track(samples);
    const at = (pace: "calm" | "balanced" | "quick") =>
      windowAt(t, 2, pace, 1)!.x;
    expect(at("quick")).toBeGreaterThan(at("balanced"));
    expect(at("balanced")).toBeGreaterThan(at("calm"));
  });

  it("gives the same answer every time, so the preview and the export agree", () => {
    const t = crossing(0.1, 0.9, 3);
    const first = windowAt(t, 2, DEFAULT_PACE, 1.5)!;
    const again = windowAt(t, 2, DEFAULT_PACE, 1.5)!;
    expect(again).toEqual(first);
    // A different scale is a different path, and both stay available.
    expect(windowAt(t, 3, DEFAULT_PACE, 1.5)!.x).not.toBe(first.x);
    expect(windowAt(t, 2, DEFAULT_PACE, 1.5)!).toEqual(first);
  });

  it("does not let a gap in the track become a huge step", () => {
    // A long hold between two samples: the spring sees a bounded step.
    const t = track([0, 0.2, 0.5, 5, 0.9, 0.5, 5.1, 0.9, 0.5]);
    const centre = windowAt(t, 2, DEFAULT_PACE, 5)!;
    expect(Number.isFinite(centre.x)).toBe(true);
    expect(centre.x).toBeGreaterThanOrEqual(0);
    expect(centre.x).toBeLessThanOrEqual(1);
  });
});
