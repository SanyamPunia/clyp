/**
 * Reading a dropped file, and the limits on what is allowed in.
 *
 * An image becomes a data URL, which is what `html-to-image` serializes and
 * what the draft store already held. A video stays a Blob behind an object
 * URL: a thirty second 1080p clip is forty megabytes or more, and base64 adds
 * a third to that for no benefit, since nothing in the video path needs a
 * string.
 */

import { ALL_FORMATS, BlobSource, Input } from "mediabunny";

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
 *
 * Size is the real bound: the file is held as a Blob and written to IndexedDB
 * whole. Duration is not, and used to be 60s only because the export decoded
 * the whole file. It no longer does. `sink.samples(from, to)` seeks to the
 * keyframe at or before the in point, so the decode costs what the trim is
 * rather than what the source is, and a four minute recording cut to ten
 * seconds encodes ten seconds. The cap is now a limit on what one Blob may
 * weigh, and this is roughly ten minutes of 1080p screen capture.
 */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 600;

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

      // The container is read for one boolean, which is what decides whether
      // the export offers to keep the sound. An `<video>` element cannot
      // answer it: `audioTracks` is not in Chrome, and the vendor-prefixed
      // byte counters only report once something has played.
      hasAudioTrack(file).then((hasAudio) => {
        resolve({
          media: {
            kind: "video",
            src,
            name: file.name,
            blob: file,
            duration,
            hasAudio,
          },
          width: videoWidth,
          height: videoHeight,
        });
      });
    };

    probe.preload = "metadata";
    probe.src = src;
  });
}

/**
 * A rough length, for a readout beside the output size.
 *
 * Under ten seconds keeps a decimal, since the difference between three and
 * four seconds of clip matters at that length. Past a minute it becomes a
 * clock, because "180s" is a number a reader has to convert.
 */
export function formatDuration(seconds: number): string {
  const total = Math.round(Math.max(seconds, 0));
  if (total >= 60) {
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${total}s`;
}

/**
 * An exact time, to the millisecond, for the trim's own readouts.
 *
 * Under a minute the minutes are dropped rather than padded to `0:04.720`,
 * which spends two characters saying nothing on the clips this is used for
 * most. `scale` is what decides that, so a readout counting up through a long
 * clip keeps one shape instead of growing a `0:` at the minute mark.
 */
export function formatPrecise(seconds: number, scale = seconds): string {
  const safe = Math.max(seconds, 0);
  if (scale < 60) return `${safe.toFixed(3)}s`;

  const minutes = Math.floor(safe / 60);
  return `${minutes}:${(safe - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

/** Metadata only, so this reads the container's index rather than the file. */
async function hasAudioTrack(file: File): Promise<boolean> {
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(file),
    });
    return (await input.getPrimaryAudioTrack()) !== null;
  } catch {
    // A container this build cannot parse still plays, since the element
    // already probed it. It just cannot be asked about its tracks.
    return false;
  }
}
