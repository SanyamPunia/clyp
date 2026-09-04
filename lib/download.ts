/**
 * One download path for both exports.
 *
 * A data URL goes straight on the anchor. A Blob needs an object URL, and an
 * object URL that is never revoked holds its Blob for the life of the
 * document, which for a forty megabyte clip is worth releasing.
 */
export function download(href: string, filename: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = href;
  link.click();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  download(url, filename);
  URL.revokeObjectURL(url);
}

/**
 * Names an export.
 *
 * What the user typed wins, then the dropped file's own name, then `clyp`. The
 * extension is imposed rather than trusted from the field, since a clip saved
 * as `demo.png` is a file no player opens.
 */
export function filenameFor(
  typed: string | undefined,
  extension: "png" | "mp4",
  source?: string,
): string {
  const base = (value: string) => value.trim().replace(/\.[^./\\]+$/, "");
  const given = base(typed ?? "");
  const from = base(source ?? "");

  return `${given || (machineNamed(from) ? "" : from) || "clyp"}.${extension}`;
}

/**
 * Whether a filename was written by a machine rather than by a person.
 *
 * The source name is the right default for a file someone named deliberately
 * and the wrong one for whatever the OS called a capture. macOS hands over
 * `Screen Recording 2026-09-01 at 6.28.06 PM`, which is 41 characters of
 * bookkeeping on the artifact the user is about to post. `clyp` beats it.
 */
function machineNamed(name: string): boolean {
  return [
    /^screen[\s_-]?(recording|shot)\b/i,
    /^cleanshot\b/i,
    // Camera-roll numbering, which is not always one run of digits: a Pixel
    // writes `PXL_20260901_182806`, a date and a time either side of a
    // separator.
    /^(img|vid|mov|dsc|pxl)[\s_-]?\d[\d\s_-]*$/i,
    /^(movie|video|recording|capture|untitled)[\s_-]?\d*$/i,
    // A bare date, a timestamp, or anything opening with an ISO date.
    /^[\d\s._:-]+$/,
    /^\d{4}-\d{2}-\d{2}/,
  ].some((pattern) => pattern.test(name));
}
