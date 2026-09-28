"use client";

import type React from "react";
import { useState } from "react";

import {
  type Handle,
  type Mark,
  type MarkColor,
  type MarkKind,
  DEFAULT_TEXT_SIZE,
  MARK_COLORS,
  arrowHead,
  blurRadius,
  isKeepable,
  markKinds,
  moveMark,
  newMarkId,
  normalized,
  resizeMark,
  strokeWidth,
} from "@/lib/marks";
import { EXPORT_IGNORE, MARK_BLUR, MARK_LAYER } from "@/lib/raster";
import { cn } from "@/lib/utils";

/** A nudge from the arrow keys, as a fraction of the picture. */
const STEP = 0.01;
const COARSE_STEP = 0.05;
/** Handles are this many screen pixels, whatever the canvas zoom. */
const HANDLE = 12;

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

interface MarksLayerProps {
  marks: Mark[];
  selected: string | null;
  /** The kind a press on the picture draws, or null to only select. */
  tool: MarkKind | null;
  color: MarkColor;
  /** The picture's own size in px, which strokes and text scale from. */
  picture: { width: number; height: number };
  /** The canvas zoom, which handles are counter-scaled by. */
  canvasZoom: number;
  /**
   * The picture's corner radius. An image's layer clips itself to it, since
   * the image carries its own radius. A clip's box already clips the layer.
   */
  radius?: string;
  ref?: React.Ref<HTMLDivElement>;
  children?: React.ReactNode;
  onAdd: (mark: Mark) => void;
  onChange: (mark: Mark) => void;
  onSelect: (id: string | null) => void;
  /** Reported so the owner can pause a clip while something is drawn or moved. */
  onGesture: (active: boolean) => void;
}

/**
 * The marks over the picture, and the drawing and editing of them.
 *
 * The layer is the picture's own box, so a fraction of it is a fraction of the
 * picture and nothing is measured to place a mark. It is laid out in the
 * picture's pixels like the rest of the frame, which is why strokes and text
 * are sized from the picture and handles are divided by the canvas zoom.
 *
 * Delete is not handled here. The page's own key handler removes whichever
 * mark is selected, focused or not, so the key works the moment one is drawn.
 *
 * What a mark looks like is inside the export. What it takes to edit one, the
 * selection outline and the handles, carries `EXPORT_IGNORE`. A blur carries
 * it too, and says where it is through `MARK_BLUR` instead, because its look
 * is a `backdrop-filter` the raster cannot serialize and the export applies to
 * the finished pixels.
 */
