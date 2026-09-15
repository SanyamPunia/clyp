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
 * A family holds a multiple of eight presets, so the picker lays out as even
 * rows. The first eight are the row the picker shows before its fold, so the
 * strongest of a family go at the front and additions go at the back.
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
    kind: "linear",
    id: "alpenglow",
    label: "Alpenglow",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#131a3a", at: 0 },
      { color: "#2a2a5c", at: 16 },
      { color: "#4e3a72", at: 34 },
      { color: "#8a4f7d", at: 54 },
      { color: "#c2707f", at: 72 },
      { color: "#e59d8c", at: 88 },
      { color: "#f6c9a8", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "monsoon",
    label: "Monsoon",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#141c1f", at: 0 },
      { color: "#24302f", at: 16 },
      { color: "#3a4a44", at: 34 },
      { color: "#5a6b5f", at: 54 },
      { color: "#85937f", at: 72 },
      { color: "#b3bda6", at: 88 },
      { color: "#dde2cd", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "sea-fog",
    label: "Sea Fog",
    family: "atmosphere",
    angle: 200,
    stops: [
      { color: "#7d95a3", at: 0 },
      { color: "#96abb6", at: 26 },
      { color: "#b0c1c9", at: 50 },
      { color: "#c8d5da", at: 76 },
      { color: "#dde5e8", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "noctilucent",
    label: "Noctilucent",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#05060f", at: 0 },
      { color: "#0a1230", at: 20 },
      { color: "#123a6e", at: 44 },
      { color: "#1d6fae", at: 66 },
      { color: "#4aa8d8", at: 85 },
      { color: "#9fd8ef", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "harmattan",
    label: "Harmattan",
    family: "atmosphere",
    angle: 165,
    stops: [
      { color: "#4a3418", at: 0 },
      { color: "#6b4c22", at: 18 },
      { color: "#8f6a33", at: 38 },
      { color: "#b08c52", at: 58 },
      { color: "#cdae7c", at: 76 },
      { color: "#e2cba4", at: 90 },
      { color: "#f2e6c8", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "arctic-noon",
    label: "Arctic Noon",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#6d92b4", at: 0 },
      { color: "#89a9c6", at: 20 },
      { color: "#a7c1d6", at: 40 },
      { color: "#c5d7e4", at: 62 },
      { color: "#e0eaf1", at: 82 },
      { color: "#f2f7fa", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "wildfire-sun",
    label: "Wildfire Sun",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#3a1410", at: 0 },
      { color: "#5e2214", at: 18 },
      { color: "#8c3418", at: 38 },
      { color: "#b5501f", at: 58 },
      { color: "#cf7434", at: 80 },
      { color: "#dda05a", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "pre-dawn",
    label: "Pre-Dawn",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#0a1024", at: 0 },
      { color: "#131c44", at: 18 },
      { color: "#1e3160", at: 38 },
      { color: "#2a4d72", at: 58 },
      { color: "#3a6d7d", at: 80 },
      { color: "#56917f", at: 100 },
    ],
  },

  {
    kind: "linear",
    id: "moonrise",
    label: "Moonrise",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#070a18", at: 0 },
      { color: "#0e1430", at: 18 },
      { color: "#1c2550", at: 38 },
      { color: "#33406f", at: 58 },
      { color: "#5f6d95", at: 78 },
      { color: "#9aa5c0", at: 92 },
      { color: "#cfd6e4", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "thunderhead",
    label: "Thunderhead",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#161a1c", at: 0 },
      { color: "#262d30", at: 16 },
      { color: "#3a4448", at: 34 },
      { color: "#545f62", at: 52 },
      { color: "#77827f", at: 70 },
      { color: "#9ea69c", at: 86 },
      { color: "#c6cbbd", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "sirocco",
    label: "Sirocco",
    family: "atmosphere",
    angle: 170,
    stops: [
      { color: "#3d1a0c", at: 0 },
      { color: "#6b3011", at: 18 },
      { color: "#9a5320", at: 38 },
      { color: "#c07c3a", at: 58 },
      { color: "#d9a468", at: 78 },
      { color: "#ecc99a", at: 92 },
      { color: "#f7e3c4", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "green-flash",
    label: "Green Flash",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#04161f", at: 0 },
      { color: "#07303f", at: 18 },
      { color: "#0b5560", at: 36 },
      { color: "#17806d", at: 54 },
      { color: "#4fa45f", at: 72 },
      { color: "#9dbf4a", at: 88 },
      { color: "#e8cf58", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "belt-of-venus",
    label: "Belt of Venus",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#a8c4de", at: 0 },
      { color: "#b9bfd4", at: 14 },
      { color: "#cdb3c2", at: 30 },
      { color: "#d9a3ac", at: 46 },
      { color: "#bd8b9c", at: 62 },
      { color: "#79708f", at: 78 },
      { color: "#4a5273", at: 90 },
      { color: "#2f3a5a", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "cold-front",
    label: "Cold Front",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#2b3440", at: 0 },
      { color: "#3d4a5c", at: 18 },
      { color: "#55617a", at: 36 },
      { color: "#726f8e", at: 54 },
      { color: "#8f8497", at: 72 },
      { color: "#b0a9b2", at: 88 },
      { color: "#d6d3d6", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "glacier",
    label: "Glacier",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#0e3a4a", at: 0 },
      { color: "#17566a", at: 18 },
      { color: "#2b7d8f", at: 38 },
      { color: "#58a6b0", at: 56 },
      { color: "#93c8cd", at: 74 },
      { color: "#c6e2e4", at: 90 },
      { color: "#edf6f7", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "solstice",
    label: "Solstice",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#1b1038", at: 0 },
      { color: "#351a5c", at: 16 },
      { color: "#5c1f77", at: 32 },
      { color: "#8c2a76", at: 50 },
      { color: "#b8416a", at: 66 },
      { color: "#d96a51", at: 82 },
      { color: "#f0a23f", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "nightfall",
    label: "Nightfall",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#04040a", at: 0 },
      { color: "#0b0a1c", at: 18 },
      { color: "#171436", at: 38 },
      { color: "#2a1c4d", at: 58 },
      { color: "#452561", at: 78 },
      { color: "#63305f", at: 92 },
      { color: "#7c3c5b", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "dust-veil",
    label: "Dust Veil",
    family: "atmosphere",
    angle: 175,
    stops: [
      { color: "#4b4d52", at: 0 },
      { color: "#5d5c5a", at: 16 },
      { color: "#756e5f", at: 34 },
      { color: "#927f5e", at: 52 },
      { color: "#a88a5d", at: 66 },
      { color: "#9e8d74", at: 82 },
      { color: "#8e8e8e", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "midwinter",
    label: "Midwinter",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#6f6f9c", at: 0 },
      { color: "#7d84ad", at: 18 },
      { color: "#8f9bbd", at: 36 },
      { color: "#a5b1cb", at: 54 },
      { color: "#bfc8da", at: 72 },
      { color: "#d9dfe9", at: 88 },
      { color: "#f0f3f7", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "rainshadow",
    label: "Rainshadow",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#3b4348", at: 0 },
      { color: "#545a58", at: 16 },
      { color: "#6f6f60", at: 34 },
      { color: "#8d846a", at: 52 },
      { color: "#ab9c77", at: 70 },
      { color: "#c7b992", at: 86 },
      { color: "#e2d8b8", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "zenith",
    label: "Zenith",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#0b3f9e", at: 0 },
      { color: "#1655b8", at: 18 },
      { color: "#2470cd", at: 36 },
      { color: "#3d8cdc", at: 54 },
      { color: "#6aa9e7", at: 72 },
      { color: "#a2cbf0", at: 88 },
      { color: "#d8e8f7", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "tropic",
    label: "Tropic",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#062c5e", at: 0 },
      { color: "#0a4a86", at: 18 },
      { color: "#0f76a2", at: 36 },
      { color: "#27a3ab", at: 54 },
      { color: "#63c6b0", at: 72 },
      { color: "#aadfbf", at: 88 },
      { color: "#f0ecc8", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "mirage",
    label: "Mirage",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#c9def2", at: 0 },
      { color: "#d9e8f3", at: 16 },
      { color: "#e8eff0", at: 34 },
      { color: "#f3f2e6", at: 52 },
      { color: "#f8efd6", at: 70 },
      { color: "#f7e6bd", at: 86 },
      { color: "#f2dba4", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "ionosphere",
    label: "Ionosphere",
    family: "atmosphere",
    angle: 180,
    stops: [
      { color: "#0a0618", at: 0 },
      { color: "#1c0c3a", at: 18 },
      { color: "#3a1663", at: 36 },
      { color: "#642073", at: 52 },
      { color: "#93307a", at: 68 },
      { color: "#a85f8e", at: 82 },
      { color: "#8fb9c9", at: 100 },
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
    kind: "mesh",
    id: "aurora-nebula",
    label: "Nebula",
    family: "aurora",
    base: "#0d0820",
    layers: [
      { color: "#b14cff", x: 20, y: 18, spread: 58 },
      { color: "#3b6dff", x: 80, y: 20, spread: 54 },
      { color: "#ff4d94", x: 70, y: 82, spread: 52 },
      { color: "#5a1ea8", x: 14, y: 78, spread: 50 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-lime",
    label: "Lime",
    family: "aurora",
    base: "#111f06",
    layers: [
      { color: "#a3e635", x: 20, y: 20, spread: 56 },
      { color: "#4ade80", x: 80, y: 16, spread: 52 },
      { color: "#facc15", x: 64, y: 84, spread: 54 },
      { color: "#3f6212", x: 12, y: 78, spread: 48 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-coral",
    label: "Coral",
    family: "aurora",
    base: "#2b0f13",
    layers: [
      { color: "#ff7a5c", x: 22, y: 20, spread: 56 },
      { color: "#ffb08a", x: 80, y: 22, spread: 52 },
      { color: "#f43f5e", x: 62, y: 82, spread: 52 },
      { color: "#9d174d", x: 12, y: 78, spread: 48 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-indigo",
    label: "Indigo Mesh",
    family: "aurora",
    base: "#0a0d24",
    layers: [
      { color: "#4f46e5", x: 20, y: 20, spread: 58 },
      { color: "#7c3aed", x: 80, y: 18, spread: 52 },
      { color: "#2563eb", x: 66, y: 82, spread: 54 },
      { color: "#1e1b4b", x: 12, y: 78, spread: 50 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-sunset",
    label: "Sunset",
    family: "aurora",
    base: "#1f0a1c",
    layers: [
      { color: "#fb923c", x: 20, y: 22, spread: 56 },
      { color: "#f472b6", x: 78, y: 18, spread: 54 },
      { color: "#a855f7", x: 64, y: 84, spread: 52 },
      { color: "#7c2d12", x: 12, y: 76, spread: 48 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-teal",
    label: "Teal",
    family: "aurora",
    base: "#04201f",
    layers: [
      { color: "#2dd4bf", x: 20, y: 20, spread: 56 },
      { color: "#38bdf8", x: 80, y: 20, spread: 52 },
      { color: "#4ade80", x: 62, y: 84, spread: 54 },
      { color: "#115e59", x: 12, y: 76, spread: 48 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-berry",
    label: "Berry",
    family: "aurora",
    base: "#1c0618",
    layers: [
      { color: "#e11d74", x: 22, y: 18, spread: 56 },
      { color: "#a21caf", x: 80, y: 22, spread: 52 },
      { color: "#f97393", x: 64, y: 82, spread: 52 },
      { color: "#4c0519", x: 12, y: 78, spread: 48 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-gold",
    label: "Gold",
    family: "aurora",
    base: "#20140a",
    layers: [
      { color: "#f59e0b", x: 20, y: 20, spread: 56 },
      { color: "#fcd34d", x: 78, y: 18, spread: 52 },
      { color: "#d97706", x: 66, y: 84, spread: 54 },
      { color: "#78350f", x: 12, y: 76, spread: 48 },
    ],
  },

  {
    kind: "mesh",
    id: "aurora-jade",
    label: "Jade",
    family: "aurora",
    base: "#04251f",
    layers: [
      { color: "#0f9b74", x: 20, y: 18, spread: 58 },
      { color: "#16b8ad", x: 80, y: 22, spread: 54 },
      { color: "#4bd6a0", x: 66, y: 82, spread: 52 },
      { color: "#0a5744", x: 12, y: 80, spread: 50 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-lavender",
    label: "Lavender",
    family: "aurora",
    base: "#efe9f8",
    layers: [
      { color: "#cdbdf5", x: 20, y: 20, spread: 58 },
      { color: "#b8c7f7", x: 82, y: 18, spread: 54 },
      { color: "#f0c2e4", x: 68, y: 82, spread: 56 },
      { color: "#ddd0fa", x: 14, y: 80, spread: 52 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-cobalt",
    label: "Cobalt Mesh",
    family: "aurora",
    base: "#040a24",
    layers: [
      { color: "#1d4ed8", x: 22, y: 20, spread: 58 },
      { color: "#38bdf8", x: 80, y: 20, spread: 50 },
      { color: "#1e40af", x: 62, y: 84, spread: 54 },
      { color: "#0369a1", x: 12, y: 76, spread: 48 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-rose-quartz",
    label: "Rose Quartz",
    family: "aurora",
    base: "#f7e9ec",
    layers: [
      { color: "#f2b8c4", x: 20, y: 20, spread: 58 },
      { color: "#efc9b4", x: 82, y: 18, spread: 54 },
      { color: "#e6b9d4", x: 68, y: 82, spread: 56 },
      { color: "#f7d9cf", x: 14, y: 80, spread: 52 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-moss",
    label: "Moss Mesh",
    family: "aurora",
    base: "#12180c",
    layers: [
      { color: "#4d7c0f", x: 20, y: 20, spread: 56 },
      { color: "#6b8e23", x: 80, y: 18, spread: 52 },
      { color: "#8fa15a", x: 64, y: 84, spread: 54 },
      { color: "#2f4a10", x: 12, y: 78, spread: 48 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-midnight",
    label: "Midnight",
    family: "aurora",
    base: "#03040c",
    layers: [
      { color: "#1e3a8a", x: 20, y: 18, spread: 58 },
      { color: "#312e81", x: 80, y: 22, spread: 54 },
      { color: "#0f766e", x: 66, y: 84, spread: 52 },
      { color: "#1e1b4b", x: 12, y: 78, spread: 50 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-papaya",
    label: "Papaya",
    family: "aurora",
    base: "#fdf0e0",
    layers: [
      { color: "#fcb96b", x: 20, y: 20, spread: 58 },
      { color: "#f98b6b", x: 80, y: 18, spread: 54 },
      { color: "#fbd786", x: 66, y: 82, spread: 56 },
      { color: "#f7a3a0", x: 14, y: 80, spread: 52 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-iris",
    label: "Iris",
    family: "aurora",
    base: "#100833",
    layers: [
      { color: "#5b5bf0", x: 20, y: 18, spread: 58 },
      { color: "#3a7bd5", x: 80, y: 22, spread: 54 },
      { color: "#9b5de5", x: 66, y: 82, spread: 52 },
      { color: "#221a66", x: 12, y: 78, spread: 50 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-seafoam",
    label: "Seafoam",
    family: "aurora",
    base: "#eaf7f2",
    layers: [
      { color: "#b4e8d5", x: 20, y: 20, spread: 58 },
      { color: "#a8dcea", x: 82, y: 18, spread: 54 },
      { color: "#d7f0c8", x: 68, y: 82, spread: 56 },
      { color: "#c9ece1", x: 14, y: 80, spread: 52 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-rust",
    label: "Rust",
    family: "aurora",
    base: "#1d0d06",
    layers: [
      { color: "#b4451f", x: 22, y: 20, spread: 56 },
      { color: "#d97038", x: 80, y: 22, spread: 52 },
      { color: "#8a2b0f", x: 62, y: 84, spread: 54 },
      { color: "#5c2a12", x: 12, y: 78, spread: 48 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-neon",
    label: "Neon",
    family: "aurora",
    base: "#05020a",
    layers: [
      { color: "#ff2bd1", x: 20, y: 18, spread: 58 },
      { color: "#00e5ff", x: 80, y: 22, spread: 52 },
      { color: "#b6ff3a", x: 64, y: 84, spread: 54 },
      { color: "#6a00f4", x: 12, y: 78, spread: 50 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-opal",
    label: "Opal",
    family: "aurora",
    base: "#f4f6f8",
    layers: [
      { color: "#c9ecf2", x: 20, y: 20, spread: 58 },
      { color: "#f2d2e6", x: 82, y: 18, spread: 54 },
      { color: "#ddd2f5", x: 68, y: 82, spread: 56 },
      { color: "#d4f0e0", x: 14, y: 80, spread: 52 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-dragonfruit",
    label: "Dragonfruit",
    family: "aurora",
    base: "#22062a",
    layers: [
      { color: "#ff2d78", x: 20, y: 18, spread: 58 },
      { color: "#d926a9", x: 80, y: 22, spread: 52 },
      { color: "#8ce03a", x: 66, y: 84, spread: 50 },
      { color: "#5b0f4a", x: 12, y: 78, spread: 48 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-cocoa",
    label: "Cocoa",
    family: "aurora",
    base: "#1a110b",
    layers: [
      { color: "#8a5a3c", x: 22, y: 20, spread: 58 },
      { color: "#b98a5e", x: 80, y: 22, spread: 52 },
      { color: "#6b3f28", x: 62, y: 84, spread: 54 },
      { color: "#3d2517", x: 12, y: 78, spread: 48 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-sorbet",
    label: "Sorbet",
    family: "aurora",
    base: "#fdf4e6",
    layers: [
      { color: "#ffd9a0", x: 20, y: 20, spread: 58 },
      { color: "#ffc0cb", x: 80, y: 18, spread: 54 },
      { color: "#c8f0d8", x: 66, y: 82, spread: 56 },
      { color: "#fceeb0", x: 14, y: 80, spread: 52 },
    ],
  },
  {
    kind: "mesh",
    id: "aurora-storm",
    label: "Storm",
    family: "aurora",
    base: "#171c22",
    layers: [
      { color: "#3f5670", x: 20, y: 18, spread: 58 },
      { color: "#566e85", x: 80, y: 22, spread: 54 },
      { color: "#2c3b4c", x: 66, y: 84, spread: 52 },
      { color: "#223040", x: 12, y: 78, spread: 50 },
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
    id: "azure",
    label: "Azure",
    family: "spectrum",
    angle: 160,
    stops: [
      { color: "#0c4a9e", at: 0 },
      { color: "#1d6fd0", at: 34 },
      { color: "#4c9ee8", at: 68 },
      { color: "#8ec7f5", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "flamingo",
    label: "Flamingo",
    family: "spectrum",
    angle: 150,
    stops: [
      { color: "#e0356f", at: 0 },
      { color: "#f05f7b", at: 32 },
      { color: "#fa8a72", at: 66 },
      { color: "#ffb682", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "emerald",
    label: "Emerald",
    family: "spectrum",
    angle: 170,
    stops: [
      { color: "#065f46", at: 0 },
      { color: "#0d9268", at: 34 },
      { color: "#2fbd8a", at: 68 },
      { color: "#7fdcb4", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "amethyst",
    label: "Amethyst",
    family: "spectrum",
    angle: 155,
    stops: [
      { color: "#4c1d95", at: 0 },
      { color: "#6d28d9", at: 32 },
      { color: "#9061f0", at: 66 },
      { color: "#c0a2fa", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "tangerine",
    label: "Tangerine",
    family: "spectrum",
    angle: 175,
    stops: [
      { color: "#c2410c", at: 0 },
      { color: "#ea7317", at: 34 },
      { color: "#f7a63a", at: 68 },
      { color: "#fbd67a", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "cobalt",
    label: "Cobalt",
    family: "spectrum",
    angle: 145,
    stops: [
      { color: "#1e3a8a", at: 0 },
      { color: "#1d5fb8", at: 30 },
      { color: "#1d8fb8", at: 62 },
      { color: "#3fc0c4", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "magenta-drift",
    label: "Magenta",
    family: "spectrum",
    angle: 165,
    stops: [
      { color: "#a21caf", at: 0 },
      { color: "#c026d3", at: 30 },
      { color: "#d95ce8", at: 62 },
      { color: "#eba2f5", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "chartreuse",
    label: "Chartreuse",
    family: "spectrum",
    angle: 150,
    stops: [
      { color: "#4d7c0f", at: 0 },
      { color: "#79a520", at: 32 },
      { color: "#a8c93c", at: 64 },
      { color: "#cfe27a", at: 100 },
    ],
  },

  {
    kind: "linear",
    id: "peach",
    label: "Peach",
    family: "spectrum",
    angle: 145,
    stops: [
      { color: "#f97316", at: 0 },
      { color: "#fb923c", at: 34 },
      { color: "#fdba74", at: 68 },
      { color: "#fed7aa", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "candy",
    label: "Candy",
    family: "spectrum",
    angle: 150,
    stops: [
      { color: "#ec4899", at: 0 },
      { color: "#f472b6", at: 34 },
      { color: "#f9a8d4", at: 68 },
      { color: "#fbcfe8", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "celadon",
    label: "Celadon",
    family: "spectrum",
    angle: 150,
    stops: [
      { color: "#2f6b5a", at: 0 },
      { color: "#4d8f76", at: 34 },
      { color: "#7fb59a", at: 68 },
      { color: "#b8dcc6", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "periwinkle",
    label: "Periwinkle",
    family: "spectrum",
    angle: 155,
    stops: [
      { color: "#4338ca", at: 0 },
      { color: "#6366f1", at: 34 },
      { color: "#8b9cf7", at: 68 },
      { color: "#c7d2fe", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "marigold",
    label: "Marigold",
    family: "spectrum",
    angle: 165,
    stops: [
      { color: "#a16207", at: 0 },
      { color: "#eab308", at: 34 },
      { color: "#facc15", at: 68 },
      { color: "#fde047", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "bronze",
    label: "Bronze",
    family: "spectrum",
    angle: 160,
    stops: [
      { color: "#78350f", at: 0 },
      { color: "#a55b12", at: 34 },
      { color: "#d08a1c", at: 68 },
      { color: "#f5b942", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "sangria",
    label: "Sangria",
    family: "spectrum",
    angle: 150,
    stops: [
      { color: "#4c0519", at: 0 },
      { color: "#881337", at: 34 },
      { color: "#b4204a", at: 68 },
      { color: "#e11d48", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "ultraviolet",
    label: "Ultraviolet",
    family: "spectrum",
    angle: 155,
    stops: [
      { color: "#140a2e", at: 0 },
      { color: "#3b1078", at: 34 },
      { color: "#a855f7", at: 74 },
      { color: "#f0abfc", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "forest",
    label: "Forest",
    family: "spectrum",
    angle: 165,
    stops: [
      { color: "#14532d", at: 0 },
      { color: "#166534", at: 34 },
      { color: "#18a349", at: 68 },
      { color: "#22c55e", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "aqua",
    label: "Aqua",
    family: "spectrum",
    angle: 145,
    stops: [
      { color: "#0e7490", at: 0 },
      { color: "#06b6d4", at: 34 },
      { color: "#67e8f9", at: 68 },
      { color: "#cffafe", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "mulberry",
    label: "Mulberry",
    family: "spectrum",
    angle: 150,
    stops: [
      { color: "#581c87", at: 0 },
      { color: "#7e1f8f", at: 34 },
      { color: "#a31d75", at: 68 },
      { color: "#be185d", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "petrol",
    label: "Petrol",
    family: "spectrum",
    angle: 170,
    stops: [
      { color: "#0b2b34", at: 0 },
      { color: "#12525f", at: 34 },
      { color: "#1d7a85", at: 68 },
      { color: "#35a3a3", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "blood-orange",
    label: "Blood Orange",
    family: "spectrum",
    angle: 160,
    stops: [
      { color: "#7f1d1d", at: 0 },
      { color: "#b91c1c", at: 34 },
      { color: "#ea580c", at: 70 },
      { color: "#f97316", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "clay",
    label: "Clay",
    family: "spectrum",
    angle: 155,
    stops: [
      { color: "#7c2d12", at: 0 },
      { color: "#9a3412", at: 34 },
      { color: "#c2410c", at: 68 },
      { color: "#e07a4a", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "mauve",
    label: "Mauve",
    family: "spectrum",
    angle: 145,
    stops: [
      { color: "#6b4d5e", at: 0 },
      { color: "#9b7285", at: 34 },
      { color: "#c39fae", at: 68 },
      { color: "#e6cdd6", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "seabed",
    label: "Seabed",
    family: "spectrum",
    angle: 175,
    stops: [
      { color: "#0c1f3f", at: 0 },
      { color: "#16385f", at: 34 },
      { color: "#23577a", at: 68 },
      { color: "#35798f", at: 100 },
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
  {
    kind: "linear",
    id: "bone",
    label: "Bone",
    family: "mono",
    angle: 150,
    stops: [
      { color: "#c8c2b6", at: 0 },
      { color: "#ddd8cd", at: 52 },
      { color: "#efece4", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "charcoal",
    label: "Charcoal",
    family: "mono",
    angle: 145,
    stops: [
      { color: "#26262a", at: 0 },
      { color: "#3a3a40", at: 54 },
      { color: "#4e4e56", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "pewter",
    label: "Pewter",
    family: "mono",
    angle: 160,
    stops: [
      { color: "#7c8590", at: 0 },
      { color: "#98a1ac", at: 52 },
      { color: "#b6bec7", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "linen",
    label: "Linen",
    family: "mono",
    angle: 140,
    stops: [
      { color: "#e3dbcd", at: 0 },
      { color: "#eee8dc", at: 54 },
      { color: "#f8f5ee", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "basalt",
    label: "Basalt",
    family: "mono",
    angle: 155,
    stops: [
      { color: "#1c2126", at: 0 },
      { color: "#2c343c", at: 52 },
      { color: "#3d4753", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "chalk",
    label: "Chalk",
    family: "mono",
    angle: 165,
    stops: [
      { color: "#dcdee1", at: 0 },
      { color: "#e9eaec", at: 52 },
      { color: "#f6f7f8", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "smoke",
    label: "Smoke",
    family: "mono",
    angle: 135,
    stops: [
      { color: "#5b636d", at: 0 },
      { color: "#767f8a", at: 54 },
      { color: "#949ca6", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "taupe",
    label: "Taupe",
    family: "mono",
    angle: 150,
    stops: [
      { color: "#7d7268", at: 0 },
      { color: "#988c80", at: 52 },
      { color: "#b4a89b", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "concrete",
    label: "Concrete",
    family: "mono",
    angle: 145,
    stops: [
      { color: "#8c9196", at: 0 },
      { color: "#a3a8ad", at: 52 },
      { color: "#bcc1c6", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "oat",
    label: "Oat",
    family: "mono",
    angle: 140,
    stops: [
      { color: "#cfc4b0", at: 0 },
      { color: "#e0d8c8", at: 52 },
      { color: "#f2ede3", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "onyx",
    label: "Onyx",
    family: "mono",
    angle: 150,
    stops: [
      { color: "#0b0e14", at: 0 },
      { color: "#151a22", at: 52 },
      { color: "#222932", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "nickel",
    label: "Nickel",
    family: "mono",
    angle: 160,
    stops: [
      { color: "#6f7780", at: 0 },
      { color: "#8b939c", at: 52 },
      { color: "#a9b0b8", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "driftwood",
    label: "Driftwood",
    family: "mono",
    angle: 150,
    stops: [
      { color: "#96897c", at: 0 },
      { color: "#ada197", at: 52 },
      { color: "#c6bcb3", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "cloud",
    label: "Cloud",
    family: "mono",
    angle: 165,
    stops: [
      { color: "#e6eaef", at: 0 },
      { color: "#f0f3f6", at: 52 },
      { color: "#fafbfc", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "tarmac",
    label: "Tarmac",
    family: "mono",
    angle: 145,
    stops: [
      { color: "#2e2c2a", at: 0 },
      { color: "#403d3a", at: 52 },
      { color: "#55514d", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "alabaster",
    label: "Alabaster",
    family: "mono",
    angle: 140,
    stops: [
      { color: "#efe9e0", at: 0 },
      { color: "#f6f2ec", at: 52 },
      { color: "#fdfbf8", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "gunmetal",
    label: "Gunmetal",
    family: "mono",
    angle: 155,
    stops: [
      { color: "#202830", at: 0 },
      { color: "#2f3a45", at: 52 },
      { color: "#43505d", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "mushroom",
    label: "Mushroom",
    family: "mono",
    angle: 150,
    stops: [
      { color: "#8d8279", at: 0 },
      { color: "#a49a91", at: 52 },
      { color: "#beb5ad", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "silver",
    label: "Silver",
    family: "mono",
    angle: 160,
    stops: [
      { color: "#b9bfc6", at: 0 },
      { color: "#ced3d9", at: 52 },
      { color: "#e4e7eb", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "peat",
    label: "Peat",
    family: "mono",
    angle: 145,
    stops: [
      { color: "#241f1b", at: 0 },
      { color: "#352e28", at: 52 },
      { color: "#4a4139", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "lichen",
    label: "Lichen",
    family: "mono",
    angle: 155,
    stops: [
      { color: "#7f8a7f", at: 0 },
      { color: "#9aa49a", at: 52 },
      { color: "#b8c0b7", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "dove",
    label: "Dove",
    family: "mono",
    angle: 140,
    stops: [
      { color: "#c4bfba", at: 0 },
      { color: "#d7d3cf", at: 52 },
      { color: "#eae7e4", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "anthracite",
    label: "Anthracite",
    family: "mono",
    angle: 150,
    stops: [
      { color: "#131417", at: 0 },
      { color: "#1f2125", at: 52 },
      { color: "#2d3035", at: 100 },
    ],
  },
  {
    kind: "linear",
    id: "chambray",
    label: "Chambray",
    family: "mono",
    angle: 135,
    stops: [
      { color: "#6b7a8c", at: 0 },
      { color: "#8695a5", at: 52 },
      { color: "#a6b3c0", at: 100 },
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
