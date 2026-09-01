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
