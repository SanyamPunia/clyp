export const radiusSizes = [
  { value: 0, label: "None" },
  { value: 4, label: "Small" },
  { value: 8, label: "Medium" },
  { value: 12, label: "Large" },
  { value: 18, label: "X-Large" },
  { value: 26, label: "2X-Large" },
];

export const shadowOptions = [
  { value: "shadow-none", label: "None" },
  { value: "shadow-md", label: "Medium" },
  { value: "shadow-lg", label: "Large" },
  { value: "shadow-xl", label: "X-Large" },
  { value: "shadow-2xl", label: "2X-Large" },
  // Arbitrary value: this drop is deeper and more diffuse than shadow-2xl,
  // which is the largest shadow Tailwind ships a token for.
  { value: "shadow-[0_40px_80px_-20px_rgba(0,0,0,0.45)]", label: "Deep" },
];

export type Corner = "tl" | "tr" | "br" | "bl";

export interface Corners {
  tl: boolean;
  tr: boolean;
  br: boolean;
  bl: boolean;
}

export const ALL_CORNERS: Corners = { tl: true, tr: true, br: true, bl: true };

/** Order matters: this is the 2x2 order the corner picker renders in. */
export const CORNER_ORDER: { key: Corner; label: string }[] = [
  { key: "tl", label: "Top left" },
  { key: "tr", label: "Top right" },
  { key: "bl", label: "Bottom left" },
  { key: "br", label: "Bottom right" },
];

export const cornerPresets: { label: string; corners: Corners }[] = [
  { label: "All", corners: { tl: true, tr: true, br: true, bl: true } },
  { label: "Top", corners: { tl: true, tr: true, br: false, bl: false } },
  { label: "Bottom", corners: { tl: false, tr: false, br: true, bl: true } },
  { label: "None", corners: { tl: false, tr: false, br: false, bl: false } },
];

/**
 * `border-radius` shorthand for the corners that are switched on.
 * `only` restricts it further, which is how the title bar takes the top
 * corners and the screenshot underneath takes the bottom ones.
 */
export function cornerRadius(
  radius: number,
  corners: Corners,
  only?: "top" | "bottom"
): string {
  const on = (key: Corner, allowed: boolean) =>
    corners[key] && allowed ? `${radius}px` : "0px";
  const top = only !== "bottom";
  const bottom = only !== "top";
  return [
    on("tl", top),
    on("tr", top),
    on("br", bottom),
    on("bl", bottom),
  ].join(" ");
}
