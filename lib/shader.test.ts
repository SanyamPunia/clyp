import { describe, expect, it } from "vitest";

import { gradientPresets, shaderFieldOf } from "@/lib/gradients";
import {
  BACKGROUND_SPEEDS,
  LOOP_SECONDS,
  MAX_SHADER_COLORS,
  flowPoint,
  flowTurns,
  hexChannels,
  loopSeconds,
  phaseAt,
} from "@/lib/shader";

const moving = gradientPresets.flatMap((preset) => {
  const field = shaderFieldOf(preset);
  return field ? [{ id: preset.id, field }] : [];
});

describe("phaseAt", () => {
  it("holds the chosen moment when the speed is 0", () => {
    expect(phaseAt(0, 0, 0.3)).toBeCloseTo(0.3);
    expect(phaseAt(47, 0, 0.3)).toBeCloseTo(0.3);
  });

  it("starts from the moment and runs one loop in LOOP_SECONDS at 1x", () => {
    expect(phaseAt(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(phaseAt(LOOP_SECONDS / 2, 1, 0.25)).toBeCloseTo(0.75);
    expect(phaseAt(LOOP_SECONDS, 1, 0.25)).toBeCloseTo(0.25);
  });

  it("wraps into 0 to 1 at any speed", () => {
    for (const { value } of BACKGROUND_SPEEDS) {
      for (const seconds of [0, 3.3, 11.9, 120]) {
        const phase = phaseAt(seconds, value, 0.9);
        expect(phase).toBeGreaterThanOrEqual(0);
        expect(phase).toBeLessThan(1);
      }
    }
  });
});

describe("loopSeconds", () => {
  it("is one loop at the speed, and nothing while held", () => {
    expect(loopSeconds(1)).toBe(LOOP_SECONDS);
    expect(loopSeconds(2)).toBe(LOOP_SECONDS / 2);
    expect(loopSeconds(0.5)).toBe(LOOP_SECONDS * 2);
    expect(loopSeconds(0)).toBe(0);
  });
});

describe("a flow's points", () => {
  it("turn a whole number of times a loop, so an exported loop has no seam", () => {
    for (let index = 0; index < MAX_SHADER_COLORS; index++) {
      for (const pace of [1, 2]) {
        const { kx, ky } = flowTurns(index, pace);
        expect(Number.isInteger(kx)).toBe(true);
        expect(Number.isInteger(ky)).toBe(true);
      }
    }
  });

  it("are back where they started at the end of the loop", () => {
    for (let index = 0; index < MAX_SHADER_COLORS; index++) {
      const start = flowPoint(index, 0, 2, 1.3);
      const end = flowPoint(index, 1, 2, 1.3);
      expect(end.x).toBeCloseTo(start.x, 9);
      expect(end.y).toBeCloseTo(start.y, 9);
    }
  });

  it("do not all move in step", () => {
    const turns = new Set(
      Array.from({ length: 4 }, (_, i) => JSON.stringify(flowTurns(i, 1))),
    );
    expect(turns.size).toBeGreaterThan(1);
  });
});

describe("the moving presets", () => {
  it("exist, in both kinds", () => {
    expect(moving.some((m) => m.field.kind === "flow")).toBe(true);
    expect(moving.some((m) => m.field.kind === "warp")).toBe(true);
  });

  it("fit their palettes in the shader's uniform array", () => {
    for (const { id, field } of moving) {
      expect(field.colors.length, id).toBeGreaterThanOrEqual(2);
      expect(field.colors.length, id).toBeLessThanOrEqual(MAX_SHADER_COLORS);
    }
  });

  it("move a whole number of turns a loop", () => {
    for (const { id, field } of moving) {
      expect(Number.isInteger(field.pace), id).toBe(true);
      expect(field.pace, id).toBeGreaterThanOrEqual(1);
    }
  });

  it("keep a warp's swirls inside the shader's loop", () => {
    for (const { id, field } of moving) {
      if (field.kind !== "warp") continue;
      expect(field.iterations, id).toBeGreaterThanOrEqual(1);
      expect(field.iterations, id).toBeLessThanOrEqual(20);
      expect(field.scale, id).toBeGreaterThan(0);
    }
  });
});

describe("hexChannels", () => {
  it("reads a six-digit hex as three 0 to 1 channels", () => {
    expect(hexChannels("#ff8000")).toEqual([1, 128 / 255, 0]);
  });
});
