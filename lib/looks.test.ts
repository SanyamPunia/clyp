import { describe, expect, it } from "vitest";

import { type Look, applyLook, isLook, lookFrom, nextLookName } from "@/lib/looks";
import type { StyleOptions } from "@/types/screenshot";

const style = {
  gradientId: "a",
  padding: 64,
  caption: "Launch day",
  windowUrl: "clyp.app",
  badge: "@clyp",
  imageCorners: { tl: true, tr: true, br: true, bl: true },
} as unknown as StyleOptions;

describe("lookFrom", () => {
  it("leaves out what belongs to one picture", () => {
    const look = lookFrom(style);
    expect(look).not.toHaveProperty("caption");
    expect(look).not.toHaveProperty("windowUrl");
    expect(look.badge).toBe("@clyp");
  });
});

describe("applyLook", () => {
  const look: Look = {
    id: "l",
    name: "Warm",
    style: { gradientId: "b", padding: 32, caption: "stale", badge: "@other" },
  };

  it("lays the look over the style and keeps the picture's own text", () => {
    const next = applyLook(style, look);
    expect(next.gradientId).toBe("b");
    expect(next.padding).toBe(32);
    expect(next.badge).toBe("@other");
    expect(next.caption).toBe("Launch day");
    expect(next.windowUrl).toBe("clyp.app");
  });

  it("leaves a control the look predates where it is", () => {
    const old: Look = { id: "o", name: "Old", style: { padding: 8 } };
    expect(applyLook(style, old).gradientId).toBe("a");
  });

  it("merges corners rather than replacing them", () => {
    const partial: Look = {
      id: "c",
      name: "Corners",
      style: { imageCorners: { tl: false } as StyleOptions["imageCorners"] },
    };
    expect(applyLook(style, partial).imageCorners).toEqual({
      tl: false,
      tr: true,
      br: true,
      bl: true,
    });
  });
});

describe("isLook", () => {
  it("is true once applied", () => {
    const look: Look = { id: "l", name: "Warm", style: { padding: 32 } };
    expect(isLook(style, look)).toBe(false);
    expect(isLook(applyLook(style, look), look)).toBe(true);
  });
});

describe("nextLookName", () => {
  it("counts up past names already taken", () => {
    expect(nextLookName([])).toBe("Look 1");
    expect(
      nextLookName([
        { id: "a", name: "Look 2", style: {} },
        { id: "b", name: "Mine", style: {} },
      ]),
    ).toBe("Look 3");
  });
});
