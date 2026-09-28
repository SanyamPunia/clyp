/**
 * A ZIP archive of already-compressed files, written with no library.
 *
 * Every entry is stored rather than deflated. What goes in here is PNGs, which
 * are deflated already, so a second pass saves nothing and costs time. Stored
 * entries need only a CRC-32 and two headers each, which is short enough to
 * own rather than to take on a dependency for.
 *
 * Names are UTF-8 with bit 11 set, so a filename typed with an accent survives.
 * No ZIP64: an archive over 4 GB is not something this app can produce.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** DOS time and date for a fixed instant, so the same input zips identically. */
const DOS_TIME = 0;
const DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;
const UTF8 = 1 << 11;

export function zip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const records = entries.map((entry) => ({
    ...entry,
    nameBytes: encoder.encode(entry.name),
    crc: crc32(entry.data),
  }));

  const localSize = records.reduce(
    (sum, r) => sum + 30 + r.nameBytes.length + r.data.length,
    0,
  );
  const centralSize = records.reduce((sum, r) => sum + 46 + r.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let at = 0;
  const offsets: number[] = [];

  for (const r of records) {
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 20, true);
    view.setUint16(at + 6, UTF8, true);
    view.setUint16(at + 8, 0, true);
    view.setUint16(at + 10, DOS_TIME, true);
    view.setUint16(at + 12, DOS_DATE, true);
    view.setUint32(at + 14, r.crc, true);
    view.setUint32(at + 18, r.data.length, true);
    view.setUint32(at + 22, r.data.length, true);
    view.setUint16(at + 26, r.nameBytes.length, true);
    view.setUint16(at + 28, 0, true);
    out.set(r.nameBytes, at + 30);
    out.set(r.data, at + 30 + r.nameBytes.length);
    at += 30 + r.nameBytes.length + r.data.length;
  }

  const centralAt = at;
  records.forEach((r, i) => {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true);
    view.setUint16(at + 6, 20, true);
    view.setUint16(at + 8, UTF8, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, DOS_TIME, true);
    view.setUint16(at + 14, DOS_DATE, true);
    view.setUint32(at + 16, r.crc, true);
    view.setUint32(at + 20, r.data.length, true);
    view.setUint32(at + 24, r.data.length, true);
    view.setUint16(at + 28, r.nameBytes.length, true);
    // Extra field, comment, disk number, internal and external attributes.
    view.setUint16(at + 30, 0, true);
    view.setUint16(at + 32, 0, true);
    view.setUint16(at + 34, 0, true);
    view.setUint16(at + 36, 0, true);
    view.setUint32(at + 38, 0, true);
    view.setUint32(at + 42, offsets[i], true);
    out.set(r.nameBytes, at + 46);
    at += 46 + r.nameBytes.length;
  });

  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 4, 0, true);
  view.setUint16(at + 6, 0, true);
  view.setUint16(at + 8, records.length, true);
  view.setUint16(at + 10, records.length, true);
  view.setUint32(at + 12, at - centralAt, true);
  view.setUint32(at + 16, centralAt, true);
  view.setUint16(at + 20, 0, true);

  return out;
}

/**
 * Names that stay unique inside one archive. Two templates can share a size
 * and a slug, and an archive with two entries of one name keeps only one of
 * them when it is opened.
 */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0
      ? `${name.slice(0, dot)}-${count + 1}${name.slice(dot)}`
      : `${name}-${count + 1}`;
  });
}
