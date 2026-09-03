"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GaugeIcon,
  Loader2Icon,
  MousePointer2Icon,
  Music2Icon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  SquareIcon,
  StepBackIcon,
  StepForwardIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
  ZoomInIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type ZoomRegion,
  MIN_ZOOM_LENGTH,
  ZOOM_LEVELS,
  roomFor,
} from "@/lib/clip-zoom";
import { AUDIO_ACCEPT, formatPrecise } from "@/lib/media";
import { drawWaveform, readWaveform, type Waveform } from "@/lib/waveform";
import { EDIT_FPS, SPEED_OPTIONS, formatSpeed } from "@/lib/video-export";
import { cn } from "@/lib/utils";
import type { Soundtrack, Trim } from "@/types/screenshot";

/**
 * The clip's in and out points, and the preview's playhead.
 *
 * One control does both jobs because they are the same geometry. A lane a
 * reader can scrub is a lane a reader can cut, and building them separately
 * would put two timelines under one video that have to agree about where a
 * second is.
 */

/** The shortest clip a trim may leave, in seconds. */
const MIN_TRIM = 0.2;

/** Handle width in px. The lane's usable span is inset by half of it. */
const HANDLE = 12;
const INSET = HANDLE / 2;

/**
 * One frame, and the grid everything here lands on.
 *
 * The source's own rate is not exposed by a `<video>` element, so a frame is a
 * frame of the export, which is what a cut is being made against: an out point
 * between two output frames cannot be honoured, so offering one is a readout
 * that lies by up to 33ms. Both handles snap to this, dragged or nudged, which
 * is invisible at any zoom (a frame is 1.5px on a 20s clip across 880px) and
 * is what makes the millisecond readout mean something.
 *
 * `EDIT_FPS` is the coarser of the two export rates on purpose. See its own
 * note: a point on that grid is exact at either rate.
 */
const FRAME = 1 / EDIT_FPS;
const COARSE_STEP = 1;

const snap = (seconds: number) => Math.round(seconds / FRAME) * FRAME;

/** Elements that do something with a space of their own. */
const SPACE_IS_THEIRS = new Set([
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "BUTTON",
  "A",
]);

/**
 * The axis under the lane.
 *
 * The interval is the first of these that leaves the labels far enough apart
 * to read at the lane's current width, so a two second clip is marked every
 * tenth and three minutes every fifteen seconds. Picking one interval for
 * every clip would either crowd a long one or leave a short one with two marks
 * on it.
 */
const TICK_INTERVALS = [
  0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300,
];
const MIN_TICK_GAP = 56;

/**
 * Minor ticks between the labelled ones. They carry no number, so they need
 * only be far enough apart to read as separate marks, and they are what turns
 * a row of numbers into a ruler.
 */
const SUBDIVISIONS = [5, 4, 2];
const MIN_MINOR_GAP = 7;

interface TrimBarProps {
  /** Whether the clip arrived with sound of its own. */
  hasClipSound: boolean;
  soundtrack: Soundtrack | null;
  onSoundtrackChange: (soundtrack: Soundtrack) => void;
  onSoundtrackAdd: (file: File) => void;
  onSoundtrackRemove: () => void;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  musicMuted: boolean;
  onMusicMutedChange: (muted: boolean) => void;
  /**
   * Read only. The bar reads the clock every frame and asks its owner to move
   * it, rather than writing to the element: the React compiler treats a ref
   * arriving as a prop as the parent's to mutate, which it is.
   */
  video: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  trim: Trim;
  onChange: (trim: Trim) => void;
  onSeek: (time: number) => void;
  onPlayback: (playing: boolean) => void;
  /** Play or pause. The rule lives with whoever owns the element and the trim. */
  onToggle: () => void;
  /**
   * The playback rate. The lane stays in the source's own seconds whatever it
   * is, since that is what the handles cut on, and a soundtrack's region is
   * the one thing drawn against it that runs on the output's clock instead.
   */
  speed: number;
  onSpeedChange: (speed: number) => void;
  /**
   * Stretches of the clip that close in on the picture, on the same axis as
   * the trim. The bar draws and moves them. The picture and the export are
   * the owner's business.
   */
  zooms: ZoomRegion[];
  selectedZoom: string | null;
  /** The selected region's motion is still being read. */
  zoomAnalyzing: boolean;
  onZoomAdd: () => void;
  onZoomChange: (zoom: ZoomRegion) => void;
  onZoomSelect: (id: string | null) => void;
  onZoomRemove: () => void;
  disabled?: boolean;
}

/**
 * A fraction's own position along the lane.
 *
 * A handle sits fully inside the lane at both ends rather than half off it, so
 * the span a value maps onto is the lane less one handle. Expressed as a
 * `calc` rather than measured, so nothing here needs the lane's width to
 * render.
 */
const at = (fraction: number) =>
  `calc(${fraction * 100}% - ${fraction * HANDLE}px)`;

/** The same position, measured to a value's own centre rather than a handle's left edge. */
const centre = (fraction: number) => `calc(${at(fraction)} + ${INSET}px)`;

function tickInterval(duration: number, width: number): number {
  const fits = (step: number) => (step / duration) * width >= MIN_TICK_GAP;
  return TICK_INTERVALS.find(fits) ?? TICK_INTERVALS[TICK_INTERVALS.length - 1];
}

