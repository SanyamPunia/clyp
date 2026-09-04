import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOLID_COLOR,
  angleApplies,
  backgroundKinds,
  defaultCustomGradient,
  defaultGradientId,
  getGradient,
  gradientFamilies,
  gradientPresets,
  gradientToCss,
  resolveGradientCss,
  solidToCss,
  supportsAngle,
} from "@/lib/gradients";

const selection = (over: Partial<Parameters<typeof resolveGradientCss>[0]> = {}) => ({
  background: "preset" as const,
  gradientId: defaultGradientId,
  gradientAngle: 180,
  customGradientFrom: defaultCustomGradient.from,
  customGradientTo: defaultCustomGradient.to,
  solidColor: DEFAULT_SOLID_COLOR,
  ...over,
});

describe("the registry", () => {
  it("gives every family a whole number of picker rows", () => {
    // The picker is eight columns wide, so a family that is not a multiple of
    // eight leaves a ragged last row.
    for (const family of gradientFamilies) {
      const count = gradientPresets.filter((p) => p.family === family.id).length;
      expect(count % 8, `${family.id} has ${count}`).toBe(0);
      expect(count).toBeGreaterThan(0);
    }
  });

  it("puts every preset in a declared family", () => {
    const families = new Set(gradientFamilies.map((f) => f.id));
    for (const preset of gradientPresets) {
      expect(families.has(preset.family), preset.id).toBe(true);
    }
  });

  it("gives every preset a unique id and a label", () => {
    const ids = gradientPresets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of gradientPresets) {
      expect(preset.id).toMatch(/^[a-z0-9-]+$/);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it("has the default", () => {
    expect(getGradient(defaultGradientId).id).toBe(defaultGradientId);
  });

  it("falls back to the default for an id that is not there", () => {
    // A stored draft can name a preset a later build removed.
    expect(getGradient("no-such-gradient").id).toBe(defaultGradientId);
  });

  it("writes only opaque colours, so a cross-fade never shows the old one", () => {
    // Every generated layer must be fully opaque: GradientBackground keeps the
    // previous gradient painted underneath during the fade.
    for (const preset of gradientPresets) {
      const colours =
        preset.kind === "linear"
          ? preset.stops.map((s) => s.color)
          : [preset.base, ...preset.layers.map((l) => l.color)];
      for (const colour of colours) {
        expect(colour, `${preset.id}: ${colour}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("orders a linear preset's stops and spans the whole axis", () => {
    for (const preset of gradientPresets) {
      if (preset.kind !== "linear") continue;
      expect(preset.stops.length, preset.id).toBeGreaterThanOrEqual(2);
      expect(preset.stops[0].at, preset.id).toBe(0);
      expect(preset.stops[preset.stops.length - 1].at, preset.id).toBe(100);
      for (let i = 1; i < preset.stops.length; i++) {
        expect(preset.stops[i].at, preset.id).toBeGreaterThan(
          preset.stops[i - 1].at,
        );
      }
    }
  });

  it("keeps a mesh preset's layers inside the box", () => {
    for (const preset of gradientPresets) {
      if (preset.kind !== "mesh") continue;
      expect(preset.layers.length, preset.id).toBeGreaterThan(0);
      for (const layer of preset.layers) {
        expect(layer.spread, preset.id).toBeGreaterThan(0);
      }
    }
  });

  it("only answers to an angle when it is linear", () => {
    for (const preset of gradientPresets) {
      expect(supportsAngle(preset)).toBe(preset.kind === "linear");
    }
  });
});

describe("gradientToCss", () => {
  it("takes the angle it is handed over the preset's own", () => {
    const linear = gradientPresets.find((p) => p.kind === "linear")!;
    expect(gradientToCss(linear, 45)).toContain("linear-gradient(45deg");
    expect(gradientToCss(linear)).toContain(`linear-gradient(${linear.angle}deg`);
  });

  it("ignores the angle for a mesh, which has no axis", () => {
    const mesh = gradientPresets.find((p) => p.kind === "mesh");
    if (!mesh) return;
    expect(gradientToCss(mesh, 45)).toBe(gradientToCss(mesh, 300));
  });

  it("puts a mesh base last, so the radial layers composite over it", () => {
    const mesh = gradientPresets.find((p) => p.kind === "mesh");
    if (!mesh || mesh.kind !== "mesh") return;
    const css = gradientToCss(mesh);
    expect(css.indexOf("radial-gradient")).toBeLessThan(
      css.lastIndexOf("linear-gradient"),
    );
    expect(css).toContain(mesh.base);
  });

  it("produces a value for every preset in the registry", () => {
    for (const preset of gradientPresets) {
      const css = gradientToCss(preset, 90);
      expect(css.length, preset.id).toBeGreaterThan(0);
      expect(css, preset.id).toMatch(/gradient\(/);
    }
  });
});

describe("solidToCss", () => {
  it("writes a flat colour as a one-colour gradient", () => {
    // One property for every kind, so the cross-fade needs no branch.
    expect(solidToCss("#18181b")).toBe(
      "linear-gradient(0deg, #18181b 0%, #18181b 100%)",
    );
  });
});

describe("resolveGradientCss", () => {
  it("renders the chosen preset at the chosen angle", () => {
    const css = resolveGradientCss(selection({ gradientAngle: 45 }));
    expect(css).toBe(gradientToCss(getGradient(defaultGradientId), 45));
  });

  it("ignores the angle for a mesh preset", () => {
    const mesh = gradientPresets.find((p) => p.kind === "mesh");
    if (!mesh) return;
    const at45 = resolveGradientCss(
      selection({ gradientId: mesh.id, gradientAngle: 45 }),
    );
    expect(at45).toBe(
      resolveGradientCss(selection({ gradientId: mesh.id, gradientAngle: 300 })),
    );
  });

  it("renders the custom pair at the angle", () => {
    const css = resolveGradientCss(
      selection({
        background: "custom",
        customGradientFrom: "#111111",
        customGradientTo: "#222222",
        gradientAngle: 90,
      }),
    );
    expect(css).toBe("linear-gradient(90deg, #111111 0%, #222222 100%)");
  });

  it("renders a solid colour", () => {
    const css = resolveGradientCss(
      selection({ background: "solid", solidColor: "#abcdef" }),
    );
    expect(css).toBe(solidToCss("#abcdef"));
  });

  it("paints nothing for a transparent background", () => {
    // The CSS keyword, so nothing downstream needs a branch for it.
    expect(resolveGradientCss(selection({ background: "none" }))).toBe("none");
  });

  it("answers for every kind the picker offers", () => {
    for (const kind of backgroundKinds) {
      const css = resolveGradientCss(selection({ background: kind.value }));
      expect(typeof css, kind.value).toBe("string");
      expect(css.length, kind.value).toBeGreaterThan(0);
    }
  });

  it("changes with the colour, which is what drives the cross-fade", () => {
    const before = resolveGradientCss(selection({ background: "solid", solidColor: "#000000" }));
    const after = resolveGradientCss(selection({ background: "solid", solidColor: "#ffffff" }));
    expect(after).not.toBe(before);
  });
});

describe("angleApplies", () => {
  it("applies to a custom pair", () => {
    expect(angleApplies(selection({ background: "custom" }))).toBe(true);
  });

  it("applies to a linear preset and not to a mesh one", () => {
    for (const preset of gradientPresets) {
      expect(
        angleApplies(selection({ background: "preset", gradientId: preset.id })),
        preset.id,
      ).toBe(preset.kind === "linear");
    }
  });

  it("does not apply to a solid or to nothing at all", () => {
    expect(angleApplies(selection({ background: "solid" }))).toBe(false);
    expect(angleApplies(selection({ background: "none" }))).toBe(false);
  });
});
