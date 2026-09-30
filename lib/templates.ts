/**
 * Export templates: the sizes a platform shows a post at.
 *
 * A template is a target shape plus an exact output size. The shape comes from
 * the size, so the two cannot drift apart: the frame grows to the template's
 * ratio through the same `aspectBox` a plain shape uses, and the export then
 * writes exactly `width` by `height` pixels instead of the frame times a scale.
 *
 * **Checked on 2026-09-28** against each platform's help page where one could
 * be read (LinkedIn, YouTube, Product Hunt, Open Graph) and against Sprout
 * Social (May 2026) and Buffer (March 2026) elsewhere. Platforms change these,
 * so re-check before adding to or changing a number. Where sources disagreed:
 *
 * - LinkedIn's own page gives 1200x627. 627 is odd and H.264 needs even sizes,
 *   so this uses 1200x628, which is LinkedIn's ad size and displays the same.
 *   Bluesky's 1200x675 becomes 1200x676 for the same reason.
 * - Instagram landscape is 1080x566 (1.91:1) in most guides. Sprout gives
 *   1920x1080, which Instagram crops to the same shape anyway.
 * - Safe zones on Meta's vertical formats are Meta's March 2026 percentages
 *   (14% top, 6% each side, 20% bottom on a Story, 35% on a Reel), as pixels.
 *   TikTok's bottom margin grows with a long caption, so its figure is a
 *   minimum. YouTube publishes no figure for Shorts, so that one is the one
 *   most guides agree on.
 * - X's video limit for accounts without Premium is 140 s in every source but
 *   one, which could not be checked.
 */

export type Platform =
  | "instagram"
  | "x"
  | "linkedin"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "threads"
  | "bluesky"
  | "pinterest"
  | "github"
  | "appstore"
  | "googleplay"
  | "chromewebstore"
  | "web";

/** Pixels the platform's own interface covers, at the template's size. */
export interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Template {
  id: string;
  platform: Platform;
  /** Short, since the platform's name sits beside it as a group heading. */
  label: string;
  width: number;
  height: number;
  safe?: SafeArea;
  /** The longest clip the platform takes in this format, in seconds. */
  maxSeconds?: number;
  /** Whether the format can be a swipeable carousel of several slides. */
  carousel?: boolean;
}

export const platforms: { id: Platform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "threads", label: "Threads" },
  { id: "bluesky", label: "Bluesky" },
  { id: "pinterest", label: "Pinterest" },
  { id: "github", label: "GitHub" },
  { id: "appstore", label: "App Store" },
  { id: "googleplay", label: "Google Play" },
  { id: "chromewebstore", label: "Chrome Web Store" },
  { id: "web", label: "Web" },
];

const META_STORY: SafeArea = { top: 269, bottom: 384, left: 65, right: 65 };
const META_REEL: SafeArea = { top: 269, bottom: 672, left: 65, right: 65 };

