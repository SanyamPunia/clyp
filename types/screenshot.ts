import type { BackgroundKind } from "@/lib/gradients";
import type {
  BadgePosition,
  CaptionPosition,
  Corners,
  Device,
  WindowChrome,
} from "@/lib/style-options";

export type MediaKind = "image" | "video";

/**
 * A sound file laid over the clip.
 *
 * Three numbers place it, and they are the model a timeline editor uses.
 * `offset` is where the region's left edge sits on the clip's own axis, and
 * `start` and `end` are the slice of the file it plays. Dragging the body
 * moves `offset` alone. Dragging the left edge moves `offset` and `start`
 * together, so the sound stays anchored where it was while the edge comes in.
 */
export interface Soundtrack {
  src: string;
  name: string;
  /** The file, for the export to decode. */
  blob: Blob;
  /** The file's own length, in seconds. */
  duration: number;
  offset: number;
  start: number;
  end: number;
}

/**
 * What the canvas is framing.
 *
 * An image is a data URL, which is what `html-to-image` can serialize and what
 * IndexedDB already held. A video is an object URL over a Blob, and the Blob is
 * kept beside it because the export decodes the original file rather than
 * scraping the playing element.
 */
export interface Media {
  kind: MediaKind;
  src: string;
  /** The dropped file's name, which the export's filename defaults to. */
  name?: string;
  /** Video only. The source file, for the export to decode. */
  blob?: Blob;
  /** Video only, in seconds. */
  duration?: number;
  /** Video only. Whether the source has an audio track worth offering. */
  hasAudio?: boolean;
}

export interface StyleOptions {
  gradientId: string;
  gradientAngle: number;
  padding: number;
  /** A target shape for the whole frame, or `auto` to fit the artwork. */
  aspect: string;
  /**
   * A platform size from `lib/templates.ts`, or `none`. When set it decides
   * the shape in place of `aspect`, and the export writes its exact pixels.
   */
  template: string;
  /** How many carousel slides the frame spans. 1 for anything else. */
  slides: number;
  /** Corner radius in px. */
  outerRadius: number;
  imageRadius: number;
  /** Which of the screenshot's corners the image radius applies to. */
  imageCorners: Corners;
  shadow: string;
  /** What is drawn above the media: nothing, a title bar, or a browser bar. */
  windowChrome: WindowChrome;
  /** The address a browser bar shows. Empty leaves the field blank. */
  windowUrl: string;
  windowNavbarDark: boolean;
  /** A phone or laptop drawn around the media. */
  device: Device;
  /** A line of text beside the artwork. Empty means none. */
  caption: string;
  captionPosition: CaptionPosition;
  /** Caption font size in px. The frame is in media pixels, so this is too. */
  captionSize: number;
  /** Dark text, for a caption over a light background. */
  captionDark: boolean;
  /** A handle shown in a corner of the frame, such as `@clyp`. Empty means none. */
  badge: string;
  badgePosition: BadgePosition;
  /** Badge font size in px. The frame is in media pixels, so this is too. */
  badgeSize: number;
  /** A light pill with dark text, for a pale background. */
  badgeDark: boolean;
  /** Video only. A ring at each click the motion pass found. */
  clickRipples: boolean;
  showNoiseOverlay: boolean;
  /** Grain strength, 0 to 100. */
  noiseIntensity: number;
  /** Which kind of background is showing. `none` is transparent. */
  background: BackgroundKind;
  customGradientFrom: string;
  customGradientTo: string;
  /** The flat colour, for `background: "solid"`. */
  solidColor: string;
  /**
   * How fast a moving background runs, one of `BACKGROUND_SPEEDS` in
   * `lib/shader.ts`. 0 holds it still at `backgroundMoment`.
   */
  backgroundSpeed: number;
  /** The phase a moving background holds at, or starts from, 0 to 1. */
  backgroundMoment: number;
}

export interface ExportOptions {
  quality: number;
  /**
   * Several templates at once, by id, written as PNGs into one ZIP. Absent or
   * empty is one file at the current size.
   */
  sizes?: string[];
  filename?: string;
  /** Video only. Carry the clip's own sound into the export. */
  audio?: boolean;
  /** Video only. Carry a laid soundtrack into the export, mixed with the above. */
  music?: boolean;
  /** Video only. The frame rate ceiling for the output. */
  fps?: number;
}
