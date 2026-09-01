import type { Corners } from "@/lib/style-options";

export type MediaKind = "image" | "video";

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
  /** Corner radius in px. */
  outerRadius: number;
  imageRadius: number;
  /** Which of the screenshot's corners the image radius applies to. */
  imageCorners: Corners;
  shadow: string;
  showWindowNavbar: boolean;
  windowNavbarDark: boolean;
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
  /** Video only. Carry the source's audio into the export. */
  audio?: boolean;
}
