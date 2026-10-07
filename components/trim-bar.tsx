"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GaugeIcon,
  LayersIcon,
  Loader2Icon,
  MousePointer2Icon,
  Music2Icon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  Redo2Icon,
  RepeatIcon,
  BlendIcon,
  ScissorsIcon,
  SparklesIcon,
  SquareSplitHorizontalIcon,
  Trash2Icon,
  SunDimIcon,
  SquareIcon,
  StepBackIcon,
  StepForwardIcon,
  Undo2Icon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
  ZoomInIcon,
} from "lucide-react";

import { TransitionPreview } from "@/components/transition-preview";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type Curve,
  type FadeRegion,
  MIN_FADE,
  bendCurve,
  bendOf,
  curveName,
  ease,
  roomFor as roomForFade,
} from "@/lib/clip-fade";
import {
  type Cut,
  type Segment,
  afterCuts,
  cutAt,
  keptSeconds,
  keptSegments,
  nearestKept,
  newCutId,
} from "@/lib/clip-cuts";
import {
  type Piece,
  type PieceEdit,
  type Split,
  fromLane,
  joinsBetween,
  pieces as piecesOf,
  resizePiece,
  toLane,
} from "@/lib/clip-pieces";
import {
  DEFAULT_TRANSITION_DURATION,
  TRANSITION_DURATIONS,
  type Transition,
  type TransitionKind,
  transitionKinds,
} from "@/lib/clip-transitions";
import {
  type ZoomRegion,
  type ZoomSuggestion,
  MIN_ZOOM_LENGTH,
  ZOOM_LEVELS,
  roomFor,
} from "@/lib/clip-zoom";
import { AUDIO_ACCEPT, formatPrecise } from "@/lib/media";
import { DEFAULT_PACE, FOLLOW_PACES } from "@/lib/motion";
import { drawWaveform, readWaveform, type Waveform } from "@/lib/waveform";
import { EDIT_FPS, SPEED_OPTIONS, formatSpeed } from "@/lib/video-export";
import { cn } from "@/lib/utils";
import type { Soundtrack, Trim } from "@/types/screenshot";

/**
 * The clip's pieces, and the preview's playhead.
 *
 * One control does both jobs because they are the same geometry. A lane a
 * reader can scrub is a lane a reader can cut, and building them separately
 * would put two timelines under one video that have to agree about where a
 * second is.
 *
 * The lane draws the output: the pieces sit end to end, so each carries its
 * own footage. `toLane` places a source time on it and `fromLane` reads one
 * back, and every lane under it goes through the same pair.
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

/** The transition select's own value for a straight cut, since a select needs a string. */
const NO_TRANSITION = "none";

/*
 * The fade's ramp, in a 0 to 100 box the block stretches to.
 *
 * `y` is the level upside down, since SVG counts down: a fill from the line to
 * the bottom is then exactly as tall as the picture is opaque, which is how a
 * fade is drawn everywhere it is drawn at all.
 */
const rampY = (fade: FadeRegion, x: number) => {
  const eased = ease(fade.curve, x);
  return (1 - (fade.kind === "in" ? eased : 1 - eased)) * 100;
};

/** The line itself, as a bezier in that box. */
function rampLine(fade: FadeRegion): string {
  const [x1, y1, x2, y2] = fade.curve;
  const flip = (y: number) => (fade.kind === "in" ? 1 - y : y);
  return [
    `M 0,${fade.kind === "in" ? 100 : 0}`,
    `C ${x1 * 100},${flip(y1) * 100}`,
    `${x2 * 100},${flip(y2) * 100}`,
    `100,${fade.kind === "in" ? 0 : 100}`,
  ].join(" ");
}

/** The same line closed to the floor, which is the level as an area. */
const rampPath = (fade: FadeRegion) =>
  `${rampLine(fade)} L ${fade.kind === "in" ? 100 : 0},100 Z`;

/** Where the handle sits on it, as a fraction from the top. */
const rampMid = (fade: FadeRegion) => rampY(fade, 0.5) / 100;

/** Which part of a lane instance a gesture is moving. */
type LanePart = "body" | "head" | "tail";

