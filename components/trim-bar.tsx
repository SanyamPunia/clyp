"use client";

import type React from "react";
import { useCallback, useEffect, useRef } from "react";

import { FieldLabel } from "@/components/ui/field-label";
import { formatDuration } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { Trim } from "@/types/screenshot";

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

const STEP = 0.1;
const COARSE_STEP = 1;

interface TrimBarProps {
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

export function TrimBar({
  video,
  duration,
  trim,
  onChange,
  onSeek,
  onPlayback,
  disabled = false,
}: TrimBarProps) {
  const laneRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  // The lane's usable span in px, kept in a ref because the playhead is
  // written every frame and must not render anything.
  const spanRef = useRef(0);
  // The live trim and the live seek, for the frame loop. It is bound once and
  // would otherwise close over the values this component mounted with. Written
  // in an effect rather than during render, which is not a ref's to do.
  const rangeRef = useRef(trim);
  const seekRef = useRef(onSeek);

  useEffect(() => {
    rangeRef.current = trim;
    seekRef.current = onSeek;
  }, [trim, onSeek]);

  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;

    const measure = () => {
      spanRef.current = Math.max(lane.clientWidth - HANDLE, 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
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

      if (!element.seeking && (time >= end || time < start - 0.05)) {
        seekRef.current(start);
        return;
      }

      const fraction = Math.min(Math.max(time / duration, 0), 1);
      playhead.style.transform = `translateX(${fraction * spanRef.current}px)`;
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [video, duration]);

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
                start: Math.min(time, rangeRef.current.end - MIN_TRIM),
                end: rangeRef.current.end,
              }
            : {
                start: rangeRef.current.start,
                end: Math.max(time, rangeRef.current.start + MIN_TRIM),
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

      const step = event.shiftKey ? COARSE_STEP : STEP;
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
          ? { start: clamp(value, 0, trim.end - MIN_TRIM), end: trim.end }
          : { start: trim.start, end: clamp(value, trim.start + MIN_TRIM, duration) };

      onChange(next);
      onSeek(next[edge]);
    },
    [disabled, duration, onChange, onSeek, trim],
  );

  // A press on the lane itself seeks, clamped into the trim, since a playhead
  // outside the range is a frame that will not be in the export.
  const scrub = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      onSeek(clamp(timeAt(event.clientX), trim.start, trim.end));
    },
    [disabled, onSeek, timeAt, trim.end, trim.start],
  );

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
      <div className="flex items-center justify-between gap-2 pb-2">
        <FieldLabel>Trim</FieldLabel>
        <span className="text-[13px] text-muted-foreground">
          <span className="tabular-nums text-foreground">
            {formatDuration(trim.end - trim.start)}
          </span>
          {trimmed && (
            <span className="tabular-nums"> of {formatDuration(duration)}</span>
          )}
        </span>
      </div>

      {/* The lane is a region the pointer scrubs rather than a control. Both
          handles in it are real sliders with their own keyboard behaviour,
          which is what a keyboard needs here. */}
      <div
        ref={laneRef}
        onPointerDown={scrub}
        className="relative h-9 cursor-pointer touch-none"
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
    </div>
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
      aria-valuenow={Number(value.toFixed(2))}
      aria-valuetext={formatDuration(value)}
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
