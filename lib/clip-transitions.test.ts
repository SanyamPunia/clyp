import { describe, expect, it } from "vitest";

import {
  NO_TRANSITION,
  hasDissolve,
  joinsOf,
  tidyTransition,
  transitionAt,
} from "@/lib/clip-transitions";

const trim = { start: 0, end: 6 };
const cut = (kind: "dissolve" | "black" | "white" | "blur" | "zoom", duration = 0.5) => ({
  id: "c",
  start: 2,
  end: 3,
  transition: { kind, duration },
});

describe("joinsOf", () => {
  it("places a join where the cut closes up, on the output's clock", () => {
    expect(joinsOf(trim, [cut("black")])).toEqual([
      { at: 2, kind: "black", duration: 0.5 },
    ]);
  });

  it("divides by the speed", () => {
    expect(joinsOf(trim, [cut("black")], 2)[0].at).toBe(1);
  });

  it("skips a straight cut", () => {
    expect(joinsOf(trim, [{ id: "c", start: 2, end: 3 }])).toEqual([]);
  });

  it("skips a cut against the in point, which closes up nothing", () => {
    expect(joinsOf(trim, [{ ...cut("black"), start: 0, end: 1 }])).toEqual([]);
  });

  it("fits a transition to the parts either side", () => {
    // 0.2s either side of the join, so a centred one takes at most 0.4s.
    const short = { start: 1.8, end: 3.2 };
    const joins = joinsOf(short, [{ ...cut("blur", 1) }]);
    expect(joins[0].duration).toBeCloseTo(0.4, 10);
  });

  it("places a split's transition where the two pieces touch", () => {
    const joins = joinsOf(trim, [], 1, [{ at: 4, transition: { kind: "zoom", duration: 0.3 } }]);
    expect(joins).toEqual([{ at: 4, kind: "zoom", duration: 0.3 }]);
  });

  it("puts a split after a cut on the output's clock", () => {
    const joins = joinsOf(trim, [{ id: "c", start: 1, end: 2 }], 1, [
      { at: 4, transition: { kind: "black", duration: 0.5 } },
    ]);
    expect(joins[0].at).toBe(3);
  });

  it("fits a dissolve to the part after it alone", () => {
    const short = { start: 0, end: 3.3 };
    expect(joinsOf(short, [cut("dissolve", 1)])[0].duration).toBeCloseTo(0.3, 10);
  });
});

describe("transitionAt", () => {
  it("is nothing away from any join", () => {
    expect(transitionAt(joinsOf(trim, [cut("black")]), 1)).toEqual(NO_TRANSITION);
  });

  it("dips to its colour at the join and back out either side", () => {
    const joins = joinsOf(trim, [cut("white")]);
    expect(transitionAt(joins, 2).veil).toEqual({ color: "#ffffff", alpha: 1 });
    expect(transitionAt(joins, 1.9).veil!.alpha).toBeGreaterThan(0);
    expect(transitionAt(joins, 2.1).veil!.alpha).toBeLessThan(1);
    expect(transitionAt(joins, 2.25)).toEqual(NO_TRANSITION);
  });

  it("dissolves only after the join, from the held frame to none", () => {
    const joins = joinsOf(trim, [cut("dissolve")]);
    expect(transitionAt(joins, 1.99).dissolve).toBe(0);
    expect(transitionAt(joins, 2).dissolve).toBe(1);
    expect(transitionAt(joins, 2.25).dissolve).toBeCloseTo(0.5, 10);
    expect(transitionAt(joins, 2.5).dissolve).toBe(0);
  });

  it("blurs and zooms to a peak at the join", () => {
    expect(transitionAt(joinsOf(trim, [cut("blur")]), 2).blur).toBe(1);
    expect(transitionAt(joinsOf(trim, [cut("zoom")]), 2).scale).toBeCloseTo(1.12, 10);
  });
});

describe("hasDissolve", () => {
  it("answers for the join list", () => {
    expect(hasDissolve(joinsOf(trim, [cut("dissolve")]))).toBe(true);
    expect(hasDissolve(joinsOf(trim, [cut("black")]))).toBe(false);
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