/** One keyboard step, and the coarse one Shift gives. */
const STEP = FRAME;
const COARSE = 1;

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
  /**
   * Stretches removed from the source. They take no room on the lane: the
   * pieces either side of one meet at a join.
   */
  cuts: Cut[];
  /**
   * Split points on the source's axis. The kept clip is pieces between the
   * splits and the cuts: an edge drag trims one, a press selects one, and
   * Delete takes it out.
   */
  splits: Split[];
  /** The selected piece's start, or null. */
  selectedPiece: number | null;
  /**
   * The selected join between two pieces, by the source time the second one
   * opens on. A join is where a transition is set, whether it is a split or a
   * cut underneath.
   */
  selectedJoin: number | null;
  onJoinSelect: (at: number | null) => void;
  onJoinTransition: (at: number, transition: Transition | undefined) => void;
  /**
   * Takes a join away: two pieces of continuous footage become one, and a
   * cut's footage comes back between the two pieces.
   */
  onJoinRemove: (at: number) => void;
  onPieceSelect: (start: number | null) => void;
  /** A piece resized: the edit that results, and where the piece now starts. */
  onPiecesChange: (edit: PieceEdit, selected: number) => void;
  onSplit: () => void;
  /** Deletes the selected piece at once, for the keyboard. Undo covers it. */
  onPieceDelete: () => void;
  /** Asks to delete the selected piece, for the button. The owner confirms. */
  onPieceRemove: () => void;
  /** Stretches where the picture arrives or leaves, on their own lane. */
  fades: FadeRegion[];
  selectedFade: string | null;
  onFadeAdd: () => void;
  onFadeChange: (fade: FadeRegion) => void;
  onFadeSelect: (id: string | null) => void;
  onFadeRemove: () => void;
  /** Opens the curve editor for the selected fade. */
  onFadeCurveEdit: () => void;
  /** Walks the clip's edits back and forward. The history is the owner's. */
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** 0 to 1 while the clip's motion is being read, null otherwise. */
  motionProgress: number | null;
  onZoomAdd: () => void;
  /** Follow the action or aim by hand. The owner asks before a first read. */
  onZoomFollow: (zoom: ZoomRegion) => void;
  /** Proposed regions, drawn as ghosts on the lane while `suggesting`. */
  suggestions: ZoomSuggestion[];
  suggesting: boolean;
  onSuggestToggle: () => void;
  onSuggestionAccept: (suggestion: ZoomSuggestion) => void;
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
  cuts,
  splits,
  selectedPiece,
  onPieceSelect,
  onPiecesChange,
  onSplit,
  onPieceDelete,
  onPieceRemove,
  selectedJoin,
  onJoinSelect,
  onJoinTransition,
  onJoinRemove,
  fades,
  selectedFade,
  onFadeAdd,
  onFadeChange,
  onFadeSelect,
  onFadeRemove,
  onFadeCurveEdit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  motionProgress,
  onZoomAdd,
  onZoomFollow,
  suggestions,
  suggesting,
  onSuggestToggle,
  onSuggestionAccept,
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
  const fadeLaneRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  /** The playhead's knob, whose value the loop writes like the clock's text. */
  const knobRef = useRef<HTMLSpanElement>(null);
  // The lane's usable span in px, kept in a ref because the playhead is
  // written every frame and must not render anything.
  const spanRef = useRef(0);
  // The live trim and the live seek, for the frame loop. It is bound once and
  // would otherwise close over the values this component mounted with. Written
  // in an effect rather than during render, which is not a ref's to do.
  const rangeRef = useRef(trim);
  // The frame loop steps over cuts, and it is bound once, so it reads them
  // from here rather than closing over the list it mounted with.
  const cutsRef = useRef(cuts);
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
    cutsRef.current = cuts;
    seekRef.current = onSeek;
    loopRef.current = looping;
    playbackRef.current = onPlayback;
    soundRef.current = soundtrack;
    changeSoundRef.current = onSoundtrackChange;
  }, [trim, cuts, onSeek, looping, onPlayback, soundtrack, onSoundtrackChange]);

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

      // A cut has no frames, so playback steps over it rather than through it.
      // Only while playing: a paused playhead parked at a cut's own start is
      // showing the last frame that survives, which is the right frame, and a
      // loop that moved it would fight a scrub.
      if (!element.seeking && !element.paused) {
        const jump = afterCuts(rangeRef.current, cutsRef.current, time);
        if (jump > time) {
          seekRef.current(jump);
          return;
        }
      }

      // Placed through the same map as the pieces, since the lane draws the
      // output. The clock reads the output's time off it, counted from the
      // first piece, so it agrees with the ruler.
      const segments = keptSegments(rangeRef.current, cutsRef.current);
      const x = toLane(segments, time);
      const fraction = Math.min(Math.max(x / duration, 0), 1);
      playhead.style.transform = `translateX(${fraction * spanRef.current}px)`;

      // Written rather than rendered, for the same reason as the playhead: a
      // readout to the millisecond changes on every frame, and none of those
      // changes is worth a render.
      const out = Math.max(x - (segments[0]?.start ?? 0), 0);
      const clock = clockRef.current;
      const text = formatPrecise(out, duration);
      if (clock && clock.textContent !== text) clock.textContent = text;
      const knob = knobRef.current;
      if (knob && knob.getAttribute("aria-valuetext") !== text) {
        knob.setAttribute("aria-valuetext", text);
        knob.setAttribute("aria-valuenow", out.toFixed(3));
      }
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
    const target = clamp(
      element.currentTime + by * speed,
      trim.start,
      trim.end - FRAME,
    );
    // A step that lands in a cut carries on the way it was going. The nearer
    // edge is wrong here: one frame into a cut it is the frame just left, so
    // the button would appear dead.
    const cut = cutAt(cuts, target);
    const to = !cut ? target : by > 0 ? cut.end : cut.start - FRAME;
    onSeek(clamp(to, trim.start, trim.end - FRAME));
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

  /** Where a client x lands on the lane, in the lane's own seconds. */
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

  /**
   * A drag's lane distance as a source distance, measured at the point that
   * moves. Across a join the two differ by the cut under it, and measuring at
   * the moving point keeps that point under the pointer. Read at event time,
   * so the refs are current.
   */
  const sourceBy = useCallback((time: number, by: number) => {
    const segments = keptSegments(rangeRef.current, cutsRef.current);
    return fromLane(segments, toLane(segments, time) + by) - time;
  }, []);

  /**
   * A press on the lane seeks, and holding it drags the playhead along.
   *
   * Clamped into the trim, since a playhead outside the range is a frame that
   * will not be in the export, and short of the out point by a frame, or the
   * loop above reads the scrub as the clip ending and snaps back to the start
   * under the hand.
   */
  const scrubFrom = useCallback(
    (event: React.PointerEvent) => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      // Paused for the drag. Playback fights a scrub for the same clock, and
      // what comes out is the video stuttering rather than being moved.
      onPlayback(false);

      const to = (clientX: number) => {
        const { start, end } = rangeRef.current;
        // Snapped out of any cut it lands in, so the frame under the hand is
        // always one that will be in the export. The nearer edge, so the
        // playhead does not run ahead of the pointer.
        const kept = nearestKept(
          rangeRef.current,
          cutsRef.current,
          fromLane(
            keptSegments(rangeRef.current, cutsRef.current),
            timeAt(clientX),
          ),
        );
        onSeek(clamp(kept, start, end - FRAME));
      };
      to(event.clientX);

      const move = (moved: PointerEvent) => to(moved.clientX);
      const release = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", release);
        window.removeEventListener("pointercancel", release);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
    },
    [disabled, onPlayback, onSeek, timeAt],
  );

  /**
   * A press on the bare lane: puts every selection away and scrubs. A press
   * on a piece or a join stops propagating, so this only ever fires away from
   * one.
   */
  const scrub = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      onJoinSelect(null);
      onPieceSelect(null);
      scrubFrom(event);
    },
    [disabled, onJoinSelect, onPieceSelect, scrubFrom],
  );

  /**
   * A press on a piece selects it, and the same press scrubs, so a drag
   * across the pieces moves the playhead the way a drag on the bare lane
   * does. A piece does not move: the lane draws the output, so where a piece
   * sits is decided by the pieces before it, and its footage goes with it.
   * A clip in one piece has nothing to select.
   */
  const pressPiece = useCallback(
    (piece: Piece, selectable: boolean) =>
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (disabled || event.button !== 0) return;
        onJoinSelect(null);
        onPieceSelect(selectable ? piece.start : null);
        scrubFrom(event);
      },
    [disabled, onJoinSelect, onPieceSelect, scrubFrom],
  );

  /**
   * Drags one edge of a piece, the way a clip is trimmed in an editor. The
   * pieces after it close up or make room, so nothing is left as a gap.
   *
   * The pointer's travel is the edge's travel through the footage. An end
   * edge and the first piece's start edge stay under the pointer. Any other
   * start edge stays at its join while the piece's own footage moves under
   * it, since the piece before it holds that place. The playhead follows the
   * edge, so the frame under it is on the canvas.
   */
  const resizeEdge = useCallback(
    (piece: Piece, edge: "start" | "end", selectable: boolean) =>
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        onJoinSelect(null);
        onPieceSelect(selectable ? piece.start : null);
        onPlayback(false);

        const base = { trim: rangeRef.current, cuts: cutsRef.current, splits };
        const origin = timeAt(event.clientX);
        const from = edge === "start" ? piece.start : piece.end;
        const move = (ev: PointerEvent) => {
          const next = resizePiece(
            base.trim,
            base.cuts,
            base.splits,
            piece,
            edge,
            snap(from + timeAt(ev.clientX) - origin),
            duration,
            newCutId,
          );
          onPiecesChange(next, next.piece.start);
          onSeek(
            edge === "start"
              ? next.piece.start
              : Math.max(next.piece.end - FRAME, next.piece.start),
          );
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
    [
      disabled,
      duration,
      onJoinSelect,
      onPieceSelect,
      onPiecesChange,
      onPlayback,
      onSeek,
      splits,
      timeAt,
    ],
  );

  /**
   * The playhead's own keys: a frame a press, a second with Shift. A plain
   * handler rather than a memoised one, since it reads the element's clock
   * when the key lands.
   */
  const nudgePlayhead = (event: React.KeyboardEvent) => {
      const by =
        event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (!by) return;
      event.preventDefault();
      onPlayback(false);
      const now = video.current?.currentTime ?? rangeRef.current.start;
      const { start, end } = rangeRef.current;
      onSeek(
        clamp(
          nearestKept(
            rangeRef.current,
            cutsRef.current,
            now + by * (event.shiftKey ? COARSE_STEP : FRAME),
          ),
          start,
          end - FRAME,
        ),
      );
  };

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
   * A soundtrack moved by `by` seconds of the lane, bounded and snapped.
   *
   * `slip` is the fourth gesture the wheel and an Alt-drag do: the region
   * holds still and a different stretch of the file plays through it. Every
   * one of them keeps the region inside the clip, since a part hanging off
   * either end cannot be heard.
   */
  const shiftSound = useCallback(
    (from: Soundtrack, part: LanePart | "slip", by: number): Soundtrack => {
      const length = from.end - from.start;
      const span = length * speed;

      if (part === "slip") {
        const step = snap(clamp(by / speed, -from.start, from.duration - from.end));
        return { ...from, start: from.start + step, end: from.end + step };
      }

      // The region sits on the lane, which draws the output, and the sound
      // plays straight through a join. So it is moved in lane seconds and its
      // anchor is read back off the lane. The props rather than the mirror
      // refs: the edit cannot change while the sound is being moved.
      const segments = keptSegments(trim, cuts);
      const end = toLane(segments, duration);
      const left = toLane(segments, from.offset);

      if (part === "body") {
        return {
          ...from,
          offset: fromLane(
            segments,
            snap(clamp(left + by, 0, Math.max(end - span, 0))),
          ),
        };
      }
      if (part === "head") {
        const room =
          snap(
            left +
              clamp(
                by,
                -Math.min(from.start * speed, left),
                (length - MIN_TRIM) * speed,
              ),
          ) - left;
        return {
          ...from,
          offset: fromLane(segments, left + room),
          start: from.start + room / speed,
        };
      }
      return {
        ...from,
        end: snap(
          clamp(
            from.end + by / speed,
            from.start + MIN_TRIM,
            Math.min(from.duration, from.start + (end - left) / speed),
          ),
        ),
      };
    },
    [cuts, duration, speed, trim],
  );

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
   * Two clocks meet here. `offset` is on the source's, and `start` and `end`
   * are on the track's own, which is also the output's. At 2x a second of
   * track covers two seconds of lane, so a lane distance `by` is `by / speed`
   * of track, and a track length is `length * speed` of lane. `shiftSound`
   * holds the arithmetic for a drag and the keyboard alike.
   */
  const dragSound = useCallback(
    (part: "body" | "head" | "tail") =>
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (disabled || !soundtrack) return;
        event.preventDefault();
        event.stopPropagation();

        // Paused for the drag, like everything else dragged on these lanes,
        // so the sound is placed against a still picture and the two are not
        // both moving at once.
        onPlayback(false);

        const origin = timeAt(event.clientX);
        const from = soundtrack;
        // The mode is fixed at the press rather than read per sample, so
        // letting go of Alt mid-drag cannot turn one edit into the other.
        const slipping = part === "body" && event.altKey;
        event.currentTarget.setPointerCapture(event.pointerId);

        const move = (moved: PointerEvent) => {
          const by = timeAt(moved.clientX) - origin;
          onSoundtrackChange(shiftSound(from, slipping ? "slip" : part, by));
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
    [disabled, onPlayback, onSoundtrackChange, shiftSound, soundtrack, timeAt],
  );

  /**
   * A zoom region's body and its two edges, the soundtrack's geometry again.
   *
   * The body slides it and the edges resize it, snapped to the frame grid and
   * bounded by its neighbours, so two regions can never overlap. A press
   * selects the region before anything moves. A press that does not move on
   * the region already selected deselects it, which is the one way to put the
   * marker away without picking another.
   *
   * Paused for the drag and resumed on release, like a trim handle, and the
   * playhead follows the edge being moved, clamped into the trim so the loop
   * does not fight it: the frame under the edge is what decides where a zoom
   * should start or stop, and it is gone before it can be read otherwise.
   */
  /**
   * A zoom moved by `by` seconds, bounded and snapped.
   *
   * One arithmetic with two consumers, the same split the export and the
   * preview make: a drag passes the region it started from and the whole
   * distance travelled, the keyboard passes the region as it is and one step.
   * Neither has bounds of its own to get wrong.
   */
  const shiftZoom = useCallback(
    (region: ZoomRegion, part: LanePart, by: number): ZoomRegion => {
      const { lo, hi } = roomFor(zooms, region.id, duration);
      const length = region.end - region.start;

      if (part === "body") {
        const start = snap(clamp(region.start + by, lo, hi - length));
        return { ...region, start, end: start + length };
      }
      if (part === "head") {
        return {
          ...region,
          start: snap(
            clamp(region.start + by, lo, region.end - MIN_ZOOM_LENGTH),
          ),
        };
      }
      return {
        ...region,
        end: snap(clamp(region.end + by, region.start + MIN_ZOOM_LENGTH, hi)),
      };
    },
    [duration, zooms],
  );

  const dragZoom = useCallback(
    (region: ZoomRegion, part: LanePart) =>
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        event.preventDefault();
        event.stopPropagation();
        onZoomSelect(region.id);
        event.currentTarget.setPointerCapture(event.pointerId);

        onPlayback(false);

        const origin = timeAt(event.clientX);
        const from = region;
        const wasSelected = selectedZoom === region.id;
        let moved = false;
        const show = (time: number) =>
          onSeek(clamp(time, rangeRef.current.start, rangeRef.current.end - FRAME));

        const move = (ev: PointerEvent) => {
          const by = timeAt(ev.clientX) - origin;
          if (!moved && Math.abs(by) < FRAME / 2) return;
          moved = true;

          const next = shiftZoom(
            from,
            part,
            sourceBy(part === "tail" ? from.end : from.start, by),
          );
          onZoomChange(next);
          show(part === "tail" ? next.end - FRAME : next.start);
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
    [
      disabled,
      onPlayback,
      onSeek,
      onZoomChange,
      onZoomSelect,
      selectedZoom,
      shiftZoom,
      sourceBy,
      timeAt,
    ],
  );

  /** A fade moved by `by` seconds, bounded and snapped. `shiftZoom`'s twin. */
  const shiftFade = useCallback(
    (fade: FadeRegion, part: LanePart, by: number): FadeRegion => {
      const { lo, hi } = roomForFade(fades, fade.id, duration);
      const length = fade.end - fade.start;

      if (part === "body") {
        const start = snap(clamp(fade.start + by, lo, hi - length));
        return { ...fade, start, end: start + length };
      }
      if (part === "head") {
        return {
          ...fade,
          start: snap(clamp(fade.start + by, lo, fade.end - MIN_FADE)),
        };
      }
      return {
        ...fade,
        end: snap(clamp(fade.end + by, fade.start + MIN_FADE, hi)),
      };
    },
    [duration, fades],
  );

  const dragFade = useCallback(
    (fade: FadeRegion, part: LanePart) =>
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        event.preventDefault();
        event.stopPropagation();
        onFadeSelect(fade.id);
        event.currentTarget.setPointerCapture(event.pointerId);
        onPlayback(false);

        const origin = timeAt(event.clientX);
        const from = fade;
        const wasSelected = selectedFade === fade.id;
        let moved = false;
        const show = (time: number) =>
          onSeek(clamp(time, rangeRef.current.start, rangeRef.current.end - FRAME));

        const move = (ev: PointerEvent) => {
          const by = timeAt(ev.clientX) - origin;
          if (!moved && Math.abs(by) < FRAME / 2) return;
          moved = true;
          const next = shiftFade(
            from,
            part,
            sourceBy(part === "tail" ? from.end : from.start, by),
          );
          onFadeChange(next);
          show(part === "tail" ? next.end - FRAME : next.start);
        };

        const release = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", release);
          window.removeEventListener("pointercancel", release);
          if (!moved && wasSelected) onFadeSelect(null);
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", release);
        window.addEventListener("pointercancel", release);
      },
    [
      disabled,
      onFadeChange,
      onFadeSelect,
      onPlayback,
      onSeek,
      selectedFade,
      shiftFade,
      sourceBy,
      timeAt,
    ],
  );

  /**
   * Bends the ramp by dragging its handle.
   *
   * The pointer's height in the lane is the level it is asking for, and the
   * bend follows it: up is a ramp that holds high, which for a fade in means
   * arriving fast and for a fade out means leaving late, so the two are read
   * the same way off the shape.
   */
  const bendFade = useCallback(
    (fade: FadeRegion) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      onFadeSelect(fade.id);
      event.currentTarget.setPointerCapture(event.pointerId);
      onPlayback(false);

      const lane = fadeLaneRef.current;
      if (!lane) return;
      const rect = lane.getBoundingClientRect();

      const move = (moved: PointerEvent) => {
        const from = clamp((moved.clientY - rect.top) / rect.height, 0, 1);
        const level = fade.kind === "in" ? 1 - from : from;
        // Doubled, so the lane's full height reaches the family's own limits
        // rather than only half of them.
        onFadeChange({ ...fade, curve: bendCurve((level - 0.5) * 2) });
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
    [disabled, onFadeChange, onFadeSelect, onPlayback],
  );

  /**
   * The keyboard half of every lane instance.
   *
   * The same gestures a pointer has, so a reader who cannot drag is not left
   * with a control that only reports its value. Arrows move by one frame of
   * the export and Shift by a second, which is what the trim's own handles
   * already do. Delete removes, and Enter or Space selects and deselects.
   *
   * The playhead follows the part being moved, for the same reason a drag
   * pauses and seeks: the frame under an edge is what decides where it
   * belongs.
   */
  const laneKeys = useCallback(
    <T,>(options: {
      part: LanePart;
      shift: (by: number) => T;
      apply: (next: T) => void;
      at: (next: T) => number;
      onRemove?: () => void;
      onToggle?: () => void;
    }) =>
      (event: React.KeyboardEvent) => {
        if (disabled) return;
        const { key, shiftKey } = event;

        if (key === "Enter" || key === " ") {
          if (!options.onToggle) return;
          event.preventDefault();
          options.onToggle();
          return;
        }
        if (key === "Delete" || key === "Backspace") {
          if (!options.onRemove) return;
          event.preventDefault();
          options.onRemove();
          return;
        }

        const step = shiftKey ? COARSE : STEP;
        const by =
          key === "ArrowLeft" || key === "ArrowDown"
            ? -step
            : key === "ArrowRight" || key === "ArrowUp"
              ? step
              : 0;
        if (!by) return;

        event.preventDefault();
        onPlayback(false);
        const next = options.shift(by);
        options.apply(next);
        onSeek(clamp(options.at(next), trim.start, trim.end - FRAME));
      },
    [disabled, onPlayback, onSeek, trim.end, trim.start],
  );

  const selectedRegion = zooms.find((z) => z.id === selectedZoom) ?? null;
  const selectedRamp = fades.find((f) => f.id === selectedFade) ?? null;

  // What the file will run, in seconds before the speed: the trim less every
  // cut. It is also the length the pieces take on the lane.
  const kept = keptSeconds(trim, cuts);
  // The lane's map, and where on it a source time or a stretch lands, as a
  // fraction of the lane. The lane keeps the whole source's width, so its
  // scale does not change under a drag.
  const segments: Segment[] = keptSegments(trim, cuts);
  const lane = (time: number) => toLane(segments, time) / duration;
  const laneSpan = (start: number, end: number) => lane(end) - lane(start);
  /** Where the first piece starts on the lane, which is the output's zero. */
  const origin = segments[0]?.start ?? trim.start;
  // The kept clip as pieces. `split` is whether it is in more than one, which
  // is when a piece is something to pick.
  const laneItems: Piece[] = piecesOf(trim, cuts, splits);
  const split = laneItems.length > 1;
  const joins = joinsBetween(trim, cuts, splits);
  const selectedJoinValue =
    selectedJoin === null
      ? null
      : (joins.find((j) => Math.abs(j.at - selectedJoin) < 1e-6) ?? null);
  // A join with a cut under it brings footage back when it is removed, and a
  // split only joins two pieces of continuous footage, so the two say so.
  const selectedJoinIsCut =
    selectedJoinValue !== null &&
    cuts.some((c) => Math.abs(c.end - selectedJoinValue.at) < 1e-6);
  const selectedPieceValue = split
    ? (laneItems.find((p) => Math.abs(p.start - (selectedPiece ?? NaN)) < 1e-6) ?? null)
    : null;
  const trimmed = trim.start > 0 || trim.end < duration || cuts.length > 0;

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
        {/* Undo and redo sit here rather than in the transport pill: that pill
            is playback, and these are the edits. Beside the clock, which is
            the other thing in this row that is about where the work is. */}
        <div className="flex min-w-0 items-center gap-1">
          {/* Where the playhead is, exactly. The lane says roughly, and roughly
              is not enough to cut on. */}
          <span
            ref={clockRef}
            className="text-[13px] tabular-nums text-foreground"
          >
            {formatPrecise(0, duration)}
          </span>
          <div className="flex items-center">
            <Transport
              label="Undo (Cmd Z)"
              onClick={onUndo}
              disabled={!canUndo}
            >
              <Undo2Icon className="size-4" aria-hidden="true" />
            </Transport>
            <Transport
              label="Redo (Cmd Shift Z)"
              onClick={onRedo}
              disabled={!canRedo}
            >
              <Redo2Icon className="size-4" aria-hidden="true" />
            </Transport>
          </div>
        </div>

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
              {formatPrecise(kept, duration)}
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
              data-lane="video"
              onPointerDown={scrub}
              className="relative h-9 cursor-pointer touch-none"
            >
              {/* The source, as a rail. What the pieces leave of it is
                  footage the in point, the out point or a deleted piece took
                  off. It ends where the source does on the lane, since a cut
                  takes no room. */}
              <div
                className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-track"
                style={{ width: `calc(${at(lane(duration))} + ${HANDLE}px)` }}
              />

              {/* The pieces, end to end in the order they play. Each is drawn
                  where the output has it, so a piece carries its own footage
                  wherever the edits before it leave it, and there is never a
                  gap to close. Two pieces are drawn a hairline apart, so the
                  join reads as a division of the block. A piece is a lane
                  instance once there is more than one: selectable and
                  removable from the keyboard. The selected one is ringed in
                  the selection tone, since brand is the playhead's. */}
              {laneItems.map((piece, index) => {
                const lastPiece = index === laneItems.length - 1;
                const selected =
                  split && Math.abs(piece.start - (selectedPiece ?? NaN)) < 1e-6;
                return (
                  <div
                    key={piece.start}
                    role={split ? "button" : undefined}
                    tabIndex={split ? 0 : undefined}
                    aria-label={
                      split
                        ? `Piece, ${formatPrecise(piece.start, duration)} to ${formatPrecise(piece.end, duration)}`
                        : undefined
                    }
                    aria-pressed={split ? selected : undefined}
                    onPointerDown={pressPiece(piece, split)}
                    onKeyDown={
                      split
                        ? (event) => {
                            if (event.key === "Delete" || event.key === "Backspace") {
                              event.preventDefault();
                              onPieceDelete();
                            } else if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onPieceSelect(selected ? null : piece.start);
                            }
                          }
                        : undefined
                    }
                    onFocus={split ? () => onPieceSelect(piece.start) : undefined}
                    className={cn(
                      "group absolute inset-y-0 cursor-pointer rounded-md bg-track-active outline-none",
                      "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      selected && "ring-2 ring-selected ring-inset",
                    )}
                    style={{
                      left: `calc(${at(lane(piece.start))} + ${INSET}px)`,
                      width: `calc(${at(laneSpan(piece.start, piece.end))} - ${lastPiece ? 0 : 2}px)`,
                    }}
                  >
                    {/* Each edge trims the piece, the way a clip's does in an
                        editor, and the first piece's start and the last
                        piece's end are the clip's in and out points. A grip
                        shows on hover and stays on the selected piece, so
                        where to grab is never a guess. In one piece the grips
                        always show, since they are the only handles there
                        are. In the tab order only while the piece is selected
                        or alone, the rule every lane instance's edges
                        follow. */}
                    {(["start", "end"] as const).map((edge) => {
                      const value = edge === "start" ? piece.start : piece.end;
                      return (
                        <div
                          key={edge}
                          role="slider"
                          tabIndex={selected || !split ? 0 : -1}
                          aria-label={
                            split
                              ? edge === "start"
                                ? "Piece start"
                                : "Piece end"
                              : edge === "start"
                                ? "Clip start"
                                : "Clip end"
                          }
                          aria-valuemin={0}
                          aria-valuemax={duration}
                          aria-valuenow={Number(value.toFixed(3))}
                          aria-valuetext={formatPrecise(value, duration)}
                          onPointerDown={resizeEdge(piece, edge, split)}
                          onKeyDown={laneKeys({
                            part: edge === "start" ? "head" : "tail",
                            shift: (by) =>
                              resizePiece(
                                trim,
                                cuts,
                                splits,
                                piece,
                                edge,
                                value + by,
                                duration,
                                newCutId,
                              ),
                            apply: (next) => onPiecesChange(next, next.piece.start),
                            at: (next) =>
                              edge === "start" ? next.piece.start : next.piece.end,
                          })}
                          className={cn(
                            "absolute inset-y-0 z-10 flex w-2.5 cursor-ew-resize touch-none items-center justify-center rounded-md outline-none",
                            "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                            edge === "start" ? "left-0" : "right-0",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "h-4 w-1 rounded-full transition-colors duration-150",
                              selected || !split
                                ? "bg-foreground"
                                : "bg-transparent group-hover:bg-stroke-strong",
                            )}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Every join between two pieces can take a transition, a
                  split's and a cut's alike, since on the lane they are the
                  same thing. A dot on the join's bottom edge rather than the
                  whole height of the hairline, so a press higher up reaches
                  the pieces' own edges. At the bottom rather than the top,
                  since a split leaves the playhead standing on the join, and
                  its knob is at the top. */}
              {joins.map((join) => {
                const selected =
                  selectedJoin !== null && Math.abs(selectedJoin - join.at) < 1e-6;
                const toggle = () => onJoinSelect(selected ? null : join.at);
                return (
                  <Tooltip key={`join-${join.at}`}>
                    <TooltipTrigger asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Join at ${formatPrecise(join.at, duration)}`}
                        aria-pressed={selected}
                        onPointerDown={(event) => {
                          if (disabled) return;
                          event.preventDefault();
                          event.stopPropagation();
                          onPlayback(false);
                          toggle();
                          onSeek(join.at);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          toggle();
                        }}
                        className="absolute -bottom-1.5 z-20 grid size-3.5 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        style={{
                          left: `calc(${centre(lane(join.at))} - 8px)`,
                        }}
                      >
                        {join.transition ? (
                          <BlendIcon
                            className={cn(
                              "size-3.5 rounded-full bg-panel",
                              selected ? "text-foreground" : "text-muted-foreground",
                            )}
                            aria-hidden="true"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className={cn(
                              "size-2 rounded-full border transition-colors duration-150",
                              selected
                                ? "border-selected bg-selected"
                                : "border-stroke-strong bg-panel hover:bg-stroke-strong",
                            )}
                          />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Transition at this join</TooltipContent>
                  </Tooltip>
                );
              })}

              {/* Brand is spent once on this surface, and this is it: the playhead
                  has to be told apart from the two handles at a glance. */}
              {/* The playhead is picked up by its knob, above the pieces. Its
                  line takes no presses: a split leaves it standing on the
                  join, and a grab area there took every press meant for the
                  edges either side. A press anywhere on a piece scrubs
                  anyway. The loop positions this box, so React sets
                  nothing. */}
              <div
                ref={playheadRef}
                className="pointer-events-none absolute -top-2 bottom-0 left-1 z-30 w-0.5"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-2 bottom-1.5 rounded-full bg-brand"
                />
                <span
                  ref={knobRef}
                  role="slider"
                  tabIndex={0}
                  aria-label="Playhead"
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuenow={0}
                  onPointerDown={scrubFrom}
                  onKeyDown={nudgePlayhead}
                  className="pointer-events-auto absolute top-0 left-1/2 size-3 -translate-x-1/2 cursor-ew-resize touch-none rounded-full bg-brand shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
            </div>

            {/* Zoom regions, under the picture's lane and on its axis. A press on
                the bare lane puts the marker away. Suggested regions sit on the same
                lane as ghosts, dashed and dim, since a suggestion is a region that
                has not been agreed to yet. A press agrees. */}
            {(zooms.length > 0 || suggestions.length > 0) && (
              <div
                className="relative mt-1 h-7"
                onPointerDown={() => onZoomSelect(null)}
              >
                {suggestions.map((suggestion) => (
                  <Tooltip key={`${suggestion.start}:${suggestion.end}`}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Suggested zoom, ${formatPrecise(suggestion.start, duration)} to ${formatPrecise(suggestion.end, duration)}. Press to add it.`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => onSuggestionAccept(suggestion)}
                        className={cn(
                          "absolute inset-y-0 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-stroke-strong text-muted-foreground",
                          "transition-all duration-150 hover:border-foreground/60 hover:bg-elevated hover:text-foreground active:scale-[0.98]",
                          "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        )}
                        style={{
                          left: `calc(${at(lane(suggestion.start))} + ${INSET}px)`,
                          width: at(laneSpan(suggestion.start, suggestion.end)),
                        }}
                      >
                        <PlusIcon className="size-3.5" aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Suggested zoom. Press to add it.</TooltipContent>
                  </Tooltip>
                ))}
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
                        onKeyDown={laneKeys({
                          part: "body",
                          shift: (by) => shiftZoom(region, "body", by),
                          apply: onZoomChange,
                          at: (next) => next.start,
                          onRemove: onZoomRemove,
                          onToggle: () =>
                            onZoomSelect(selected ? null : region.id),
                        })}
                        className={cn(
                          "absolute inset-y-0 flex cursor-grab items-center justify-center overflow-hidden rounded-md bg-elevated text-[11px] tabular-nums ring-1 transition-colors duration-150 active:cursor-grabbing",
                          "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          selected
                            ? "text-foreground ring-brand"
                            : "text-muted-foreground ring-stroke hover:text-foreground",
                        )}
                        style={{
                          left: `calc(${at(lane(region.start))} + ${INSET}px)`,
                          width: at(laneSpan(region.start, region.end)),
                        }}
                      >
                        {formatSpeed(region.scale)}
                      </div>
                      <LaneEdge
                        label="Zoom start"
                        value={region.start}
                        duration={duration}
                        reachable={selected}
                        position={at(lane(region.start))}
                        onPointerDown={dragZoom(region, "head")}
                        onKeyDown={laneKeys({
                          part: "head",
                          shift: (by) => shiftZoom(region, "head", by),
                          apply: onZoomChange,
                          at: (next) => next.start,
                        })}
                      />
                      <LaneEdge
                        label="Zoom end"
                        value={region.end}
                        duration={duration}
                        reachable={selected}
                        position={at(lane(region.end))}
                        onPointerDown={dragZoom(region, "tail")}
                        onKeyDown={laneKeys({
                          part: "tail",
                          shift: (by) => shiftZoom(region, "tail", by),
                          apply: onZoomChange,
                          at: (next) => next.end - FRAME,
                        })}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Fades, on a lane of their own. Only mounted when there are
                any, the same as the zoom lane: a bar that grows a row for a
                feature nobody is using is a bar that is too tall by default.
                Each block is drawn as the ramp it is, so which way it runs is
                read off the lane rather than off a label. */}
            {/* Taller than the zoom's lane, because the ramp is drawn in it
                and bent by hand. A 20px block has no room for a curve to be
                read, let alone grabbed. */}
            {fades.length > 0 && (
              <div
                ref={fadeLaneRef}
                className="relative mt-1 h-8"
                onPointerDown={() => onFadeSelect(null)}
              >
                {fades.map((fade) => {
                  const selected = fade.id === selectedFade;
                  return (
                    <div key={fade.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Fade ${fade.kind}, ${formatPrecise(fade.start, duration)} to ${formatPrecise(fade.end, duration)}`}
                        aria-pressed={selected}
                        onPointerDown={dragFade(fade, "body")}
                        onKeyDown={laneKeys({
                          part: "body",
                          shift: (by) => shiftFade(fade, "body", by),
                          apply: onFadeChange,
                          at: (next) => next.start,
                          onRemove: onFadeRemove,
                          onToggle: () => onFadeSelect(selected ? null : fade.id),
                        })}
                        className={cn(
                          "absolute inset-y-0 cursor-grab overflow-hidden rounded-md bg-track ring-1 transition-colors duration-150 active:cursor-grabbing",
                          "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          selected ? "ring-brand" : "ring-stroke",
                        )}
                        style={{
                          left: `calc(${at(lane(fade.start))} + ${INSET}px)`,
                          width: at(laneSpan(fade.start, fade.end)),
                        }}
                      >
                        {/* The ramp, drawn from the fade's own curve. It is
                            the direction and the shape at once, so neither
                            needs a label, and it is the thing the handle
                            below bends. `preserveAspectRatio` is off so the
                            unit square stretches to whatever width the block
                            has on the lane. */}
                        <svg
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                          className="absolute inset-0 size-full"
                        >
                          <path
                            d={rampPath(fade)}
                            fill="var(--track-active)"
                            fillOpacity={0.55}
                            stroke="none"
                          />
                          <path
                            d={rampLine(fade)}
                            fill="none"
                            stroke={
                              selected ? "var(--brand)" : "var(--stroke-strong)"
                            }
                            strokeWidth={2}
                            vectorEffect="non-scaling-stroke"
                          />
                        </svg>
                      </div>

                      {/* One handle, on the ramp, the way an editor puts it
                          there. A bezier has two control points, which is more
                          than a fade needs by hand: this moves the symmetric
                          family, and the dialog is still where both points
                          move independently. */}
                      <div
                        role="slider"
                        tabIndex={selected ? 0 : -1}
                        aria-label="Fade curve"
                        aria-valuemin={-100}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(bendOf(fade.curve) * 100)}
                        onPointerDown={bendFade(fade)}
                        onKeyDown={(event) => {
                          const step = event.shiftKey ? 0.1 : 0.02;
                          const by =
                            event.key === "ArrowUp"
                              ? step
                              : event.key === "ArrowDown"
                                ? -step
                                : 0;
                          if (!by) return;
                          event.preventDefault();
                          onFadeChange({
                            ...fade,
                            curve: bendCurve(bendOf(fade.curve) + by),
                          });
                        }}
                        className={cn(
                          "absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-full",
                          "border-2 border-brand bg-panel transition-opacity duration-150",
                          "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          selected ? "opacity-100" : "pointer-events-none opacity-0",
                        )}
                        style={{
                          left: `calc(${at(lane(fade.start))} + ${INSET}px + ${at(laneSpan(fade.start, fade.end))} / 2)`,
                          top: `${rampMid(fade) * 100}%`,
                        }}
                      />
                      <LaneEdge
                        label="Fade start"
                        value={fade.start}
                        duration={duration}
                        reachable={selected}
                        position={at(lane(fade.start))}
                        onPointerDown={dragFade(fade, "head")}
                        onKeyDown={laneKeys({
                          part: "head",
                          shift: (by) => shiftFade(fade, "head", by),
                          apply: onFadeChange,
                          at: (next) => next.start,
                        })}
                      />
                      <LaneEdge
                        label="Fade end"
                        value={fade.end}
                        duration={duration}
                        reachable={selected}
                        position={at(lane(fade.end))}
                        onPointerDown={dragFade(fade, "tail")}
                        onKeyDown={laneKeys({
                          part: "tail",
                          shift: (by) => shiftFade(fade, "tail", by),
                          apply: onFadeChange,
                          at: (next) => next.end - FRAME,
                        })}
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
                      role="slider"
                      tabIndex={0}
                      aria-label={`Soundtrack, ${soundtrack.name}`}
                      aria-valuemin={0}
                      aria-valuemax={duration}
                      aria-valuenow={Number(soundtrack.offset.toFixed(3))}
                      aria-valuetext={formatPrecise(soundtrack.offset, duration)}
                      onPointerDown={dragSound("body")}
                      // Alt with an arrow slips the sound through the region,
                      // which is what Alt with a drag and the wheel both do.
                      onKeyDown={(event) => {
                        if (event.key === "Home" || event.key === "End") {
                          event.preventDefault();
                          onSoundtrackChange(
                            shiftSound(
                              soundtrack,
                              "body",
                              event.key === "Home" ? -duration : duration,
                            ),
                          );
                          return;
                        }
                        laneKeys({
                          part: "body",
                          shift: (by) =>
                            shiftSound(
                              soundtrack,
                              event.altKey ? "slip" : "body",
                              by,
                            ),
                          apply: onSoundtrackChange,
                          at: (next) => next.offset,
                        })(event);
                      }}
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
                        left: `calc(${at(lane(soundtrack.offset))} + ${INSET}px)`,
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
                  value={soundtrack.offset}
                  duration={duration}
                  position={at(lane(soundtrack.offset))}
                  onPointerDown={dragSound("head")}
                  onKeyDown={laneKeys({
                    part: "head",
                    shift: (by) => shiftSound(soundtrack, "head", by),
                    apply: onSoundtrackChange,
                    at: (next) => next.offset,
                  })}
                />
                <LaneEdge
                  label="Soundtrack end"
                  value={
                    soundtrack.offset +
                    (soundtrack.end - soundtrack.start) * speed
                  }
                  duration={duration}
                  position={at(
                    lane(soundtrack.offset) +
                      ((soundtrack.end - soundtrack.start) * speed) / duration,
                  )}
                  onPointerDown={dragSound("tail")}
                  onKeyDown={laneKeys({
                    part: "tail",
                    shift: (by) => shiftSound(soundtrack, "tail", by),
                    apply: onSoundtrackChange,
                    at: (next) => next.offset + (next.end - next.start) * speed,
                  })}
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
            {/* The ruler scrubs too, the way a timeline's does, so there is
                always a surface for moving the playhead that nothing else
                claims. */}
            <div
              aria-hidden="true"
              onPointerDown={scrubFrom}
              className="relative mt-1.5 h-5 cursor-pointer touch-none"
            >
              {/* The output's seconds, from the first piece, so a label
                  reads what the file will say at that point. */}
              {ticks(duration, laneWidth, kept).map(({ at, major, label }) => {
                const x = origin + at;
                return (
                <div
                  key={at}
                  className="absolute top-0 flex flex-col items-start"
                  style={{ left: centre(x / duration) }}
                >
                  <span
                    className={cn(
                      "block w-px",
                      major ? "h-1 bg-stroke-strong" : "h-0.5 bg-stroke",
                      x > 0 && "-translate-x-1/2",
                    )}
                  />
                  {label && (
                    <span
                      className={cn(
                        "mt-0.5 block text-[11px] tabular-nums leading-none text-muted-foreground",
                        x > 0 && x < duration - 1e-6 && "-translate-x-1/2",
                        x >= duration - 1e-6 && "-translate-x-full",
                      )}
                    >
                      {label}
                    </span>
                  )}
                </div>
                );
              })}
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
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-2">
              <div className="flex min-w-0 items-center gap-2">
                {/* The four things this bar can add, in one recessed pill, the
                    same shape the transport and the speed take. They were four
                    labelled buttons and between them most of this row: at a
                    selected zoom that follows, the row also carried a level
                    pill and a pace pill and ran past the panel. Each is a
                    single verb with a plain glyph, so each is a tooltip rather
                    than a label.

                    They no longer swap out for the selected instance's own
                    controls either. That swap kept the row's width down, but it
                    also meant a second zoom could not be added while the first
                    was selected, and the same for a cut. */}
                <div
                  role="group"
                  aria-label="Add"
                  className="flex shrink-0 items-center gap-0.5 rounded-full bg-track p-0.5"
                >
                  <Transport
                    label={
                      soundtrack
                        ? "A soundtrack is already laid"
                        : "Add a soundtrack"
                    }
                    onClick={() => fileRef.current?.click()}
                    disabled={Boolean(soundtrack)}
                  >
                    <MusicIcon className="size-4" aria-hidden="true" />
                  </Transport>
                  <Transport label="Add a zoom" onClick={onZoomAdd}>
                    <ZoomInIcon className="size-4" aria-hidden="true" />
                  </Transport>
                  {/* The one cutting tool. Splitting makes pieces, and every
                      other edit is a piece's edges or its Delete. */}
                  <Transport label="Split at the playhead (S)" onClick={onSplit}>
                    <ScissorsIcon className="size-4" aria-hidden="true" />
                  </Transport>
                  <Transport label="Add a fade" onClick={onFadeAdd}>
                    <SunDimIcon className="size-4" aria-hidden="true" />
                  </Transport>
                  {/* Shows or hides the ghosts. The first press reads the
                      clip's motion, through the same dialog the follow toggle
                      opens. */}
                  <Transport
                    label={suggesting ? "Hide suggestions" : "Suggest zooms"}
                    onClick={onSuggestToggle}
                    pressed={suggesting}
                  >
                    <SparklesIcon className="size-4" aria-hidden="true" />
                  </Transport>
                </div>

                {soundtrack && (
                  <span className="min-w-0 truncate text-[13px] text-muted-foreground">
                    {soundtrack.name}
                  </span>
                )}

                {/* What is selected, and only what is selected. One lane
                    instance is selected at a time, so this is one group or the
                    other and never both. */}
                {selectedRegion && (
                  <>
                  <div
                    className="flex shrink-0 items-center gap-0.5 rounded-full bg-track p-0.5"
                  >
                    <ZoomInIcon
                      className="mx-1.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <ChipGroup label="Zoom level">
                      {ZOOM_LEVELS.map((level) => (
                        <Chip
                          key={level}
                          active={selectedRegion.scale === level}
                          onClick={() => onZoomChange({ ...selectedRegion, scale: level })}
                        >
                          {formatSpeed(level)}
                        </Chip>
                      ))}
                    </ChipGroup>
                    {/* Follow the action or hold the aim. A toggle's label names
                        what a press will do, and while the clip's motion is being
                        read it names the progress instead, with the glyph spinning.
                        That read is the only wait in the editor. */}
                    <Transport
                      label={
                        motionProgress !== null
                          ? `Reading the motion, ${Math.round(motionProgress * 100)}%`
                          : selectedRegion.follow
                            ? "Aim by hand instead"
                            : "Follow the action"
                      }
                      onClick={() => onZoomFollow(selectedRegion)}
                      pressed={Boolean(selectedRegion.follow)}
                    >
                      {motionProgress !== null ? (
                        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <MousePointer2Icon className="size-4" aria-hidden="true" />
                      )}
                    </Transport>
                    <Transport label="Remove the zoom" onClick={onZoomRemove}>
                      <XIcon className="size-4" aria-hidden="true" />
                    </Transport>
                  </div>
                  {/* How the window follows, shown only while it does. The right
                      pace depends on the recording: a slow walkthrough wants Calm,
                      a quick demo wants the window to keep up. */}
                  {selectedRegion.follow && (
                    <div
                      className="flex shrink-0 items-center rounded-full bg-track p-0.5"
                    >
                      <ChipGroup label="Follow pace">
                        {FOLLOW_PACES.map((pace) => (
                          <Chip
                            key={pace.value}
                            active={(selectedRegion.pace ?? DEFAULT_PACE) === pace.value}
                            onClick={() => onZoomChange({ ...selectedRegion, pace: pace.value })}
                          >
                            {pace.label}
                          </Chip>
                        ))}
                      </ChipGroup>
                    </div>
                  )}
                  </>
                )}

                {selectedRamp && (
                  <div
                    role="group"
                    aria-label="Fade"
                    className="flex shrink-0 items-center gap-0.5 rounded-full bg-track p-0.5"
                  >
                    <SunDimIcon
                      className="mx-1.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <ChipGroup label="Fade direction">
                      {(["in", "out"] as const).map((kind) => (
                        <Chip
                          key={kind}
                          active={selectedRamp.kind === kind}
                          onClick={() => onFadeChange({ ...selectedRamp, kind })}
                        >
                          {kind === "in" ? "In" : "Out"}
                        </Chip>
                      ))}
                    </ChipGroup>
                    {/* The curve as itself, not as four words. Naming the
                        presets in the row cost about 260px and put the fade's
                        group beside the actions pill as a second long bar,
                        which is the congestion the actions pill was collapsed
                        to fix. The shape is the label, and the editor behind
                        it holds the presets and the graph together. */}
                    <Transport
                      label={`Edit the curve (${curveName(selectedRamp.curve) ?? "custom"})`}
                      onClick={onFadeCurveEdit}
                    >
                      <CurveThumb curve={selectedRamp.curve} />
                    </Transport>
                    {/* What the fade takes with it. Off, the picture goes and
                        the background stays, which is what a fade over a
                        gradient usually wants. On, the whole frame goes. */}
                    <Transport
                      label={
                        selectedRamp.whole
                          ? "Fade the picture only"
                          : "Fade the background too"
                      }
                      pressed={Boolean(selectedRamp.whole)}
                      onClick={() =>
                        onFadeChange({
                          ...selectedRamp,
                          whole: !selectedRamp.whole,
                        })
                      }
                    >
                      <LayersIcon className="size-4" aria-hidden="true" />
                    </Transport>
                    <Transport label="Remove the fade" onClick={onFadeRemove}>
                      <XIcon className="size-4" aria-hidden="true" />
                    </Transport>
                  </div>
                )}

                {selectedPieceValue && (
                  <div
                    role="group"
                    aria-label="Piece"
                    className="flex shrink-0 items-center gap-0.5 rounded-full bg-track p-0.5"
                  >
                    <SquareSplitHorizontalIcon
                      className="mx-1.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="px-1 text-[11px] tabular-nums text-muted-foreground">
                      {formatPrecise(
                        selectedPieceValue.end - selectedPieceValue.start,
                        duration,
                      )}
                    </span>
                    <Transport label="Delete this piece (Delete)" onClick={onPieceRemove}>
                      <Trash2Icon className="size-4" aria-hidden="true" />
                    </Transport>
                  </div>
                )}

                {selectedJoinValue && (
                  <div
                    role="group"
                    aria-label="Join"
                    className="flex shrink-0 items-center gap-0.5 rounded-full bg-track p-0.5"
                  >
                    <BlendIcon
                      className="mx-1.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <TransitionPicker
                      value={selectedJoinValue.transition}
                      onChange={(transition) =>
                        onJoinTransition(selectedJoinValue.at, transition)
                      }
                    />
                    <Transport
                      label={
                        selectedJoinIsCut
                          ? "Bring back the footage between (Delete)"
                          : "Join the pieces back (Delete)"
                      }
                      onClick={() => onJoinRemove(selectedJoinValue.at)}
                    >
                      <XIcon className="size-4" aria-hidden="true" />
                    </Transport>
                  </div>
                )}
              </div>

              {/* Wraps too, so at 320px the mutes drop under the speed pill rather
            than pushing the row past the panel. */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {/* The same recessed pill as the transport, with text chips rather
                    than glyphs: "2x" is its own label and needs no tooltip. The gauge
                    is what says the numbers are a rate rather than a zoom. */}
                <div className="flex items-center gap-0.5 rounded-full bg-track p-0.5">
                  <GaugeIcon
                    className="mx-1.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <ChipGroup label="Playback speed">
                    {SPEED_OPTIONS.map((rate) => (
                      <Chip
                        key={rate}
                        active={speed === rate}
                        onClick={() => onSpeedChange(rate)}
                      >
                        {formatSpeed(rate)}
                      </Chip>
                    ))}
                  </ChipGroup>
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
/**
 * An edge of a lane instance.
 *
 * A slider rather than a button, like the trim's own handles: it carries a
 * value in seconds and answers the arrow keys, so a reader who cannot drag can
 * still place it. `reachable` puts it in the tab order only while its instance
 * is selected, since every edge of every instance would be a long walk past
 * the controls beyond them.
 */
function LaneEdge({
  label,
  value,
  duration,
  position,
  reachable = true,
  onPointerDown,
  onKeyDown,
}: {
  label: string;
  value: number;
  duration: number;
  position: string;
  reachable?: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
}) {
  return (
    <div
      role="slider"
      tabIndex={reachable ? 0 : -1}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={Number(value.toFixed(3))}
      aria-valuetext={formatPrecise(value, duration)}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      style={{ left: position, width: HANDLE }}
      className={cn(
        "absolute inset-y-0 cursor-ew-resize touch-none rounded-md bg-stroke-strong",
        "transition-colors duration-150 hover:bg-foreground/70",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
      )}
    />
  );
}

/**
 * The curve, small enough to be a glyph.
 *
 * Drawn from the same four numbers the fade carries, so the button says which
 * curve is on without a word of text and without a second source for it.
 */
function CurveThumb({ curve }: { curve: Curve }) {
  const [x1, y1, x2, y2] = curve;
  const S = 12;
  const P = 2;
  const at = (x: number, y: number) => `${P + x * S},${P + (1 - y) * S}`;
  return (
    <svg
      width={S + P * 2}
      height={S + P * 2}
      viewBox={`0 0 ${S + P * 2} ${S + P * 2}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d={`M ${at(0, 0)} C ${at(x1, y1)} ${at(x2, y2)} ${at(1, 1)}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </svg>
  );
}

interface Tick {
  at: number;
  major: boolean;
  label?: string;
}

/**
 * The ruler's marks over `length` seconds of output, at the lane's own scale,
 * which is the whole source across `width`.
 */
function ticks(duration: number, width: number, length: number): Tick[] {
  if (!duration || !width) return [];

  const step = tickInterval(duration, width);
  const perPixel = duration / width;
  // The finest subdivision whose marks still read as separate ones. None of
  // them fitting is the answer for a lane that is already dense with labels.
  const parts =
    SUBDIVISIONS.find((n) => step / n / perPixel >= MIN_MINOR_GAP) ?? 1;

  const marks: Tick[] = [];
  const minor = step / parts;

  for (let index = 0; index * minor <= length + 1e-6; index++) {
    const at = Number((index * minor).toFixed(4));
    const major = index % parts === 0;
    marks.push({ at, major, label: major ? axisLabel(at, step, length) : undefined });
  }
  return marks;
}

/** A text option inside a recessed pill, the shape the speed and zoom levels share. */
/**
 * A run of chips that is one choice, not several toggles.
 *
 * `aria-pressed` on each said "four buttons, one of them down". A radiogroup
 * says "one of four", which is what a speed or a zoom level is, and it brings
 * the roving tab stop with it: the group is one stop and the arrows move
 * inside it, the way every other set of related choices in the panel behaves.
 */
/**
 * How the two sides of a join run into each other, for a cut's join and a
 * split's alike, so the two cannot offer different choices. A select rather
 * than chips, because five named kinds as chips would run the row past the
 * panel. The length chips appear once there is something to time.
 */
function TransitionPicker({
  value,
  onChange,
}: {
  value?: Transition;
  onChange: (transition: Transition | undefined) => void;
}) {
  return (
    <>
      <Select
        value={value?.kind ?? NO_TRANSITION}
        onValueChange={(kind) =>
          onChange(
            kind === NO_TRANSITION
              ? undefined
              : {
                  kind: kind as TransitionKind,
                  duration: value?.duration ?? DEFAULT_TRANSITION_DURATION,
                },
          )
        }
      >
        <SelectTrigger
          size="sm"
          aria-label="Transition at this join"
          className="w-auto gap-1.5 border-transparent bg-transparent shadow-none"
        >
          <BlendIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        {/* Each choice shows what it looks like on hover or keyboard focus,
            beside the menu, so a transition can be judged before it is picked
            rather than after an export. */}
        <SelectContent>
          {[{ value: NO_TRANSITION, label: "Straight cut" }, ...transitionKinds].map(
            (kind) => (
              <Tooltip key={kind.value} delayDuration={0}>
                <TooltipTrigger asChild>
                  <SelectItem value={kind.value}>{kind.label}</SelectItem>
                </TooltipTrigger>
                {/* The menu's own surface rather than the tooltip's light
                    fill, so the preview reads as part of the menu it
                    describes. */}
                <TooltipContent
                  side="right"
                  sideOffset={10}
                  className="border border-stroke bg-popover px-2 py-1.5 text-popover-foreground shadow-md"
                >
                  <TransitionPreview
                    kind={
                      kind.value === NO_TRANSITION
                        ? "none"
                        : (kind.value as TransitionKind)
                    }
                  />
                </TooltipContent>
              </Tooltip>
            ),
          )}
        </SelectContent>
      </Select>
      {value && (
        <ChipGroup label="Transition length">
          {TRANSITION_DURATIONS.map((length) => (
            <Chip
              key={length}
              active={value.duration === length}
              onClick={() => onChange({ ...value, duration: length })}
            >
              {`${length}s`}
            </Chip>
          ))}
        </ChipGroup>
      )}
    </>
  );
}

function ChipGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const move = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;

    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ];
    const from = items.indexOf(document.activeElement as HTMLButtonElement);
    if (from < 0) return;

    event.preventDefault();
    const to =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? Math.min(from + 1, items.length - 1)
            : Math.max(from - 1, 0);
    // A radio moves and chooses in one press, which is the convention and is
    // what a reader stepping through speeds expects to hear.
    items[to]?.focus();
    items[to]?.click();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-0.5"
      onKeyDown={move}
    >
      {children}
    </div>
  );
}

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
      role="radio"
      aria-checked={active}
      tabIndex={active ? 0 : -1}
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

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));
