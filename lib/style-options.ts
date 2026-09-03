/**
 * What shape the finished frame is.
 *
 * `auto` is the frame sizing itself to the artwork plus its padding, which is
 * what it always did. Anything else is a target the frame grows into, with the
 * artwork centred and the gradient filling whatever that opens up.
 *
 * These are the shapes a post is rendered at rather than a general list: a
 * square for a grid, 4:5 as the tallest a portrait post survives uncropped on
 * most feeds, 16:9 for a slide or a video embed, 9:16 for a story.
 */
export const aspectOptions = [
  { value: "auto", label: "Auto" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
];

/** Width over height, or null for `auto`, which has no target. */
export function aspectRatio(value: string): number | null {
  const [w, h] = value.split(":").map(Number);
  return w > 0 && h > 0 ? w / h : null;
}

/**
 * The frame's box for a target ratio, given what the artwork measures.
 *
 * Padding stops being the whole margin and becomes the least of it: the frame
 * grows on whichever axis is short of the ratio, never shrinks, so the artwork
 * is never scaled or cropped to fit a shape.
 */
export function aspectBox(
  artwork: { width: number; height: number },
  padding: number,
  ratio: number,
): { width: number; height: number } {
  const width = artwork.width + padding * 2;
  const height = artwork.height + padding * 2;

  return width / height < ratio
    ? { width: Math.round(height * ratio), height }
    : { width, height: Math.round(width / ratio) };
}

export type WindowChrome = "none" | "mac" | "browser";

/**
 * What sits above the media. The title bar is a bare macOS bar with the three
 * lights. The browser bar adds an address field, for a clip of a web page.
 */
export const windowChromeOptions: { value: WindowChrome; label: string }[] = [
  { value: "none", label: "None" },
  { value: "mac", label: "Title bar" },
  { value: "browser", label: "Browser" },
];

export type CaptionPosition = "above" | "below";

export const captionPositionOptions: {
  value: CaptionPosition;
  label: string;
}[] = [
  { value: "above", label: "Above" },
  { value: "below", label: "Below" },
];

/** The caption's size range in px. The frame is in media pixels, so a 4K
 * capture needs the top of it and a phone clip the bottom. */
export const CAPTION_SIZE = { min: 12, max: 120, step: 4 };

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