/** A label is a clock past a minute, since "180s" is a number to convert. */
function axisLabel(at: number, interval: number, duration: number): string {
  if (duration >= 60) {
    const minutes = Math.floor(at / 60);
    const rest = at - minutes * 60;
    return interval < 1
      ? `${minutes}:${rest.toFixed(1).padStart(4, "0")}`
      : `${minutes}:${String(Math.round(rest)).padStart(2, "0")}`;
  }
  return interval < 1 ? `${Number(at.toFixed(2))}s` : `${Math.round(at)}s`;
}

export function TrimBar({
  video,
  duration,
  trim,
  onChange,
  onSeek,
  onPlayback,
  onToggle,
  hasClipSound,
  soundtrack,
  onSoundtrackChange,
  onSoundtrackAdd,
  onSoundtrackRemove,
  muted,
  onMutedChange,
  musicMuted,
  onMusicMutedChange,
  speed,
  onSpeedChange,
  zooms,
  selectedZoom,
  zoomAnalyzing,
  onZoomAdd,
  onZoomChange,
  onZoomSelect,
  onZoomRemove,
  disabled = false,
}: TrimBarProps) {
  const [playing, setPlaying] = useState(true);
  const [looping, setLooping] = useState(true);
  /**
   * Folded to the transport row, for more canvas while the cut is settled.
   *
   * The folded part stays mounted and is hidden by height alone, since the
   * frame loop above reads the lane's playhead and would otherwise stop
   * wrapping playback at the out point the moment the lane went away.
   */
  const [collapsed, setCollapsed] = useState(false);
  // Kept beside the file it was read from, so a new upload never shows the
  // last one's shape while it decodes.
  const [wave, setWave] = useState<{ of: Blob; data: Waveform } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The axis reads this to choose its interval. The playhead reads the ref, so
  // it still costs no render per frame.
  const [laneWidth, setLaneWidth] = useState(0);
  const laneRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  // The lane's usable span in px, kept in a ref because the playhead is
  // written every frame and must not render anything.
  const spanRef = useRef(0);
  // The live trim and the live seek, for the frame loop. It is bound once and
  // would otherwise close over the values this component mounted with. Written
  // in an effect rather than during render, which is not a ref's to do.
  const rangeRef = useRef(trim);
  const seekRef = useRef(onSeek);
  const loopRef = useRef(looping);
  const playbackRef = useRef(onPlayback);
  // The soundtrack changes on every frame of a drag, so the wheel listener
  // reads it from here rather than closing over it and rebinding 60 times a
  // second.
  const soundRef = useRef(soundtrack);
  const changeSoundRef = useRef(onSoundtrackChange);
  /** Wheel movement too small to be a frame yet, held until it is. */
  const restRef = useRef(0);

  useEffect(() => {
    rangeRef.current = trim;
    seekRef.current = onSeek;
    loopRef.current = looping;
    playbackRef.current = onPlayback;
    soundRef.current = soundtrack;
    changeSoundRef.current = onSoundtrackChange;
  }, [trim, onSeek, looping, onPlayback, soundtrack, onSoundtrackChange]);

  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;

    // Measured only from the observer, which fires once on `observe`. Calling
    // it in the effect body would be a synchronous setState there, which the
    // lint rejects.
    const observer = new ResizeObserver(() => {
      const span = Math.max(lane.clientWidth - HANDLE, 1);
      spanRef.current = span;
      setLaneWidth(span);
    });

    observer.observe(lane);
    return () => observer.disconnect();
  }, []);

  // The playhead and the loop, both per frame. `timeupdate` fires about four
  // times a second, which is too coarse to draw a playhead with and too coarse
  // to stop on an out point: at 250ms of overshoot a trimmed clip visibly
  // plays past its own end before jumping back.
  useEffect(() => {
    let frame = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);

      const element = video.current;
      const playhead = playheadRef.current;
      if (!element || !playhead || !duration) return;

      const { start, end } = rangeRef.current;
      const time = element.currentTime;

      if (!element.seeking && time < start - 0.05) {
        seekRef.current(start);
        return;
      }

      if (!element.seeking && time >= end) {
        // Not looping means stopping on the last frame that will be in the
        // export, rather than one past it or back at the top.
        if (!loopRef.current) {
          playbackRef.current(false);
          seekRef.current(Math.max(end - FRAME, start));
          return;
        }

        // Wrapping is a seek and then a play, and the play is not optional.
        // The element has no `loop` attribute, so at the file's own end it
        // pauses itself: seeking alone put the playhead back at the top and
        // left it sitting there, which is what made looping appear to work for
        // exactly one pass. Read before the seek, since seeking clears
        // `ended`.
        const resume = !element.paused || element.ended;
        seekRef.current(start);
        if (resume) playbackRef.current(true);
        return;
      }

      const fraction = Math.min(Math.max(time / duration, 0), 1);
      playhead.style.transform = `translateX(${fraction * spanRef.current}px)`;

      // Written rather than rendered, for the same reason as the playhead: a
      // readout to the millisecond changes on every frame, and none of those
      // changes is worth a render.
      const clock = clockRef.current;
      const text = formatPrecise(time, duration);
      if (clock && clock.textContent !== text) clock.textContent = text;
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [video, duration]);

  // Read from the element rather than tracked alongside it, so a pause from
  // anywhere, including a handle drag, keeps the button honest.
  useEffect(() => {
    const element = video.current;
    if (!element) return;

    const sync = () => setPlaying(!element.paused);
    sync();

    element.addEventListener("play", sync);
    element.addEventListener("pause", sync);
    return () => {
      element.removeEventListener("play", sync);
      element.removeEventListener("pause", sync);
    };
  }, [video]);

  // Plain functions: they are only handed to buttons in this component's own
  // render and feed no effect, so the compiler memoizes them on its own.
  // A step is one frame of the export, and at 2x an output frame is two of
  // the source's, so the step on the source's clock is that much longer.
  const step = (by: number) => {
    const element = video.current;
    if (!element) return;

    onPlayback(false);
    onSeek(
      clamp(element.currentTime + by * speed, trim.start, trim.end - FRAME),
    );
  };

  const stop = () => {
    onPlayback(false);
    onSeek(trim.start);
  };

  // Decoded once per file, keyed on the file rather than on the soundtrack:
  // dragging the region rewrites the placement on every frame, and re-reading
  // a whole track for each of those would be the most expensive thing here by
  // orders of magnitude.
  const track = soundtrack?.blob;

  useEffect(() => {
    if (!track) return;

    let cancelled = false;
    readWaveform(track).then((data) => {
      if (!cancelled) setWave({ of: track, data });
    });

    return () => {
      cancelled = true;
    };
  }, [track]);

  const shape = track && wave?.of === track ? wave.data : null;

  /** Where a client x lands on the lane, in seconds. */
  const timeAt = useCallback(
    (clientX: number) => {
      const lane = laneRef.current;
      if (!lane) return 0;

      const rect = lane.getBoundingClientRect();
      const fraction = (clientX - rect.left - INSET) / (rect.width - HANDLE);
      return Math.min(Math.max(fraction, 0), 1) * duration;
    },
    [duration],
  );

  const dragHandle = useCallback(
    (edge: "start" | "end") => (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();

      // Paused for the drag, or the frame under the handle is gone before it
      // can be read, which is the whole point of dragging one.
      const resume = video.current ? !video.current.paused : false;
      onPlayback(false);
      event.currentTarget.setPointerCapture(event.pointerId);

      const move = (moved: PointerEvent) => {
        const time = timeAt(moved.clientX);
        const next =
          edge === "start"
            ? {
                start: snap(Math.min(time, rangeRef.current.end - MIN_TRIM)),
                end: rangeRef.current.end,
              }
            : {
                start: rangeRef.current.start,
                end: snap(Math.max(time, rangeRef.current.start + MIN_TRIM)),
              };

        rangeRef.current = next;
        onChange(next);
        onSeek(next[edge]);
      };

      const release = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", release);
        window.removeEventListener("pointercancel", release);
        if (resume) onPlayback(true);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
    },
    [disabled, onChange, onPlayback, onSeek, timeAt, video],
  );

  const nudge = useCallback(
    (edge: "start" | "end") => (event: React.KeyboardEvent) => {
      if (disabled) return;

      const step = event.shiftKey ? COARSE_STEP : FRAME;
      const current = trim[edge];
      let value: number | null = null;

      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        value = current - step;
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        value = current + step;
      } else if (event.key === "Home") {
        value = edge === "start" ? 0 : trim.start + MIN_TRIM;
      } else if (event.key === "End") {
        value = edge === "start" ? trim.end - MIN_TRIM : duration;
      }
      if (value === null) return;

      event.preventDefault();
      const next =
        edge === "start"
          ? { start: snap(clamp(value, 0, trim.end - MIN_TRIM)), end: trim.end }
          : {
              start: trim.start,
              end: snap(clamp(value, trim.start + MIN_TRIM, duration)),
            };

      onChange(next);
      onSeek(next[edge]);
    },
    [disabled, duration, onChange, onSeek, trim],
  );

  /**
   * A press on the lane seeks, and holding it drags the playhead along.
   *
   * Clamped into the trim, since a playhead outside the range is a frame that
   * will not be in the export, and short of the out point by a frame, or the
   * loop above reads the scrub as the clip ending and snaps back to the start
   * under the hand.
   */
  const scrub = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;

      // Paused for the drag. Playback fights a scrub for the same clock, and
      // what comes out is the video stuttering rather than being moved.
      const resume = video.current ? !video.current.paused : false;
      onPlayback(false);

      const to = (clientX: number) => {
        const { start, end } = rangeRef.current;
        onSeek(clamp(timeAt(clientX), start, end - FRAME));
      };
      to(event.clientX);

      const move = (moved: PointerEvent) => to(moved.clientX);
      const release = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", release);
        window.removeEventListener("pointercancel", release);
        if (resume) onPlayback(true);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
    },
    [disabled, onPlayback, onSeek, timeAt, video],
  );

  /**
   * Moves the sound inside the region, leaving the region where it is.
   *
   * The region's place on the clip and its length are what the picture is cut
   * against, and they are usually right before the sound behind them is. This
   * is the edit that fixes the other half: the same window, a different part of
   * the track through it.
   */
  // The region only exists when a track does, and the wheel listener has to
  // rebind when it appears.
  const placed = soundtrack !== null;

  const slip = useCallback((by: number) => {
    const sound = soundRef.current;
    if (!sound) return;

    // Bounded by the file behind the region's head and ahead of its tail. A
    // region as long as the file has nowhere to slip, which is correct.
    const room = clamp(
      restRef.current + by,
      -sound.start,
      sound.duration - sound.end,
    );
    const step = snap(room);
    // Kept rather than dropped, or a trackpad's small deltas each round to
    // nothing and scrolling appears to do nothing at all.
    restRef.current = room - step;
    if (step === 0) return;

    // One step applied to both ends, never two snaps, so the region cannot
    // change length by a frame on the way.
    changeSoundRef.current({
      ...sound,
      start: sound.start + step,
      end: sound.end + step,
    });
  }, []);

  // Non-passive, since the point is to take the gesture rather than let it
  // scroll the page it sits on.
  useEffect(() => {
    const node = regionRef.current;
    if (!node || disabled) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Scaled to the lane, so a wheel of so many pixels slips the same amount
      // a drag of so many pixels would. The region is stretched by the speed,
      // so a pixel of it is that much less of the track.
      const perPixel = duration / Math.max(spanRef.current, 1) / speed;
      slip((event.deltaX || event.deltaY) * perPixel);
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [disabled, duration, slip, placed, speed]);

  /**
   * Space plays and pauses, from anywhere on the page.
   *
   * Bound to the window rather than to the bar, since the point is not having
   * to find the bar first, and this component only exists while a clip does,
   * which is the whole of the gating it needs. A field being typed in keeps its
   * spaces, and a focused `<button>` keeps its own native activation, or
   * tabbing to Play and pressing space would toggle twice.
   */
  const toggleRef = useRef(onToggle);

  // Mirrored in an effect rather than during render, which is not a ref's to
  // do. No dependency list: it is a new function every render and this is the
  // cheapest way to keep the one binding below pointing at the current one.
  useEffect(() => {
    toggleRef.current = onToggle;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target && SPACE_IS_THEIRS.has(target.tagName)) return;

      // Taken from the page, which would otherwise scroll.
      event.preventDefault();
      toggleRef.current();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * The soundtrack's body and its two edges.
   *
   * `body` slides the region along the clip. `head` brings the left edge in
   * while the sound stays where it is, which is why it moves `offset` and
   * `start` together. `tail` is the only one that changes the region's length
   * alone.
   *
   * All three keep the region inside the clip. A part hanging off either end
   * is a part that cannot be heard, so drawing it outside the lane says the
   * control is broken rather than that the sound runs on. Hearing a later
   * stretch of the file is what `head` is for.
   *
   * Two clocks meet here. `offset` is on the lane's, the source's seconds, and
   * `start` and `end` are on the track's own, which is also the output's. At
   * 2x a second of track covers two seconds of lane, so a lane distance `by`
   * is `by / speed` of track, and a track length is `length * speed` of lane.
   */
  const dragSound = useCallback(
    (part: "body" | "head" | "tail") =>
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (disabled || !soundtrack) return;
        event.preventDefault();
        event.stopPropagation();

        const origin = timeAt(event.clientX);
        const from = soundtrack;
        // The mode is fixed at the press rather than read per sample, so
        // letting go of Alt mid-drag cannot turn one edit into the other.
        const slipping = part === "body" && event.altKey;
        event.currentTarget.setPointerCapture(event.pointerId);

        const length = from.end - from.start;
        /** The region's footprint on the lane. */
        const span = length * speed;

        const move = (moved: PointerEvent) => {
          const by = timeAt(moved.clientX) - origin;

          if (slipping) {
            // Absolute against the snapshot, so this needs none of the wheel's
            // accumulating.
            const step = snap(
              clamp(by / speed, -from.start, from.duration - from.end),
            );
            onSoundtrackChange({
              ...from,
              start: from.start + step,
              end: from.end + step,
            });
            return;
          }

          if (part === "body") {
            onSoundtrackChange({
              ...from,
              offset: snap(clamp(from.offset + by, 0, duration - span)),
            });
            return;
          }

          if (part === "head") {
            // Bounded three ways: by what is left of the file behind the head,
            // by the clip's own start, and by the minimum the region may be.
            // The offset moves by the snapped lane distance and the start by
            // that same distance in track time, so the anchor cannot drift
            // from the sound under it by a rounding.
            const room =
              snap(
                from.offset +
                  clamp(
                    by,
                    -Math.min(from.start * speed, from.offset),
                    (length - MIN_TRIM) * speed,
                  ),
              ) - from.offset;
            onSoundtrackChange({
              ...from,
              offset: from.offset + room,
              start: from.start + room / speed,
            });
            return;
          }

          onSoundtrackChange({
            ...from,
            end: snap(
              clamp(
                from.end + by / speed,
                from.start + MIN_TRIM,
                // The file's own end, or the clip's, whichever comes first.
                Math.min(
                  from.duration,
                  from.start + (duration - from.offset) / speed,
                ),
              ),
            ),
          });
        };

        const release = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", release);
          window.removeEventListener("pointercancel", release);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", release);
        window.addEventListener("pointercancel", release);
      },
    [disabled, duration, onSoundtrackChange, soundtrack, speed, timeAt],
  );

  /**
   * A zoom region's body and its two edges, the soundtrack's geometry again.
   *
   * The body slides it and the edges resize it, snapped to the frame grid and
   * bounded by its neighbours, so two regions can never overlap. A press
   * selects the region before anything moves. A press that does not move on
   * the region already selected deselects it, which is the one way to put the
   * marker away without picking another.
   */
  const dragZoom = useCallback(
    (region: ZoomRegion, part: "body" | "head" | "tail") =>
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        event.preventDefault();
        event.stopPropagation();
        onZoomSelect(region.id);
        event.currentTarget.setPointerCapture(event.pointerId);

        const origin = timeAt(event.clientX);
        const from = region;
        const { lo, hi } = roomFor(zooms, region.id, duration);
        const length = from.end - from.start;
        const wasSelected = selectedZoom === region.id;
        let moved = false;

        const move = (ev: PointerEvent) => {
          const by = timeAt(ev.clientX) - origin;
          if (!moved && Math.abs(by) < FRAME / 2) return;
          moved = true;

          if (part === "body") {
            const start = snap(clamp(from.start + by, lo, hi - length));
            onZoomChange({ ...from, start, end: start + length });
          } else if (part === "head") {
            onZoomChange({
              ...from,
              start: snap(clamp(from.start + by, lo, from.end - MIN_ZOOM_LENGTH)),
            });
          } else {
            onZoomChange({
              ...from,
              end: snap(clamp(from.end + by, from.start + MIN_ZOOM_LENGTH, hi)),
            });
          }
        };

        const release = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", release);
          window.removeEventListener("pointercancel", release);
          if (!moved && wasSelected) onZoomSelect(null);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", release);
        window.addEventListener("pointercancel", release);
      },
    [disabled, duration, onZoomChange, onZoomSelect, selectedZoom, timeAt, zooms],
  );

  const selectedRegion = zooms.find((z) => z.id === selectedZoom) ?? null;

  const first = trim.start / duration;
  const last = trim.end / duration;
  const trimmed = trim.start > 0 || trim.end < duration;

  return (
    <div
      className={cn(
        "select-none px-4 py-3 sm:px-5",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {/* Equal side columns rather than `justify-between`, which hands the
          middle whatever is left and walks the transport sideways every time
          the readout gains a digit or picks up its "of" clause. Below `@sm` of
          the panel the three cannot share a line, so the clocks take one and
          the pill sits centred under them. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 @max-sm:grid-cols-2">
        {/* Where the playhead is, exactly. The lane says roughly, and roughly
            is not enough to cut on. */}
        <span
          ref={clockRef}
          className="text-[13px] tabular-nums text-foreground"
        >
          {formatPrecise(0, duration)}
        </span>

        {/* The same recessed pill the canvas toolbar gives its zoom cluster, so
            the two groups of icon buttons read as the same kind of thing. */}
        <div className="flex items-center gap-0.5 rounded-full bg-track p-0.5 @max-sm:order-3 @max-sm:col-span-2 @max-sm:mt-1 @max-sm:justify-self-center">
          <Transport label="Back to the start" onClick={stop}>
            <SquareIcon className="size-3.5" aria-hidden="true" />
          </Transport>
          <Transport label="Step back one frame" onClick={() => step(-FRAME)}>
            <StepBackIcon className="size-4" aria-hidden="true" />
          </Transport>
          <Transport
            label={playing ? "Pause (Space)" : "Play (Space)"}
            onClick={onToggle}
          >
            {/* Stacked and cross-faded rather than swapped. This control is
                pressed twice in a row more than any other here, and a glyph
                that pops in reads as the button flickering. Both sit in the
                same box, so it is never briefly empty. */}
            <span className="relative grid size-4 place-items-center">
              <PauseIcon
                aria-hidden="true"
                className={cn(
                  "absolute size-4 transition-all duration-150",
                  playing ? "scale-100 opacity-100" : "scale-75 opacity-0",
                )}
              />
              <PlayIcon
                aria-hidden="true"
                className={cn(
                  "absolute size-4 transition-all duration-150",
                  playing ? "scale-75 opacity-0" : "scale-100 opacity-100",
                )}
              />
            </span>
          </Transport>
          <Transport
            label="Step forward one frame"
            onClick={() => step(FRAME)}
          >
            <StepForwardIcon className="size-4" aria-hidden="true" />
          </Transport>
          {/* A toggle's label names what a press will do, not what is true:
              the pressed styling and `aria-pressed` already say the state. */}
          <Transport
            label={looping ? "Stop looping" : "Loop the clip"}
            onClick={() => setLooping(!looping)}
            pressed={looping}
          >
            <RepeatIcon className="size-4" aria-hidden="true" />
          </Transport>
        </div>

        <span className="flex items-center justify-self-end gap-1.5 text-right text-[13px] text-muted-foreground">
          <span>
            <span className="tabular-nums text-foreground">
              {formatPrecise(trim.end - trim.start, duration)}
            </span>
            {trimmed && (
              <span className="tabular-nums"> of {formatPrecise(duration)}</span>
            )}
          </span>
          {/* A disclosure, so `aria-expanded` rather than `aria-pressed`, and
              the open-trigger hover the button variant ties to that attribute
              is switched off: this is not a menu that is open. */}
          <Transport
            label={collapsed ? "Show the timeline" : "Hide the timeline"}
            onClick={() => setCollapsed(!collapsed)}
            expanded={!collapsed}
            controls="trim-timeline"
            className="aria-expanded:bg-transparent"
          >
            {collapsed ? (
              <ChevronUpIcon className="size-4" aria-hidden="true" />
            ) : (
              <ChevronDownIcon className="size-4" aria-hidden="true" />
            )}
          </Transport>
        </span>
      </div>

      {/* Folded by transitioning the grid row rather than by measuring a
          height, so nothing here has to know how tall the soundtrack row is.
          `inert` keeps the handles and chips out of the tab order while they
          are out of sight. */}
      <div
        id="trim-timeline"
        inert={collapsed}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        {/* `pb-1` leaves room for the focus ring on the bottom row's buttons,
            which the clip would otherwise take the lower edge off. */}
        <div className="min-h-0 overflow-hidden">
          <div className="pt-2 pb-1">
            {/* The lane is a region the pointer scrubs rather than a control. Both
                handles in it are real sliders with their own keyboard behaviour,
                which is what a keyboard needs here. */}
            <div
              ref={laneRef}
              onPointerDown={scrub}
              className="relative h-9 cursor-grab touch-none active:cursor-grabbing"
            >
              {/* What is cut. A rail rather than a second tone across the same bar:
                  two fills a few steps apart over one flat lane read as one lane, so
                  the height is what says which part survives. */}
              <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-track" />

              {/* What is kept. */}
              <div
                className="absolute inset-y-0 rounded-md bg-track-active"
                style={{
                  left: `calc(${at(first)} + ${INSET}px)`,
                  width: at(last - first),
                }}
              />

              {/* Brand is spent once on this surface, and this is it: the playhead
                  has to be told apart from the two handles at a glance. */}
              <div
                ref={playheadRef}
                aria-hidden="true"
                className="absolute inset-y-1.5 left-1 w-0.5 rounded-full bg-brand"
              />

              <Handle
                label="Trim start"
                value={trim.start}
                duration={duration}
                position={at(first)}
                onPointerDown={dragHandle("start")}
                onKeyDown={nudge("start")}
              />
              <Handle
                label="Trim end"
                value={trim.end}
                duration={duration}
                position={at(last)}
                onPointerDown={dragHandle("end")}
                onKeyDown={nudge("end")}
              />
            </div>

            {/* Zoom regions, under the picture's lane and on its axis. A press on
                the bare lane puts the marker away. */}
            {zooms.length > 0 && (
              <div
                className="relative mt-1 h-7"
                onPointerDown={() => onZoomSelect(null)}
              >
                {zooms.map((region) => {
                  const selected = region.id === selectedZoom;
                  return (
                    <div key={region.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Zoom ${formatSpeed(region.scale)}, ${formatPrecise(region.start, duration)} to ${formatPrecise(region.end, duration)}`}
                        aria-pressed={selected}
                        onPointerDown={dragZoom(region, "body")}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onZoomSelect(selected ? null : region.id);
                          }
                        }}
                        className={cn(
                          "absolute inset-y-0 flex cursor-grab items-center justify-center overflow-hidden rounded-md bg-elevated text-[11px] tabular-nums ring-1 transition-colors duration-150 active:cursor-grabbing",
                          "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          selected
                            ? "text-foreground ring-brand"
                            : "text-muted-foreground ring-stroke hover:text-foreground",
                        )}
                        style={{
                          left: `calc(${at(region.start / duration)} + ${INSET}px)`,
                          width: at((region.end - region.start) / duration),
                        }}
                      >
                        {formatSpeed(region.scale)}
                      </div>
                      <LaneEdge
                        label="Zoom start"
                        position={at(region.start / duration)}
                        onPointerDown={dragZoom(region, "head")}
                      />
                      <LaneEdge
                        label="Zoom end"
                        position={at(region.end / duration)}
                        onPointerDown={dragZoom(region, "tail")}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Laid under the picture on the same axis, so where the sound starts is
                read against where the clip does rather than described in a number. */}
            {soundtrack && (
              <div className="relative mt-1 h-7">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      ref={regionRef}
                      role="group"
                      aria-label={`Soundtrack, ${soundtrack.name}`}
                      onPointerDown={dragSound("body")}
                      // Back to the top of the file, keeping the region where it is.
                      // A slip is easy to lose track of and this is the way back.
                      onDoubleClick={() =>
                        onSoundtrackChange({
                          ...soundtrack,
                          start: 0,
                          end: soundtrack.end - soundtrack.start,
                        })
                      }
                      className="absolute inset-y-0 cursor-grab overflow-hidden rounded-md bg-elevated ring-1 ring-stroke active:cursor-grabbing"
                      // Stretched by the speed. The track keeps its own tempo while
                      // the picture races past it, so a second of sound covers two
                      // seconds of a 2x lane, and the waveform is drawn to that.
                      style={{
                        left: `calc(${at(soundtrack.offset / duration)} + ${INSET}px)`,
                        width: at(
                          ((soundtrack.end - soundtrack.start) * speed) / duration,
                        ),
                      }}
                    >
                      <Wave
                        wave={shape}
                        from={soundtrack.start}
                        to={soundtrack.end}
                        width={laneWidth}
                        duration={duration}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Drag to move, scroll to slip, double-click to reset
                  </TooltipContent>
                </Tooltip>

                <LaneEdge
                  label="Soundtrack start"
                  position={at(soundtrack.offset / duration)}
                  onPointerDown={dragSound("head")}
                />
                <LaneEdge
                  label="Soundtrack end"
                  position={at(
                    (soundtrack.offset +
                      (soundtrack.end - soundtrack.start) * speed) /
                      duration,
                  )}
                  onPointerDown={dragSound("tail")}
                />
              </div>
            )}

            {/* The axis is what turns the lane from two proportions into a length.
                It is `aria-hidden` because both handles already report their value in
                seconds, so a reader hears the numbers that matter. */}
            {/* `h-5` is what the row actually occupies: a 4px tick, 2px of gap, and
                an 11px label. At `h-4` the numbers painted outside their own box, so
                the margin below could not see them and the control under the axis sat
                against the labels however much it was given. */}
            <div aria-hidden="true" className="relative mt-1.5 h-5">
              {ticks(duration, laneWidth).map(({ at, major, label }) => (
                <div
                  key={at}
                  className="absolute top-0 flex flex-col items-start"
                  style={{ left: centre(at / duration) }}
                >
                  <span
                    className={cn(
                      "block w-px",
                      major ? "h-1 bg-stroke-strong" : "h-0.5 bg-stroke",
                      at > 0 && "-translate-x-1/2",
                    )}
                  />
                  {label && (
                    <span
                      className={cn(
                        "mt-0.5 block text-[11px] tabular-nums leading-none text-muted-foreground",
                        at > 0 && at < duration && "-translate-x-1/2",
                        at === duration && "-translate-x-full",
                      )}
                    >
                      {label}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept={AUDIO_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onSoundtrackAdd(file);
                event.target.value = "";
              }}
            />

            {/* Wraps, so on a phone the speed and the mutes drop to a second line
                rather than pushing past the panel's edge. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-1 gap-y-2">
              <div className="flex min-w-0 items-center gap-1">
                {soundtrack ? (
                  <>
                    <MusicIcon
                      className="ml-2 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 truncate text-[13px] text-muted-foreground">
                      {soundtrack.name}
                    </span>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <MusicIcon className="size-3.5" aria-hidden="true" />
                    Add a soundtrack
                  </Button>
                )}
                {/* One slot for the zoom: the add while nothing is selected, the
                    selected region's level and remove while one is. Swapping them in
                    place keeps the row's shape, and keeps the level chips away from
                    the speed pill on the right, where two runs of "2x" side by side
                    would read as one control. Deselecting brings the add back. */}
                {selectedRegion ? (
                  <div
                    role="group"
                    aria-label="Zoom level"
                    className="flex shrink-0 items-center gap-0.5 rounded-full bg-track p-0.5"
                  >
                    <ZoomInIcon
                      className="mx-1.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {ZOOM_LEVELS.map((level) => (
                      <Chip
                        key={level}
                        active={selectedRegion.scale === level}
                        onClick={() => onZoomChange({ ...selectedRegion, scale: level })}
                      >
                        {formatSpeed(level)}
                      </Chip>
                    ))}
                    {/* Follow the action or hold the aim. A toggle's label names
                        what a press will do. While the motion is being read the
                        glyph spins, which is the only wait in the editor. */}
                    <Transport
                      label={
                        selectedRegion.follow ? "Aim by hand instead" : "Follow the action"
                      }
                      onClick={() =>
                        onZoomChange({ ...selectedRegion, follow: !selectedRegion.follow })
                      }
                      pressed={Boolean(selectedRegion.follow)}
                    >
                      {zoomAnalyzing ? (
                        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <MousePointer2Icon className="size-4" aria-hidden="true" />
                      )}
                    </Transport>
                    <Transport label="Remove the zoom" onClick={onZoomRemove}>
                      <XIcon className="size-4" aria-hidden="true" />
                    </Transport>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onZoomAdd}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ZoomInIcon className="size-3.5" aria-hidden="true" />
                    Add a zoom
                  </Button>
                )}
              </div>

              {/* Wraps too, so at 320px the mutes drop under the speed pill rather
            than pushing the row past the panel. */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {/* The same recessed pill as the transport, with text chips rather
                    than glyphs: "2x" is its own label and needs no tooltip. The gauge
                    is what says the numbers are a rate rather than a zoom. */}
                <div
                  role="group"
                  aria-label="Playback speed"
                  className="flex items-center gap-0.5 rounded-full bg-track p-0.5"
                >
                  <GaugeIcon
                    className="mx-1.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {SPEED_OPTIONS.map((rate) => (
                    <Chip
                      key={rate}
                      active={speed === rate}
                      onClick={() => onSpeedChange(rate)}
                    >
                      {formatSpeed(rate)}
                    </Chip>
                  ))}
                </div>

                {/* One control per source, because a clip can arrive with sound and
                    then have music laid over it, and the two mix in the export rather
                    than one replacing the other. A single mute could only silence
                    both, which is not the question being asked when music is added
                    over a recording that already talks. Each names what it silences,
                    so two adjacent speaker glyphs are never ambiguous.

                    Past 1x the clip's own mute has nothing to do: the sound is out
                    of the file, so the preview is silent too, and the control says
                    why rather than toggling a state that changes nothing. */}
                <div className="flex items-center gap-0.5">
                  {hasClipSound && (
                    <Transport
                      label={
                        speed !== 1
                          ? `The clip's own sound is left out at ${formatSpeed(speed)}`
                          : muted
                            ? "Unmute the clip's own sound"
                            : "Mute the clip's own sound"
                      }
                      onClick={() => onMutedChange(!muted)}
                      disabled={speed !== 1}
                    >
                      {muted || speed !== 1 ? (
                        <VolumeXIcon className="size-4" aria-hidden="true" />
                      ) : (
                        <Volume2Icon className="size-4" aria-hidden="true" />
                      )}
                    </Transport>
                  )}
                  {soundtrack && (
                    <>
                      <Transport
                        label={musicMuted ? "Unmute the music" : "Mute the music"}
                        onClick={() => onMusicMutedChange(!musicMuted)}
                      >
                        {musicMuted ? (
                          <Music2Icon className="size-4 opacity-40" aria-hidden="true" />
                        ) : (
                          <Music2Icon className="size-4" aria-hidden="true" />
                        )}
                      </Transport>
                      <Transport
                        label="Remove the soundtrack"
                        onClick={onSoundtrackRemove}
                      >
                        <XIcon className="size-4" aria-hidden="true" />
                      </Transport>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The waveform, drawn to a canvas rather than laid out as elements.
 *
 * A lane a few hundred pixels wide is a few hundred bars, and a few hundred
 * divs redrawn on every frame of a drag is the one thing a canvas exists to
 * avoid.
 */
function Wave({
  wave,
  from,
  to,
  width,
  duration,
}: {
  wave: Waveform | null;
  from: number;
  to: number;
  /** The lane's own width, which is what tells the canvas it has resized. */
  width: number;
  duration: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !wave) return;

    // The tone is read off the element rather than named here, so the lane
    // follows the stylesheet's own token instead of a second copy of it.
    const colour = getComputedStyle(canvas).color;
    drawWaveform(canvas, wave, from, to, colour);
  }, [wave, from, to, width, duration]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="size-full text-muted-foreground"
    />
  );
}

/** An edge of a soundtrack or zoom region. Narrower than a trim handle, since
 * it sits on a shorter lane and there are four grips in one column of pixels. */
function LaneEdge({
  label,
  position,
  onPointerDown,
}: {
  label: string;
  position: string;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={label}
      onPointerDown={onPointerDown}
      style={{ left: position, width: HANDLE }}
      className="absolute inset-y-0 cursor-ew-resize touch-none rounded-md bg-stroke-strong transition-colors duration-150 hover:bg-foreground/70"
    />
  );
}

interface Tick {
  at: number;
  major: boolean;
  label?: string;
}

function ticks(duration: number, width: number): Tick[] {
  if (!duration || !width) return [];

  const step = tickInterval(duration, width);
  const perPixel = duration / width;
  // The finest subdivision whose marks still read as separate ones. None of
  // them fitting is the answer for a lane that is already dense with labels.
  const parts =
    SUBDIVISIONS.find((n) => step / n / perPixel >= MIN_MINOR_GAP) ?? 1;

  const marks: Tick[] = [];
  const minor = step / parts;

  for (let index = 0; index * minor <= duration + 1e-6; index++) {
    const at = Number((index * minor).toFixed(4));
    const major = index % parts === 0;
    marks.push({ at, major, label: major ? axisLabel(at, step, duration) : undefined });
  }
  return marks;
}

/** A text option inside a recessed pill, the shape the speed and zoom levels share. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-7 cursor-pointer rounded-full px-2 text-[13px] tabular-nums",
        "transition-all duration-150 active:scale-[0.97]",
        active
          ? "bg-track-active text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Transport({
  label,
  onClick,
  pressed,
  expanded,
  controls,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  /** For a disclosure: what it is showing, and the id of what it shows. */
  expanded?: boolean;
  controls?: string;
  /** Disabled, with the label saying why. */
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const button = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        pressed && "bg-track-active text-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button emits no pointer events of its own, so the
            reason it is disabled hangs off a wrapper instead. */}
        {disabled ? <span className="inline-flex">{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Handle({
  label,
  value,
  duration,
  position,
  onPointerDown,
  onKeyDown,
}: {
  label: string;
  value: number;
  duration: number;
  position: string;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={Number(value.toFixed(3))}
      aria-valuetext={formatPrecise(value, duration)}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      style={{ left: position, width: HANDLE }}
      className={cn(
        "absolute inset-y-0 grid cursor-ew-resize touch-none place-items-center",
        "rounded-md bg-foreground outline-none transition-colors duration-150",
        "hover:bg-foreground/90 active:bg-foreground/80",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
      )}
    >
      <span
        aria-hidden="true"
        className="h-3 w-0.5 rounded-full bg-background/60"
      />
    </div>
  );
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));
