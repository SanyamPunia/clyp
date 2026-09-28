/**
 * Marks: what is drawn on the picture itself. A blur or a block to redact
 * something, and a box, an arrow or a line of text to point at something.
 *
 * Every mark is placed in fractions of the picture, like a zoom's focus, so it
 * means the same thing at any canvas zoom, at any export scale and under a
 * clip's own zoom. Sizes that are not positions (a stroke, a blur, a font) are
 * fractions of the picture's width, so a mark on a 2560px capture is as heavy
 * as the same mark on a 1280px one.
 *
 * Everything here is pure. The preview lays marks out as elements over the
 * picture, and the video encode draws them through `project`, which is the
 * same arithmetic the zoom's `sourceRect` does, so the two cannot disagree.
 */

export type MarkKind = "blur" | "block" | "box" | "arrow" | "text";

/**
 * The colours a mark can take. Fixed colours inside the artwork, the same
 * exception the title bar's lights are: the exported PNG has no theme.
 */
export const MARK_COLORS = {
  red: "#FF3B30",
  yellow: "#FFCC00",
  green: "#34C759",
  blue: "#0A84FF",
  white: "#FFFFFF",
  black: "#000000",
} as const;

export type MarkColor = keyof typeof MARK_COLORS;

export const markColors = Object.keys(MARK_COLORS) as MarkColor[];

export interface Mark {
  id: string;
  kind: MarkKind;
  /**
   * The top left corner, or an arrow's tail, or a text's top left, as
   * fractions of the picture.
   */
  x: number;
  y: number;
  /**
   * The size of a rectangle, or an arrow's head less its tail, which can be
   * negative. Zero for text, which is sized by its content.
   */
  w: number;
  h: number;
  color: MarkColor;
  /** Text only. */
  text?: string;
  /** Text only. The font size as a fraction of the picture's width. */
  size?: number;
}

export const markKinds: { value: MarkKind; label: string }[] = [
  { value: "blur", label: "Blur" },
  { value: "block", label: "Block" },
  { value: "box", label: "Box" },
  { value: "arrow", label: "Arrow" },
  { value: "text", label: "Text" },
];

export const TEXT_SIZES = [
  { value: 0.025, label: "Small" },
  { value: 0.04, label: "Medium" },
  { value: 0.06, label: "Large" },
];
export const DEFAULT_TEXT_SIZE = 0.04;

/**
 * The smallest a drawn rectangle or arrow may be, as a fraction of the
 * picture. A press that barely moves is a click, and a mark the size of a
 * pixel is one nobody can see or grab again.
 */
export const MIN_MARK = 0.01;

const clamp = (value: number, low = 0, high = 1) =>
  Math.min(Math.max(value, low), high);

/**
 * A stroke's width in picture pixels. A hairline would vanish in a post, and
 * a post is usually seen smaller than the capture it came from.
 */
export function strokeWidth(pictureWidth: number): number {
  return Math.max(3, Math.round(pictureWidth * 0.005));
}

/**
 * A blur's radius as a fraction of the picture's width.
 *
 * Strong on purpose. The point is that nobody can read what is under it, and
 * a light blur over large text can still be read.
 */
export const BLUR_RADIUS = 0.012;

/** A blur's radius in picture pixels, never below 8. */
export function blurRadius(pictureWidth: number): number {
  return Math.max(8, Math.round(pictureWidth * BLUR_RADIUS));
}

/** A rectangle with positive width and height, whichever corner it was drawn from. */
export function normalized(mark: Pick<Mark, "x" | "y" | "w" | "h">): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return {
    x: Math.min(mark.x, mark.x + mark.w),
    y: Math.min(mark.y, mark.y + mark.h),
    w: Math.abs(mark.w),
    h: Math.abs(mark.h),
  };
}

/** Whether a drawn mark is big enough to keep. Text always is. */
export function isKeepable(mark: Mark): boolean {
  if (mark.kind === "text") return true;
  if (mark.kind === "arrow") return Math.hypot(mark.w, mark.h) >= MIN_MARK;
  return Math.abs(mark.w) >= MIN_MARK && Math.abs(mark.h) >= MIN_MARK;
}

/**
 * Moves a mark by a distance in fractions, stopped at the picture's edges.
 * A rectangle keeps its size, so dragging one into a corner does not squash
 * it. An arrow keeps its length and angle.
 */
export function moveMark(mark: Mark, dx: number, dy: number): Mark {
  if (mark.kind === "text") {
    return { ...mark, x: clamp(mark.x + dx), y: clamp(mark.y + dy) };
  }
  const box = normalized(mark);
  const nx = clamp(box.x + dx, 0, 1 - box.w);
  const ny = clamp(box.y + dy, 0, 1 - box.h);
  return { ...mark, x: mark.x + (nx - box.x), y: mark.y + (ny - box.y) };
}

