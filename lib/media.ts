/**
 * Reading a dropped file, and the limits on what is allowed in.
 *
 * An image becomes a data URL, which is what `html-to-image` serializes and
 * what the draft store already held. A video stays a Blob behind an object
 * URL: a thirty second 1080p clip is forty megabytes or more, and base64 adds
 * a third to that for no benefit, since nothing in the video path needs a
 * string.
 */

import type { Media, MediaKind } from "@/types/screenshot";

const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
];

/**
 * `video/quicktime` is a .mov, which is what macOS screen recording produces
 * and therefore most of what will be dropped here. Whether the browser can
 * decode its codec is a separate question, answered by the probe below rather
 * than by the MIME type.
 */
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export const ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(",");

/**
 * Caps, so a dropped 4K screen recording cannot take the tab down with it.
 * Decoding is frame by frame and encoding is not free, and there is no way to
 * fail gracefully once the memory is gone.
 */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;

export function kindOf(type: string): MediaKind | null {
  if (IMAGE_TYPES.includes(type)) return "image";
  if (VIDEO_TYPES.includes(type)) return "video";
  return null;
}

export interface LoadedMedia {
  media: Media;
  width: number;
  height: number;
}

/**
 * Reads a file and measures it. Rejects with a message meant for a toast.
 *
 * The measurement is not decoration. The canvas sizes itself from it, and for
 * a video it is also the only honest way to find out whether this browser can
 * play the file at all: a `.mov` carrying something exotic passes the MIME
 * check and then fails to load, and the error belongs at the drop rather than
 * at the export.
 */
export function loadMedia(file: File): Promise<LoadedMedia> {
  const kind = kindOf(file.type);
  if (!kind) {
    return Promise.reject(
      new Error("Drop a PNG, JPEG, GIF, WEBP, SVG, BMP, MP4, WEBM, or MOV"),
    );
  }

  return kind === "image" ? loadImage(file) : loadVideo(file);
}

function loadImage(file: File): Promise<LoadedMedia> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("That image could not be read"));
    reader.onload = () => {
      const src = reader.result as string;
      const probe = new Image();

      probe.onerror = () => reject(new Error("That image could not be read"));
      probe.onload = () =>
        resolve({
          media: { kind: "image", src, name: file.name },
          width: probe.naturalWidth,
          height: probe.naturalHeight,
        });
      probe.src = src;
    };

    reader.readAsDataURL(file);
  });
}

function loadVideo(file: File): Promise<LoadedMedia> {
  if (file.size > MAX_VIDEO_BYTES) {
    return Promise.reject(
      new Error(
        `That video is ${Math.round(file.size / 1024 / 1024)} MB. The limit is ${MAX_VIDEO_BYTES / 1024 / 1024} MB`,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const probe = document.createElement("video");

    const fail = (message: string) => {
      URL.revokeObjectURL(src);
      reject(new Error(message));
    };

    probe.onerror = () => fail("This browser cannot play that video");
    probe.onloadedmetadata = () => {
      const { videoWidth, videoHeight, duration } = probe;

      if (!videoWidth || !videoHeight) {
        fail("This browser cannot play that video");
        return;
      }
      if (duration > MAX_VIDEO_SECONDS) {
        fail(
          `That video is ${Math.round(duration)}s. The limit is ${MAX_VIDEO_SECONDS}s`,
        );
        return;
      }

      resolve({
        media: { kind: "video", src, name: file.name, blob: file, duration },
        width: videoWidth,
        height: videoHeight,
      });
    };

    probe.preload = "metadata";
    probe.src = src;
  });
}

/** For a readout beside the output size, so under ten seconds keeps a decimal. */
export function formatDuration(seconds: number): string {
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}
