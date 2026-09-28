/**
 * Saved looks: a named style to put back on the next capture.
 *
 * A look is the whole style less what is about one picture. The caption and
 * the address in a browser bar are written for the picture they sit on, so
 * applying a look keeps the current ones rather than bringing back text that
 * was about something else. The handle is part of the look, since it is the
 * same on every post.
 */

import type { StyleOptions } from "@/types/screenshot";

export interface Look {
  id: string;
  name: string;
  style: Partial<StyleOptions>;
}

/** The fields that belong to one picture rather than to a look. */
const CONTENT = ["caption", "windowUrl"] as const satisfies readonly (keyof StyleOptions)[];

export function lookFrom(style: StyleOptions): Partial<StyleOptions> {
  const out: Partial<StyleOptions> = { ...style };
  for (const key of CONTENT) delete out[key];
  return out;
}

/**
 * The current style with a look laid over it. Merged, not replaced, so a look
 * saved before a control existed leaves that control where it is.
 */
export function applyLook(current: StyleOptions, look: Look): StyleOptions {
  const next = { ...current, ...lookFrom({ ...current, ...look.style }) };
  return {
    ...next,
    imageCorners: { ...current.imageCorners, ...look.style.imageCorners },
  };
}

/** Whether the style already is this look, so applying it would change nothing. */
export function isLook(current: StyleOptions, look: Look): boolean {
  return JSON.stringify(applyLook(current, look)) === JSON.stringify(current);
}

export function newLookId(): string {
  return `look-${Math.random().toString(36).slice(2, 10)}`;
}

/** A name nobody has used yet, for the save field's placeholder. */
export function nextLookName(looks: readonly Look[]): string {
  const taken = new Set(looks.map((l) => l.name));
  for (let n = looks.length + 1; ; n++) {
    const name = `Look ${n}`;
    if (!taken.has(name)) return name;
  }
}
