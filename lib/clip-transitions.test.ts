import { describe, expect, it } from "vitest";

import {
  NO_TRANSITION,
  hasDissolve,
  joinsOf,
  tidyTransition,
  transitionAt,
} from "@/lib/clip-transitions";

type Kind = "dissolve" | "black" | "white" | "blur" | "zoom";

/** Red and green, then a second removed, then yellow to the end of six. */
const cutBlue = (kind?: Kind, duration = 0.5) => [
  { id: "a", start: 0, end: 2 },
  { id: "b", start: 3, end: 6, ...(kind && { transition: { kind, duration } }) },
];

describe("joinsOf", () => {
  it("places a join where two pieces meet, on the output's clock", () => {
    expect(joinsOf(cutBlue("black"))).toEqual([
      { at: 2, kind: "black", duration: 0.5 },
    ]);
  });

  it("divides by the speed", () => {
    expect(joinsOf(cutBlue("black"), 2)[0].at).toBe(1);
  });

  it("skips a straight join", () => {
    expect(joinsOf(cutBlue())).toEqual([]);
  });

  it("never reads the first piece's way in", () => {
    expect(
      joinsOf([{ id: "a", start: 0, end: 2, transition: { kind: "black", duration: 0.5 } }]),
    ).toEqual([]);
  });

  it("fits a transition to the parts either side", () => {
    // 0.2s either side of the join, so a centred one takes at most 0.4s.
    const joins = joinsOf([
      { id: "a", start: 1.8, end: 2 },
      { id: "b", start: 3, end: 3.2, transition: { kind: "blur", duration: 1 } },
    ]);
    expect(joins[0].duration).toBeCloseTo(0.4, 10);
  });

  it("follows the piece it runs into when the order changes", () => {
    const joins = joinsOf([
      { id: "b", start: 3, end: 6, transition: { kind: "black", duration: 0.5 } },
      { id: "c", start: 1, end: 2, transition: { kind: "zoom", duration: 0.3 } },
      { id: "a", start: 0, end: 1 },
    ]);
    expect(joins).toEqual([{ at: 3, kind: "zoom", duration: 0.3 }]);
  });

  it("fits a dissolve to the part after it alone", () => {
    const joins = joinsOf([
      { id: "a", start: 0, end: 2 },
      { id: "b", start: 3, end: 3.3, transition: { kind: "dissolve", duration: 1 } },
    ]);
    expect(joins[0].duration).toBeCloseTo(0.3, 10);
  });
});

describe("transitionAt", () => {
  it("is nothing away from any join", () => {
    expect(transitionAt(joinsOf(cutBlue("black")), 1)).toEqual(NO_TRANSITION);
  });

  it("dips to its colour at the join and back out either side", () => {
    const joins = joinsOf(cutBlue("white"));
    expect(transitionAt(joins, 2).veil).toEqual({ color: "#ffffff", alpha: 1 });
    expect(transitionAt(joins, 1.9).veil!.alpha).toBeGreaterThan(0);
    expect(transitionAt(joins, 2.1).veil!.alpha).toBeLessThan(1);
    expect(transitionAt(joins, 2.25)).toEqual(NO_TRANSITION);
  });

  it("dissolves only after the join, from the held frame to none", () => {
    const joins = joinsOf(cutBlue("dissolve"));
    expect(transitionAt(joins, 1.99).dissolve).toBe(0);
    expect(transitionAt(joins, 2).dissolve).toBe(1);
    expect(transitionAt(joins, 2.25).dissolve).toBeCloseTo(0.5, 10);
    expect(transitionAt(joins, 2.5).dissolve).toBe(0);
  });

  it("blurs and zooms to a peak at the join", () => {
    expect(transitionAt(joinsOf(cutBlue("blur")), 2).blur).toBe(1);
    expect(transitionAt(joinsOf(cutBlue("zoom")), 2).scale).toBeCloseTo(1.12, 10);
  });
});

describe("hasDissolve", () => {
  it("answers for the join list", () => {
    expect(hasDissolve(joinsOf(cutBlue("dissolve")))).toBe(true);
    expect(hasDissolve(joinsOf(cutBlue("black")))).toBe(false);
  });
});

describe("tidyTransition", () => {
  it("keeps one this build offers", () => {
    expect(tidyTransition({ kind: "blur", duration: 1 })).toEqual({ kind: "blur", duration: 1 });
  });

  it("drops an unknown kind and fixes an unknown length", () => {
    expect(tidyTransition({ kind: "wipe", duration: 1 })).toBeUndefined();
    expect(tidyTransition({ kind: "black", duration: 7 })).toEqual({
      kind: "black",
      duration: 0.5,
    });
    expect(tidyTransition(undefined)).toBeUndefined();
  });
});