export type Handle = "nw" | "ne" | "sw" | "se" | "tail" | "head";

/**
 * Moves one handle of a mark to a point. A rectangle's corner moves and the
 * opposite one holds. An arrow's tail or head moves and the other end holds.
 * The result is normalized, so a corner dragged past its opposite flips the
 * rectangle rather than giving it a negative size.
 */
export function resizeMark(
  mark: Mark,
  handle: Handle,
  point: { x: number; y: number },
): Mark {
  const p = { x: clamp(point.x), y: clamp(point.y) };

  if (mark.kind === "arrow") {
    const head = { x: mark.x + mark.w, y: mark.y + mark.h };
    if (handle === "tail") {
      return { ...mark, x: p.x, y: p.y, w: head.x - p.x, h: head.y - p.y };
    }
    return { ...mark, w: p.x - mark.x, h: p.y - mark.y };
  }

  const box = normalized(mark);
  const left = handle === "nw" || handle === "sw";
  const top = handle === "nw" || handle === "ne";
  const fixed = {
    x: left ? box.x + box.w : box.x,
    y: top ? box.y + box.h : box.y,
  };
  return {
    ...mark,
    ...normalized({ x: fixed.x, y: fixed.y, w: p.x - fixed.x, h: p.y - fixed.y }),
  };
}

/**
 * The two points of an arrowhead's base, for a head at `to` coming from
 * `from`, in whatever units both are in. The head is a filled triangle three
 * strokes wide, which is what reads as an arrow at a glance.
 */
export function arrowHead(
  from: { x: number; y: number },
  to: { x: number; y: number },
  stroke: number,
): [{ x: number; y: number }, { x: number; y: number }] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = stroke * 4.5;
  const spread = Math.PI / 7;
  return [
    {
      x: to.x - length * Math.cos(angle - spread),
      y: to.y - length * Math.sin(angle - spread),
    },
    {
      x: to.x - length * Math.cos(angle + spread),
      y: to.y - length * Math.sin(angle + spread),
    },
  ];
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Maps a point of the picture, in fractions, to output pixels in `box`, under
 * a zoom or none.
 *
 * At a zoom of scale `s` about `focus`, the visible window starts at
 * `focus * (1 - 1 / s)` and is `1 / s` wide, which is exactly what
 * `sourceRect` crops. So a point lands at its distance into that window times
 * `s`, across the box. `unit` is how many output pixels one picture width is,
 * which is what a stroke, a blur and a ripple are scaled by.
 */
export function project(
  zoom: { scale: number; focus: { x: number; y: number } } | null,
  box: Box,
): {
  at: (p: { x: number; y: number }) => { x: number; y: number };
  unit: number;
  window: { x: number; y: number; size: number };
} {
  const s = zoom?.scale ?? 1;
  const window = {
    x: zoom ? zoom.focus.x * (1 - 1 / s) : 0,
    y: zoom ? zoom.focus.y * (1 - 1 / s) : 0,
    size: 1 / s,
  };
  return {
    at: (p) => ({
      x: box.x + (p.x - window.x) * s * box.width,
      y: box.y + (p.y - window.y) * s * box.height,
    }),
    unit: box.width * s,
    window,
  };
}

export function newMarkId(): string {
  return `mark-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Marks read back from storage, kept only where they make sense: a known
 * kind, finite numbers, inside the picture. A record written by an older build
 * or hand-edited cannot put a mark somewhere nothing can reach it.
 */
export function tidyMarks(marks: readonly unknown[]): Mark[] {
  const kinds = new Set(markKinds.map((k) => k.value));
  const finite = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n);

  return marks.flatMap((raw) => {
    const m = raw as Partial<Mark>;
    if (!m || typeof m.id !== "string" || !m.kind || !kinds.has(m.kind)) return [];
    if (![m.x, m.y, m.w, m.h].every(finite)) return [];
    const mark: Mark = {
      id: m.id,
      kind: m.kind,
      x: clamp(m.x as number),
      y: clamp(m.y as number),
      w: clamp(m.w as number, -1, 1),
      h: clamp(m.h as number, -1, 1),
      color: m.color && m.color in MARK_COLORS ? m.color : "red",
    };
    if (m.kind === "text") {
      mark.text = typeof m.text === "string" ? m.text : "";
      mark.size = TEXT_SIZES.some((s) => s.value === m.size)
        ? m.size
        : DEFAULT_TEXT_SIZE;
    }
    return isKeepable(mark) ? [mark] : [];
  });
}