export const templates: Template[] = [
  { id: "ig-portrait", platform: "instagram", label: "Portrait post", width: 1080, height: 1350, carousel: true },
  { id: "ig-square", platform: "instagram", label: "Square post", width: 1080, height: 1080, carousel: true },
  { id: "ig-grid", platform: "instagram", label: "Grid post (3:4)", width: 1080, height: 1440, carousel: true },
  { id: "ig-landscape", platform: "instagram", label: "Landscape post", width: 1080, height: 566 },
  { id: "ig-story", platform: "instagram", label: "Story", width: 1080, height: 1920, safe: META_STORY, maxSeconds: 60 },
  // Reels upload at up to twenty minutes, past this app's own ten minute cap,
  // so no limit is worth stating.
  { id: "ig-reel", platform: "instagram", label: "Reel", width: 1080, height: 1920, safe: META_REEL },
  { id: "x-post", platform: "x", label: "Post image", width: 1600, height: 900, maxSeconds: 140 },
  { id: "x-square", platform: "x", label: "Square post", width: 1080, height: 1080, maxSeconds: 140 },
  { id: "x-header", platform: "x", label: "Header", width: 1500, height: 500 },
  { id: "li-landscape", platform: "linkedin", label: "Landscape post", width: 1200, height: 628 },
  { id: "li-square", platform: "linkedin", label: "Square post", width: 1080, height: 1080 },
  { id: "li-portrait", platform: "linkedin", label: "Portrait post", width: 1080, height: 1350 },
  { id: "li-banner", platform: "linkedin", label: "Profile banner", width: 1584, height: 396 },
  { id: "fb-portrait", platform: "facebook", label: "Feed post", width: 1080, height: 1350 },
  { id: "fb-story", platform: "facebook", label: "Story", width: 1080, height: 1920, safe: META_STORY },
  { id: "tt-video", platform: "tiktok", label: "Video", width: 1080, height: 1920, safe: { top: 130, bottom: 484, left: 44, right: 140 } },
  { id: "yt-short", platform: "youtube", label: "Short", width: 1080, height: 1920, safe: { top: 180, bottom: 390, left: 60, right: 60 }, maxSeconds: 180 },
  // 1280x720 rather than the 3840x2160 YouTube now recommends: a screenshot
  // enlarged three times over is soft, and 1280 is what most thumbnails are.
  { id: "yt-thumb", platform: "youtube", label: "Thumbnail", width: 1280, height: 720 },
  { id: "yt-banner", platform: "youtube", label: "Channel banner", width: 2560, height: 1440, safe: { top: 508, bottom: 509, left: 507, right: 507 } },
  { id: "th-post", platform: "threads", label: "Post", width: 1080, height: 1350 },
  { id: "bs-square", platform: "bluesky", label: "Square post", width: 1000, height: 1000 },
  // 1200x675 in the guides, a pixel taller here for the same H.264 reason.
  { id: "bs-landscape", platform: "bluesky", label: "Landscape post", width: 1200, height: 676 },
  { id: "pin-standard", platform: "pinterest", label: "Pin", width: 1000, height: 1500 },
  { id: "gh-social", platform: "github", label: "Social preview", width: 1280, height: 640 },
  { id: "as-iphone", platform: "appstore", label: "iPhone screenshot", width: 1320, height: 2868 },
  { id: "as-ipad", platform: "appstore", label: "iPad screenshot", width: 2064, height: 2752 },
  { id: "gp-feature", platform: "googleplay", label: "Feature graphic", width: 1024, height: 500 },
  { id: "gp-phone", platform: "googleplay", label: "Phone screenshot", width: 1080, height: 1920 },
  { id: "cws-screenshot", platform: "chromewebstore", label: "Screenshot", width: 1280, height: 800 },
  { id: "cws-marquee", platform: "chromewebstore", label: "Marquee tile", width: 1400, height: 560 },
  { id: "cws-small", platform: "chromewebstore", label: "Small tile", width: 440, height: 280 },
  { id: "web-og", platform: "web", label: "Link preview", width: 1200, height: 630 },
  { id: "web-dribbble", platform: "web", label: "Dribbble shot", width: 1600, height: 1200 },
  { id: "web-producthunt", platform: "web", label: "Product Hunt gallery", width: 1270, height: 760 },
];

/** No template: the frame is sized by its shape and exported at a scale. */
export const NO_TEMPLATE = "none";

/** Instagram takes up to twenty slides in one carousel. */
export const MAX_SLIDES = 20;

export function getTemplate(id: string): Template | null {
  return templates.find((t) => t.id === id) ?? null;
}

export function platformLabel(platform: Platform): string {
  return platforms.find((p) => p.id === platform)?.label ?? platform;
}

/** "Instagram Story". */
export function templateName(template: Template): string {
  return `${platformLabel(template.platform)} ${template.label}`;
}

/**
 * How many slides a template is split into. One for anything that is not a
 * carousel format, whatever was stored, so a stored count can never split a
 * Story.
 */
export function slideCount(template: Template | null, slides: number): number {
  if (!template?.carousel) return 1;
  return Math.min(Math.max(Math.round(slides) || 1, 1), MAX_SLIDES);
}

/** The whole frame's output size: every slide side by side. */
export function outputFor(
  template: Template,
  slides = 1,
): { width: number; height: number } {
  return { width: template.width * slideCount(template, slides), height: template.height };
}

/** Width over height of the whole frame. */
export function templateRatio(template: Template, slides = 1): number {
  const { width, height } = outputFor(template, slides);
  return width / height;
}

/** Each slide's rectangle in the whole frame's output pixels, left to right. */
export function slideRects(
  template: Template,
  slides: number,
): { x: number; y: number; width: number; height: number }[] {
  return Array.from({ length: slideCount(template, slides) }, (_, i) => ({
    x: i * template.width,
    y: 0,
    width: template.width,
    height: template.height,
  }));
}

/**
 * How much the frame is enlarged to reach the template, or 1 when it is not.
 *
 * The frame is laid out in the picture's own pixels, so a template smaller
 * than the frame shrinks it, which is lossless to the eye. One larger than the
 * frame stretches it, and past a few percent that reads as soft.
 */
export function enlargement(
  frame: { width: number; height: number },
  template: Template,
  slides = 1,
): number {
  if (!frame.width) return 1;
  return Math.max(outputFor(template, slides).width / frame.width, 1);
}
