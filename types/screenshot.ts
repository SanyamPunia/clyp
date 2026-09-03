import type {
  CaptionPosition,
  Corners,
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

/** A clip's in and out points, in seconds. */
export interface Trim {
  start: number;
  end: number;
}

export interface StyleOptions {
  gradientId: string;
  gradientAngle: number;
  padding: number;
  /** A target shape for the whole frame, or `auto` to fit the artwork. */
  aspect: string;
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
  /** A line of text beside the artwork. Empty means none. */
  caption: string;
  captionPosition: CaptionPosition;
  /** Caption font size in px. The frame is in media pixels, so this is too. */
  captionSize: number;
  /** Dark text, for a caption over a light background. */
  captionDark: boolean;
  showNoiseOverlay: boolean;
  /** Grain strength, 0 to 100. */
  noiseIntensity: number;
  useCustomGradient: boolean;
  customGradientFrom: string;
  customGradientTo: string;
}

export interface ExportOptions {
  quality: number;
  filename?: string;
  /** Video only. Carry the clip's own sound into the export. */
  audio?: boolean;
  /** Video only. Carry a laid soundtrack into the export, mixed with the above. */
  music?: boolean;
  /** Video only. The frame rate ceiling for the output. */
  fps?: number;
}
