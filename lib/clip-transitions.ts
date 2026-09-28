/**
 * Transitions: how the two sides of a join run into each other.
 *
 * A join is anywhere two pieces meet: where a cut closes up, or at a split
 * where nothing was removed. The transition lives on whichever made the join,
 * the cut or the split. It is placed on the output's clock, since that is where the join is: two
 * source seconds a cut apart are one output instant. Everything here is pure
 * and runs in two places from the same numbers, the way a zoom does: the
 * preview's frame loop styles the video, and the worker's encode loop draws
 * each frame with the same state.
 *
 * Four of the five are centred on the join and ramp up to it and back down,
 * so both sides take half. A dissolve cannot be centred without two sources at
 * once, so it starts at the join instead: the last frame before the join is
 * held and fades out over the first stretch after it, while the next part
 * plays underneath.
 */

import { keptSegments, outputAt, type Cut } from "@/lib/clip-cuts";
import { type Split, joinsBetween, pieces } from "@/lib/clip-pieces";
import type { Trim } from "@/types/screenshot";

export type TransitionKind = "dissolve" | "black" | "white" | "blur" | "zoom";

export interface Transition {
  kind: TransitionKind;
  /** Output seconds. */
  duration: number;
}

export const transitionKinds: { value: TransitionKind; label: string }[] = [
  { value: "dissolve", label: "Dissolve" },
  { value: "black", label: "Dip to black" },
  { value: "white", label: "Dip to white" },
  { value: "blur", label: "Blur" },
  { value: "zoom", label: "Zoom" },
];

export const TRANSITION_DURATIONS = [0.3, 0.5, 1] as const;
export const DEFAULT_TRANSITION_DURATION = 0.5;

/** The blur at a blur transition's peak, as a fraction of the picture's width. */
export const TRANSITION_BLUR = 0.03;
/** How far a zoom transition pushes in at its peak. */
const ZOOM_PEAK = 0.12;

/** One join with a transition, on the output's clock after speed. */
export interface Join {
  at: number;
  kind: TransitionKind;
  /** Output seconds, already fitted to the parts either side. */
  duration: number;
}

/**
 * Every join that carries a transition, a cut's or a split's.
 *
 * A duration is fitted to the pieces it runs into, so a transition never
 * reaches past the piece on either side: a centred one takes at most the whole
 * of each neighbour's length from the join, and a dissolve at most the piece
 * after it, which is the only one it covers.
 */
export function joinsOf(
  trim: Trim,
  cuts: readonly Cut[],
  speed = 1,
  splits: readonly Split[] = [],
): Join[] {
  const list = pieces(trim, cuts, splits);
  const segments = keptSegments(trim, cuts);
  const joins: Join[] = [];

  for (const join of joinsBetween(trim, cuts, splits)) {
    const transition = join.transition;
    if (!transition) continue;
    const before = list[join.index - 1];
    const after = list[join.index];
    const a = (before.end - before.start) / speed;
    const b = (after.end - after.start) / speed;
    const duration =
      transition.kind === "dissolve"
        ? Math.min(transition.duration, b)
        : Math.min(transition.duration, 2 * a, 2 * b);
    joins.push({
      at: outputAt(segments, join.at) / speed,
      kind: transition.kind,
      duration,
    });
  }
  return joins;
}

/** What a transition is doing to the picture at one instant. */
export interface TransitionState {
  /** A flat colour over the picture, for a dip. */
  veil: { color: "#000000" | "#ffffff"; alpha: number } | null;
  /** 0 to 1 of `TRANSITION_BLUR`. */
  blur: number;
  /** A push in about the centre, 1 for none. */
  scale: number;
  /** The held frame's opacity over the picture, for a dissolve. */
  dissolve: number;
}

export const NO_TRANSITION: TransitionState = {
  veil: null,
  blur: 0,
  scale: 1,
  dissolve: 0,
};

/** Smoothstep, so a transition eases in and out rather than starting on a corner. */
const ease = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

export function transitionAt(joins: readonly Join[], time: number): TransitionState {
  for (const join of joins) {
    if (join.duration <= 0) continue;

    if (join.kind === "dissolve") {
      if (time < join.at || time >= join.at + join.duration) continue;
      return {
        ...NO_TRANSITION,
        dissolve: 1 - ease((time - join.at) / join.duration),
      };
    }

    const half = join.duration / 2;
    const distance = Math.abs(time - join.at);
    if (distance >= half) continue;
    const peak = ease(1 - distance / half);

    if (join.kind === "black" || join.kind === "white") {
      return {
        ...NO_TRANSITION,
        veil: { color: join.kind === "black" ? "#000000" : "#ffffff", alpha: peak },
      };
    }
    if (join.kind === "blur") return { ...NO_TRANSITION, blur: peak };
    return { ...NO_TRANSITION, scale: 1 + ZOOM_PEAK * peak };
  }
  return NO_TRANSITION;
}

/** Whether any join dissolves, which is what makes a loop hold its last frame. */
export function hasDissolve(joins: readonly Join[]): boolean {
  return joins.some((join) => join.kind === "dissolve");
}

/**
 * A stored transition, kept only when it is one this build offers. A record
 * written by an older build, or edited by hand, falls back to a straight cut.
 */
export function tidyTransition(value: unknown): Transition | undefined {
  const t = value as Partial<Transition> | undefined;
  if (!t || !transitionKinds.some((k) => k.value === t.kind)) return undefined;
  const duration = TRANSITION_DURATIONS.includes(
    t.duration as (typeof TRANSITION_DURATIONS)[number],
  )
    ? (t.duration as number)
    : DEFAULT_TRANSITION_DURATION;
  return { kind: t.kind as TransitionKind, duration };
}
