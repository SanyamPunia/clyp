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
  type GradientPreset,
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

/** Every colour a preset names, whatever its kind. */
function coloursOf(preset: GradientPreset): string[] {
  switch (preset.kind) {
    case "linear":
      return preset.stops.map((s) => s.color);
    case "mesh":
      return [preset.base, ...preset.layers.map((l) => l.color)];
    case "scene":
      return [
        ...preset.base.map((s) => s.color),
        ...preset.layers.flatMap((l) =>
          l.shape === "band"
            ? // A band is a layer over the base, so it may leave parts of
              // itself clear. Only its colours are checked.
              l.stops.map((s) => s.color).filter((c) => c !== "transparent")
            : [l.color],
        ),
      ];
    case "paper":
      // The parts over the sheet are drawn at their own opacity, which the
      // solid sheet under them keeps from ever showing through.
      return [
        preset.color,
        ...[preset.mottle, preset.fibres, preset.speckles, preset.stains, preset.lines]
          .filter((part) => part !== undefined)
          .map((part) => part.color),
      ];
    case "halftone":
      return [preset.paper, preset.ink, ...(preset.plates ?? [])];
    case "fluted":
      return preset.colors;
  }
}

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

  it("never repeats a label, since the label is the swatch's only name", () => {
    // A swatch shows no text: the label is its tooltip and its screen-reader
    // name, so two presets sharing one are indistinguishable. Where a colour
    // name is wanted twice, the mesh one carries the suffix.
    const labels = gradientPresets.map((p) => p.label);
    const repeated = labels.filter((l, i) => labels.indexOf(l) !== i);
    expect(repeated).toEqual([]);
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
      const colours = coloursOf(preset);
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

  it("gives a scene an opaque base that spans the whole height", () => {
    // The base is what keeps a scene opaque under a cross-fade, whatever its
    // layers leave clear, so it may not have a gap at either end.
    for (const preset of gradientPresets) {
      if (preset.kind !== "scene") continue;
      expect(preset.base[0].at, preset.id).toBe(0);
      expect(preset.base[preset.base.length - 1].at, preset.id).toBe(100);
      for (let i = 1; i < preset.base.length; i++) {
        expect(preset.base[i].at, preset.id).toBeGreaterThanOrEqual(
          preset.base[i - 1].at,
        );
      }
    }
  });

  it("keeps a scene's shapes sized and its bands in order", () => {
    for (const preset of gradientPresets) {
      if (preset.kind !== "scene") continue;
      for (const layer of preset.layers) {
        if (layer.shape === "band") {
          expect(layer.stops.length, preset.id).toBeGreaterThanOrEqual(2);
          for (let i = 1; i < layer.stops.length; i++) {
            expect(layer.stops[i].at, preset.id).toBeGreaterThanOrEqual(
              layer.stops[i - 1].at,
            );
          }
        } else {
          const size = layer.shape === "disc" ? [layer.r] : [layer.w, layer.h];
          for (const n of size) expect(n, preset.id).toBeGreaterThan(0);
          expect(layer.hold ?? 0, preset.id).toBeLessThan(100);
        }
      }
    }
  });

  it("suggests grain only in the range the slider offers", () => {
    for (const family of gradientFamilies) {
      if (family.grain === undefined) continue;
      expect(family.grain, family.id).toBeGreaterThanOrEqual(5);
      expect(family.grain, family.id).toBeLessThanOrEqual(100);
      expect(family.grain % 5, family.id).toBe(0);
    }
  });

  it("only answers to an angle when it is linear", () => {
    for (const preset of gradientPresets) {
      expect(supportsAngle(preset)).toBe(preset.kind === "linear");
    }
  });
});

describe("gradientToCss", () => {
  it("draws a scene's layers over its base", () => {
    const scene = gradientPresets.find((p) => p.kind === "scene");
    if (!scene || scene.kind !== "scene") throw new Error("No scene preset");
    const css = gradientToCss(scene);
    // The base is the last layer, so it is the one painted underneath.
    expect(css.endsWith(`linear-gradient(180deg, ${scene.base
      .map((s) => `${s.color} ${s.at}%`)
      .join(", ")})`)).toBe(true);
    expect(gradientToCss(scene, 45)).toBe(gradientToCss(scene, 300));
  });

  it("keeps a disc round on any box and gives it a hard edge", () => {
    const moon = gradientPresets.find((p) => p.id === "horizon-pink-dunes");
    if (!moon || moon.kind !== "scene") throw new Error("No dunes preset");
    // `circle` rather than two radii, since two percentages of a tall box
    // would draw an oval.
    expect(gradientToCss(moon)).toContain("radial-gradient(circle at 50% 47%");
  });

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

  it("paints a generated preset over a solid layer of its own ground", () => {
    // The SVG may take a moment to decode, and the ground under it is what
    // keeps the layer opaque meanwhile.
    for (const preset of gradientPresets) {
      if (preset.kind !== "paper" && preset.kind !== "halftone" && preset.kind !== "fluted") continue;
      const ground =
        preset.kind === "paper"
          ? preset.color
          : preset.kind === "halftone"
            ? preset.paper
            : preset.colors[0];
      const css = gradientToCss(preset);
      expect(css.startsWith('url("data:image/svg+xml,'), preset.id).toBe(true);
      expect(css.endsWith(`linear-gradient(0deg, ${ground} 0%, ${ground} 100%)`), preset.id).toBe(true);
    }
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