export function MarksLayer({
  marks,
  selected,
  tool,
  color,
  picture,
  canvasZoom,
  radius,
  ref,
  children,
  onAdd,
  onChange,
  onSelect,
  onGesture,
}: MarksLayerProps) {
  const [draft, setDraft] = useState<Mark | null>(null);
  const stroke = strokeWidth(picture.width);
  const handle = HANDLE / canvasZoom;
  const line = 1.5 / canvasZoom;

  /**
   * Follows the pointer from a press until release. The layer's rect is read
   * on every move rather than once, since a clip's zoom can still be easing
   * while the pointer moves.
   */
  const track = (
    event: React.PointerEvent,
    onMove: (point: { x: number; y: number }, from: { x: number; y: number }) => void,
    onEnd?: () => void,
  ) => {
    const layer = (event.currentTarget as Element).closest<HTMLElement>(
      `[${MARK_LAYER}]`,
    );
    if (!layer) return;
    event.preventDefault();
    event.stopPropagation();
    onGesture(true);

    const at = (e: { clientX: number; clientY: number }) => {
      const rect = layer.getBoundingClientRect();
      return {
        x: clamp((e.clientX - rect.left) / rect.width),
        y: clamp((e.clientY - rect.top) / rect.height),
      };
    };
    const from = at(event);

    const move = (moved: PointerEvent) => onMove(at(moved), from);
    const release = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      onGesture(false);
      onEnd?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  };

  const pressLayer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.button !== 0) return;

    if (!tool) {
      // A press on the bare picture lets go of the selection, which is the
      // only other way back to drawing without reaching for Escape.
      event.stopPropagation();
      onSelect(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const start = {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };

    // Text has no size to drag out, so a press places it.
    if (tool === "text") {
      event.preventDefault();
      event.stopPropagation();
      const mark: Mark = {
        id: newMarkId(),
        kind: "text",
        x: start.x,
        y: start.y,
        w: 0,
        h: 0,
        color,
        text: "Text",
        size: DEFAULT_TEXT_SIZE,
      };
      onAdd(mark);
      return;
    }

    let current: Mark = {
      id: newMarkId(),
      kind: tool,
      x: start.x,
      y: start.y,
      w: 0,
      h: 0,
      color,
    };
    setDraft(current);
    track(
      event,
      (point) => {
        current = { ...current, w: point.x - start.x, h: point.y - start.y };
        setDraft(current);
      },
      () => {
        setDraft(null);
        if (!isKeepable(current)) return;
        onAdd(
          current.kind === "arrow"
            ? current
            : { ...current, ...normalized(current) },
        );
      },
    );
  };

  const pressMark = (mark: Mark) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    onSelect(mark.id);
    track(event, (point, from) =>
      onChange(moveMark(mark, point.x - from.x, point.y - from.y)),
    );
  };

  const pressHandle = (mark: Mark, which: Handle) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    track(event, (point) => onChange(resizeMark(mark, which, point)));
  };

  const keys = (mark: Mark) => (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? COARSE_STEP : STEP;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];
    if (move) {
      event.preventDefault();
      onChange(moveMark(mark, move[0], move[1]));
    } else if (event.key === "Escape") {
      event.preventDefault();
      onSelect(null);
      (event.currentTarget as HTMLElement).blur();
    }
  };

  const label = (mark: Mark, index: number) => {
    const kind = markKinds.find((k) => k.value === mark.kind)?.label ?? "Mark";
    return mark.kind === "text"
      ? `Text: ${mark.text || "empty"}`
      : `${kind} ${index + 1}`;
  };

  const handleAt = (mark: Mark, which: Handle, x: number, y: number) => (
    <span
      key={which}
      {...{ [EXPORT_IGNORE]: "" }}
      onPointerDown={pressHandle(mark, which)}
      className={cn(
        "absolute z-10 touch-none rounded-[2px]",
        which === "nw" || which === "se"
          ? "cursor-nwse-resize"
          : which === "ne" || which === "sw"
            ? "cursor-nesw-resize"
            : "cursor-move rounded-full",
      )}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: handle,
        height: handle,
        transform: "translate(-50%, -50%)",
        background: "#fff",
        border: `${line}px solid rgba(0,0,0,0.55)`,
      }}
    />
  );

  const outline = (
    <span
      {...{ [EXPORT_IGNORE]: "" }}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        outline: `${line}px solid rgba(255,255,255,0.95)`,
        boxShadow: `0 0 0 ${line * 2}px rgba(0,0,0,0.35)`,
      }}
    />
  );

  const renderRect = (mark: Mark, index: number, editable: boolean) => {
    const box = normalized(mark);
    const isSelected = editable && mark.id === selected;
    const hex = MARK_COLORS[mark.color];
    const look: React.CSSProperties =
      mark.kind === "blur"
        ? {
            backdropFilter: `blur(${blurRadius(picture.width)}px)`,
            WebkitBackdropFilter: `blur(${blurRadius(picture.width)}px)`,
          }
        : mark.kind === "block"
          ? { background: hex }
          : { border: `${stroke}px solid ${hex}`, borderRadius: stroke };

    return (
      <div
        key={mark.id}
        {...(mark.kind === "blur" && {
          [MARK_BLUR]: blurRadius(picture.width),
          [EXPORT_IGNORE]: "",
        })}
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        aria-label={editable ? label(mark, index) : undefined}
        aria-pressed={editable ? isSelected : undefined}
        onPointerDown={editable ? pressMark(mark) : undefined}
        onFocus={editable ? () => onSelect(mark.id) : undefined}
        onKeyDown={editable ? keys(mark) : undefined}
        className={cn(
          "absolute outline-none",
          editable && "pointer-events-auto cursor-move touch-none",
        )}
        style={{
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.w * 100}%`,
          height: `${box.h * 100}%`,
          ...look,
        }}
      >
        {isSelected && (
          <>
            {outline}
            {handleAt(mark, "nw", 0, 0)}
            {handleAt(mark, "ne", 1, 0)}
            {handleAt(mark, "sw", 0, 1)}
            {handleAt(mark, "se", 1, 1)}
          </>
        )}
      </div>
    );
  };

  const renderArrow = (mark: Mark, index: number, editable: boolean) => {
    const isSelected = editable && mark.id === selected;
    const from = { x: mark.x * picture.width, y: mark.y * picture.height };
    const to = {
      x: (mark.x + mark.w) * picture.width,
      y: (mark.y + mark.h) * picture.height,
    };
    const [a, b] = arrowHead(from, to, stroke);
    // The shaft stops short of the point, so its square end never pokes out
    // past the head's tip.
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const shaftEnd = {
      x: to.x - Math.cos(angle) * stroke * 2,
      y: to.y - Math.sin(angle) * stroke * 2,
    };
    const hex = MARK_COLORS[mark.color];

    return (
      <div key={mark.id} className="pointer-events-none absolute inset-0">
        <svg
          viewBox={`0 0 ${picture.width} ${picture.height}`}
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden={editable ? undefined : true}
        >
          <line
            x1={from.x}
            y1={from.y}
            x2={shaftEnd.x}
            y2={shaftEnd.y}
            stroke={hex}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <polygon
            points={`${to.x},${to.y} ${a.x},${a.y} ${b.x},${b.y}`}
            fill={hex}
            stroke={hex}
            strokeWidth={stroke * 0.5}
            strokeLinejoin="round"
          />
          {/* A wide invisible line to press, since the drawn one can be a few
              pixels across on screen. */}
          {editable && (
            <line
              {...{ [EXPORT_IGNORE]: "" }}
              role="button"
              tabIndex={0}
              aria-label={label(mark, index)}
              aria-pressed={isSelected}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="transparent"
              strokeWidth={Math.max(stroke * 4, 16 / canvasZoom)}
              className="pointer-events-auto cursor-move touch-none outline-none"
              onPointerDown={pressMark(mark)}
              onFocus={() => onSelect(mark.id)}
              onKeyDown={keys(mark)}
            />
          )}
        </svg>
        {isSelected && (
          <div className="pointer-events-auto">
            {handleAt(mark, "tail", mark.x, mark.y)}
            {handleAt(mark, "head", mark.x + mark.w, mark.y + mark.h)}
          </div>
        )}
      </div>
    );
  };

  const renderText = (mark: Mark, index: number, editable: boolean) => {
    const isSelected = editable && mark.id === selected;
    const hex = MARK_COLORS[mark.color];
    const light = mark.color === "white" || mark.color === "yellow";

    return (
      <div
        key={mark.id}
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        aria-label={editable ? label(mark, index) : undefined}
        aria-pressed={editable ? isSelected : undefined}
        onPointerDown={editable ? pressMark(mark) : undefined}
        onFocus={editable ? () => onSelect(mark.id) : undefined}
        onKeyDown={editable ? keys(mark) : undefined}
        className={cn(
          "absolute font-semibold whitespace-pre outline-none",
          editable && "pointer-events-auto cursor-move touch-none",
        )}
        style={{
          left: `${mark.x * 100}%`,
          top: `${mark.y * 100}%`,
          fontSize: (mark.size ?? DEFAULT_TEXT_SIZE) * picture.width,
          lineHeight: 1.15,
          color: hex,
          textShadow: light
            ? "0 1px 3px rgba(0,0,0,0.5)"
            : "0 1px 2px rgba(255,255,255,0.35)",
        }}
      >
        {mark.text || " "}
        {isSelected && outline}
      </div>
    );
  };

  const render = (mark: Mark, index: number, editable: boolean) =>
    mark.kind === "arrow"
      ? renderArrow(mark, index, editable)
      : mark.kind === "text"
        ? renderText(mark, index, editable)
        : renderRect(mark, index, editable);

  // The bare layer takes presses only when they mean something: drawing with
  // a tool, or letting go of a selection. Otherwise a press on a clip reaches
  // the video underneath and plays or pauses it.
  const takesPresses = tool !== null || selected !== null;

  return (
    <div
      ref={ref}
      {...{ [MARK_LAYER]: picture.width }}
      onPointerDown={pressLayer}
      className={cn(
        "absolute inset-0 overflow-hidden",
        takesPresses ? "pointer-events-auto" : "pointer-events-none",
        tool && "cursor-crosshair touch-none",
      )}
      style={{ borderRadius: radius }}
    >
      {children}
      {marks.map((mark, index) => render(mark, index, true))}
      {draft && render(draft, marks.length, false)}
    </div>
  );
}
