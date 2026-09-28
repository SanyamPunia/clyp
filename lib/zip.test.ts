import { describe, expect, it } from "vitest";

import { crc32, uniqueNames, zip } from "@/lib/zip";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for nothing", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("zip", () => {
  const archive = zip([
    { name: "a.png", data: bytes("first") },
    { name: "slide-2.png", data: bytes("second file") },
  ]);
  const view = new DataView(archive.buffer);

  it("opens with a local header and closes with the end record", () => {
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(archive.length - 22, true)).toBe(0x06054b50);
  });

  it("counts its entries in the end record", () => {
    expect(view.getUint16(archive.length - 12, true)).toBe(2);
    expect(view.getUint16(archive.length - 14, true)).toBe(2);
  });

  it("points the end record at the central directory", () => {
    const centralAt = view.getUint32(archive.length - 6, true);
    expect(view.getUint32(centralAt, true)).toBe(0x02014b50);
  });

  it("stores each file as it is, with its CRC", () => {
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint32(14, true)).toBe(crc32(bytes("first")));
    expect(view.getUint32(18, true)).toBe(5);
    const name = new TextDecoder().decode(archive.subarray(30, 35));
    expect(name).toBe("a.png");
    expect(new TextDecoder().decode(archive.subarray(35, 40))).toBe("first");
  });

  it("is the same bytes for the same input", () => {
    const again = zip([
      { name: "a.png", data: bytes("first") },
      { name: "slide-2.png", data: bytes("second file") },
    ]);
    expect(again).toEqual(archive);
  });
});

describe("uniqueNames", () => {
  it("leaves distinct names alone", () => {
    expect(uniqueNames(["a.png", "b.png"])).toEqual(["a.png", "b.png"]);
  });

  it("numbers a repeat before its extension", () => {
    expect(uniqueNames(["a.png", "a.png", "a.png"])).toEqual([
      "a.png",
      "a-2.png",
      "a-3.png",
    ]);
  });
});
