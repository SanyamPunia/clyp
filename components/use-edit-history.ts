"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Undo and redo for the clip's edits.
 *
 * The editor grew four kinds of edit (the trim, the cuts, the speed, the zoom
 * regions) plus a soundtrack's placement, and none of them had a way back. A
 * zoom's aim takes a minute to place and one stray drag replaced it.
 *
 * **The history watches the state rather than being pushed to.** Every edit
 * here already lives in `clyp.tsx` as ordinary state, and threading a
 * `pushUndo()` through every handler, every drag and every keyboard nudge is
 * both invasive and the kind of thing a later handler forgets to do. So this
 * takes the whole edit state as one value and notices when it changes.
 *
 * **A change is recorded only once it settles.** A drag rewrites the state on
 * every frame, and one entry per frame is a history nobody can walk back. The
 * timer restarts on each change, so a drag of any length collapses into the
 * one snapshot taken before it began. A pause mid-drag can split it in two,
 * which costs a reader one extra press and nothing else.
 *
 * Style options are deliberately not in here. They are sliders and chips that
 * are dragged back as easily as forward, they persist separately, and folding
 * them in would mean a press of undo sometimes moved the picture and sometimes
 * changed a colour.
 */

/** How long a change must hold still before it becomes an entry. */
const SETTLE_MS = 400;

/** How far back it goes. Each entry is a few hundred bytes. */
const LIMIT = 50;

export interface EditHistory {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Drops the history and adopts whatever the state is next. For a new clip,
   * and for a draft restored onto one: neither is an edit to walk back from.
   */
  reset: () => void;
}

export function useEditHistory<T>({
  state,
  restore,
  enabled,
}: {
  state: T;
  /** Puts a snapshot back. Must be stable. */
  restore: (state: T) => void;
  enabled: boolean;
}): EditHistory {
  const past = useRef<{ key: string; value: T }[]>([]);
  const future = useRef<{ key: string; value: T }[]>([]);
  const committed = useRef<{ key: string; value: T }>({
    key: JSON.stringify(state),
    value: state,
  });
  const latest = useRef(state);
  /** Set by an undo, a redo or a reset: the next change is not a new entry. */
  const absorb = useRef(false);
  // Only the depths are rendered, so the stacks stay in refs and pressing undo
  // costs one render rather than one per entry.
  const [depth, setDepth] = useState({ back: 0, forward: 0 });

  const sync = useCallback(() => {
    setDepth({ back: past.current.length, forward: future.current.length });
  }, []);

  useEffect(() => {
    latest.current = state;
    const key = JSON.stringify(state);

    if (!enabled || absorb.current) {
      absorb.current = false;
      committed.current = { key, value: state };
      return;
    }
    if (key === committed.current.key) return;

    const timer = window.setTimeout(() => {
      past.current = [...past.current, committed.current].slice(-LIMIT);
      future.current = [];
      committed.current = { key, value: state };
      sync();
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [state, enabled, sync]);

  const step = useCallback(
    (from: typeof past, to: typeof future) => {
      const entry = from.current[from.current.length - 1];
      if (!entry) return;

      from.current = from.current.slice(0, -1);
      // The live state rather than the last committed one, so an edit still
      // inside its settle window is not lost by pressing undo during it.
      to.current = [
        ...to.current,
        { key: JSON.stringify(latest.current), value: latest.current },
      ];
      absorb.current = true;
      committed.current = entry;
      restore(entry.value);
      sync();
    },
    [restore, sync],
  );

  return {
    undo: useCallback(() => step(past, future), [step]),
    redo: useCallback(() => step(future, past), [step]),
    canUndo: depth.back > 0,
    canRedo: depth.forward > 0,
    reset: useCallback(() => {
      past.current = [];
      future.current = [];
      absorb.current = true;
      sync();
    }, [sync]),
  };
}
