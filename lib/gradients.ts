/**
 * Background registry.
 *
 * One entry describes a gradient once. Both the picker swatch and the exported
 * canvas render from the same entry through `gradientToCss`, so a preset cannot
 * look one way in the panel and another way in the export.
 *
 * Linear presets keep their stops as data instead of a baked CSS string so the
 * angle control can re-render them at any direction. Mesh presets are layered
 * radial gradients over a base color and ignore the angle.
 *
 * A background is not always a gradient. A flat colour and no colour at all are
 * the two other things a post needs, and both go through the same
 * `background-image` the gradients do: a solid is written as a one-colour
 * gradient rather than as a `background-color`, so the cross-fade, the grain
 * layer and the export need to know nothing about which kind is showing.
 */

export type GradientFamily = "atmosphere" | "aurora" | "spectrum" | "mono";

interface Stop {
  color: string;
  /** Position along the axis, in percent. */
  at: number;
}

interface MeshLayer {
  color: string;
  /** Center of the radial layer, in percent of the box. */
  x: number;
  y: number;
  /** Where the layer has faded out completely, in percent. */
  spread: number;
}

interface LinearGradient {
  kind: "linear";
  id: string;
  label: string;
  family: GradientFamily;
  angle: number;
  stops: Stop[];
}

interface MeshGradient {
  kind: "mesh";
  id: string;
  label: string;
  family: GradientFamily;
  base: string;
  layers: MeshLayer[];
}

export type GradientPreset = LinearGradient | MeshGradient;

/**
 * Eight presets per family, so the picker lays out as even rows.
 *
 * The atmosphere presets are sampled from real sky captures, which is why they
 * carry six to eight stops. A two-stop blue-to-orange reads as mud through the
 * middle. The intermediate desaturated stops are what keep the transition clean.
 */
export const gradientPresets: GradientPreset[] = [
  {
    kind: "linear",
    id: "golden-hour",
    label: "Golden Hour",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#12408f", at: 0 },
      { color: "#1c62be", at: 14 },
      { color: "#4a95dd", at: 34 },
      { color: "#9dc9ef", at: 54 },
      { color: "#c9d5d6", at: 72 },
      { color: "#dcb894", at: 86 },
      { color: "#e79a58", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "afterglow",
    label: "Afterglow",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#0b7ae8", at: 0 },
      { color: "#3d97ee", at: 18 },
      { color: "#8bbdf2", at: 38 },
      { color: "#b9c8ec", at: 56 },
      { color: "#c9bfdd", at: 70 },
      { color: "#cfa9bf", at: 86 },
      { color: "#c98da4", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "blue-hour",
    label: "Blue Hour",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#101a3f", at: 0 },
      { color: "#123166", at: 16 },
      { color: "#0f52a8", at: 36 },
      { color: "#2f7fc4", at: 54 },
      { color: "#8fb0cb", at: 74 },
      { color: "#c3c2bd", at: 88 },
      { color: "#f0d3b4", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "last-light",
    label: "Last Light",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#33339a", at: 0 },
      { color: "#4a3f96", at: 16 },
      { color: "#6b4d90", at: 30 },
      { color: "#96588a", at: 44 },
      { color: "#d1728b", at: 58 },
      { color: "#f08a7c", at: 74 },
      { color: "#f9a45f", at: 88 },
      { color: "#fdc04a", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "first-light",
    label: "First Light",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#0a1f2e", at: 0 },
      { color: "#0f3d4f", at: 18 },
      { color: "#1d6b7a", at: 38 },
      { color: "#4fa3a5", at: 56 },
      { color: "#a8c9b8", at: 74 },
      { color: "#e6d5b0", at: 90 },
      { color: "#f7e2c0", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "high-altitude",
    label: "High Altitude",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#04102b", at: 0 },
      { color: "#0a2a63", at: 22 },
      { color: "#1462b4", at: 46 },
      { color: "#5ba3dd", at: 68 },
      { color: "#b7d6ec", at: 86 },
      { color: "#e8eef2", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "ember",
    label: "Ember",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#160b12", at: 0 },
      { color: "#3d1226", at: 20 },
      { color: "#7a1f2e", at: 42 },
      { color: "#c23b2c", at: 64 },
      { color: "#ec7434", at: 82 },
      { color: "#f9b352", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "tidal",
    label: "Tidal",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#052430", at: 0 },
      { color: "#0a4a5c", at: 20 },
      { color: "#12808c", at: 42 },
      { color: "#4fb5ad", at: 62 },
      { color: "#a9d8c4", at: 80 },
      { color: "#f0e0c4", at: 100 },
    ],
  },

  {
    kind: "mesh",
    id: "aurora-violet",
    label: "Aurora",
    family: "aurora",
    base: "#150e2e",
    layers: [
      { color: "#7c5cff", x: 18, y: 20, spread: 58 },
      { color: "#e15aa8", x: 82, y: 12, spread: 52 },
      { color: "#28c7d8", x: 68, y: 84, spread: 56 },
      { color: "#2f3ec7", x: 12, y: 82, spread: 50 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-citrus",
    label: "Citrus",
    family: "aurora",
    base: "#2a1108",
    layers: [
      { color: "#ff9f43", x: 22, y: 18, spread: 56 },
      { color: "#ff5f6d", x: 80, y: 26, spread: 52 },
      { color: "#ffd166", x: 60, y: 82, spread: 54 },
      { color: "#c2410c", x: 10, y: 76, spread: 48 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-mint",
    label: "Mint",
    family: "aurora",
    base: "#06231f",
    layers: [
      { color: "#34d399", x: 20, y: 22, spread: 56 },
      { color: "#22d3ee", x: 78, y: 18, spread: 52 },
      { color: "#a3e635", x: 66, y: 80, spread: 50 },
      { color: "#0f766e", x: 14, y: 78, spread: 52 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-blush",
    label: "Blush",
    family: "aurora",
    base: "#f5e6ea",
    layers: [
      { color: "#ffc2d1", x: 20, y: 20, spread: 58 },
      { color: "#c8b6ff", x: 82, y: 18, spread: 54 },
      { color: "#bde0fe", x: 70, y: 82, spread: 56 },
      { color: "#ffd6a5", x: 14, y: 80, spread: 52 },
    ],
  },

  {
    kind: "mesh",
    id: "aurora-ember",
    label: "Ember Mesh",
    family: "aurora",
    base: "#1a0608",
    layers: [
      { color: "#ef4444", x: 24, y: 20, spread: 56 },
      { color: "#f97316", x: 78, y: 30, spread: 52 },
      { color: "#be123c", x: 62, y: 82, spread: 54 },
      { color: "#7c2d12", x: 12, y: 78, spread: 50 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-ocean",
    label: "Ocean",
    family: "aurora",
    base: "#04121f",
    layers: [
      { color: "#0ea5e9", x: 20, y: 18, spread: 58 },
      { color: "#0d9488", x: 80, y: 24, spread: 52 },
      { color: "#1d4ed8", x: 64, y: 84, spread: 54 },
      { color: "#155e75", x: 14, y: 76, spread: 50 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-plum",
    label: "Plum",
    family: "aurora",
    base: "#1b0620",
    layers: [
      { color: "#a21caf", x: 22, y: 22, spread: 56 },
      { color: "#e879f9", x: 80, y: 16, spread: 50 },
      { color: "#6d28d9", x: 66, y: 82, spread: 54 },
      { color: "#831843", x: 12, y: 80, spread: 52 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-frost",
    label: "Frost",
    family: "aurora",
    base: "#eef4fb",
    layers: [
      { color: "#bfdbfe", x: 20, y: 20, spread: 58 },
      { color: "#c7d2fe", x: 80, y: 18, spread: 54 },
      { color: "#a5f3fc", x: 68, y: 82, spread: 56 },
      { color: "#e0e7ff", x: 14, y: 78, spread: 52 },
    ],
  },

  {
    kind: "linear",
    id: "indigo-violet",
    label: "Indigo",
    family: "spectrum",
    angle: 145,
    stops: [
      { color: "#4f46e5", at: 0 },
      { color: "#7c3aed", at: 50 },
      { color: "#a21caf", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "sea-glass",
    label: "Sea Glass",
    family: "spectrum",
    angle: 145,
    stops: [
      { color: "#34d399", at: 0 },
      { color: "#22d3ee", at: 52 },
      { color: "#3b82f6", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "sunburst",
    label: "Sunburst",
    family: "spectrum",
    angle: 145,
    stops: [
      { color: "#fbbf24", at: 0 },
      { color: "#f97316", at: 52 },
      { color: "#ef4444", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "orchid",
    label: "Orchid",
    family: "spectrum",
    angle: 145,
    stops: [
      { color: "#f472b6", at: 0 },
      { color: "#c084fc", at: 52 },
      { color: "#7c3aed", at: 100 },
    ],
  },

  {
    kind: "linear",
    id: "crimson",
    label: "Crimson",
    family: "spectrum",
    angle: 145,
    stops: [
      { color: "#e11d48", at: 0 },
      { color: "#f43f5e", at: 52 },
      { color: "#fb7185", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "lagoon",
    label: "Lagoon",
    family: "spectrum",
    angle: 145,
    stops: [
      { color: "#0d9488", at: 0 },
      { color: "#0891b2", at: 52 },
      { color: "#1d4ed8", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "moss",
    label: "Moss",
    family: "spectrum",
    angle: 145,
    stops: [
      { color: "#15803d", at: 0 },
      { color: "#65a30d", at: 52 },
      { color: "#a3e635", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "dusk",
    label: "Dusk",
    family: "spectrum",
    angle: 145,
    stops: [
      { color: "#1e3a8a", at: 0 },
      { color: "#7c3aed", at: 50 },
      { color: "#ec4899", at: 100 },
    ],
  },

  {
    kind: "linear",
    id: "graphite",
    label: "Graphite",
    family: "mono",
    angle: 145,
    stops: [
      { color: "#1f2937", at: 0 },
      { color: "#374151", at: 52 },
      { color: "#4b5563", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "porcelain",
    label: "Porcelain",
    family: "mono",
    angle: 145,
    stops: [
      { color: "#f8fafc", at: 0 },
      { color: "#e2e8f0", at: 52 },
      { color: "#cbd5e1", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "obsidian",
    label: "Obsidian",
    family: "mono",
    angle: 145,
    stops: [
      { color: "#09090b", at: 0 },
      { color: "#18181b", at: 52 },
      { color: "#27272a", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "slate",
    label: "Slate",
    family: "mono",
    angle: 145,
    stops: [
      { color: "#475569", at: 0 },
      { color: "#64748b", at: 52 },
      { color: "#94a3b8", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "ash",
    label: "Ash",
    family: "mono",
    angle: 145,
    stops: [
      { color: "#a8a29e", at: 0 },
      { color: "#d6d3d1", at: 52 },
      { color: "#f5f5f4", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "ink",
    label: "Ink",
    family: "mono",
    angle: 145,
    stops: [
      { color: "#0f172a", at: 0 },
      { color: "#1e293b", at: 52 },
      { color: "#334155", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "sand",
    label: "Sand",
    family: "mono",
    angle: 145,
    stops: [
      { color: "#d6c7ae", at: 0 },
      { color: "#e7ddc9", at: 52 },
      { color: "#f6f1e6", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "fog",
    label: "Fog",
    family: "mono",
    angle: 145,
    stops: [
      { color: "#94a3b8", at: 0 },
      { color: "#cbd5e1", at: 52 },
      { color: "#e2e8f0", at: 100 },
    ],
  },
];

export const gradientFamilies: { id: GradientFamily; label: string }[] = [
  { id: "atmosphere", label: "Atmosphere" },
  { id: "aurora", label: "Aurora" },
  { id: "spectrum", label: "Spectrum" },
  { id: "mono", label: "Mono" },
];

export const defaultGradientId = "golden-hour";

/** Starting pair for the Custom tab, before the user picks anything. */
export const defaultCustomGradient = { from: "#3b82f6", to: "#8b5cf6" };

/**
 * What is behind the artwork.
 *
 * `none` is a transparent background, which is what a screenshot dropped into
 * a slide, a doc or a README needs. It is the one kind with no colour to
 * resolve, so `resolveGradientCss` answers `none` and the layers paint
 * nothing.
 */
export type BackgroundKind = "preset" | "custom" | "solid" | "none";

export const backgroundKinds: { value: BackgroundKind; label: string }[] = [
  { value: "preset", label: "Presets" },
  { value: "custom", label: "Custom" },
  { value: "solid", label: "Solid" },
  { value: "none", label: "None" },
];

/** A dark neutral, which is what makes a light screenshot and its shadow read. */
export const DEFAULT_SOLID_COLOR = "#18181b";

/** The CSS `background-image` value for a flat colour. Written as a
 * one-colour gradient so every consumer stays on one property. */
export function solidToCss(color: string): string {
  return `linear-gradient(0deg, ${color} 0%, ${color} 100%)`;
}

export function getGradient(id: string): GradientPreset {
  return (
    gradientPresets.find((preset) => preset.id === id) ??
    gradientPresets.find((preset) => preset.id === defaultGradientId)!
  );
}

/** True when the preset responds to the angle control. */
export function supportsAngle(preset: GradientPreset): boolean {
  return preset.kind === "linear";
}

/**
 * Build the CSS `background-image` value. `angle` overrides a linear preset's
 * default direction and is ignored by mesh presets.
 */
export function gradientToCss(preset: GradientPreset, angle?: number): string {
  if (preset.kind === "mesh") {
    const layers = preset.layers
      .map(
        (layer) =>
          `radial-gradient(circle at ${layer.x}% ${layer.y}%, ${layer.color} 0%, transparent ${layer.spread}%)`
      )
      .join(", ");
    // The base sits last so the radial layers composite on top of it.
    return `${layers}, linear-gradient(0deg, ${preset.base} 0%, ${preset.base} 100%)`;
  }

  const stops = preset.stops
    .map((stop) => `${stop.color} ${stop.at}%`)
    .join(", ");
  return `linear-gradient(${angle ?? preset.angle}deg, ${stops})`;
}

/** CSS for a custom two-color gradient built in the Custom tab. */
export function customGradientToCss(
  from: string,
  to: string,
  angle: number
): string {
  return `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`;
}

/** Fields of the style state that decide the background. */
interface GradientSelection {
  background: BackgroundKind;
  gradientId: string;
  gradientAngle: number;
  customGradientFrom: string;
  customGradientTo: string;
  solidColor: string;
}

/**
 * The one place style state turns into a background value. Callers that need
 * to compare two states (to drive the cross-fade) run both through this.
 *
 * `none` is the CSS keyword, so a transparent background needs no branch
 * anywhere downstream: the layers are handed a `background-image` that paints
 * nothing.
 */
export function resolveGradientCss(selection: GradientSelection): string {
  switch (selection.background) {
    case "none":
      return "none";

    case "solid":
      return solidToCss(selection.solidColor);

    case "custom":
      return customGradientToCss(
        selection.customGradientFrom,
        selection.customGradientTo,
        selection.gradientAngle
      );

    case "preset": {
      const preset = getGradient(selection.gradientId);
      return gradientToCss(
        preset,
        supportsAngle(preset) ? selection.gradientAngle : undefined
      );
    }
  }
}

/** Whether the angle control does anything for this selection. */
export function angleApplies(selection: GradientSelection): boolean {
  if (selection.background === "custom") return true;
  if (selection.background !== "preset") return false;
  return supportsAngle(getGradient(selection.gradientId));
}
