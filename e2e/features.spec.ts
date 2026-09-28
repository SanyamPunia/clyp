import { expect, test, type Page } from "@playwright/test";

import {
  bandOf,
  exportFile,
  loadClip,
  loadImage,
  openEditor,
  pause,
  pickSegmented,
  settle,
} from "./helpers";

/**
 * Templates, carousels, several sizes at once, marks, the handle, devices,
 * saved looks and matching the picture. Every size is read out of the file
 * the app wrote, never off the DOM that produced it.
 */

/** The entries of a stored ZIP, which is the only kind the app writes. */
function unzip(buffer: Buffer) {
  const entries: { name: string; data: Buffer }[] = [];
  let at = 0;
  while (buffer.readUInt32LE(at) === 0x04034b50) {
    const size = buffer.readUInt32LE(at + 18);
    const nameLength = buffer.readUInt16LE(at + 26);
    const extra = buffer.readUInt16LE(at + 28);
    const name = buffer.toString("utf8", at + 30, at + 30 + nameLength);
    const start = at + 30 + nameLength + extra;
    entries.push({ name, data: buffer.subarray(start, start + size) });
    at = start + size;
  }
  return entries;
}

/** A PNG's size, from its header. */
const pngSize = (bytes: Buffer) => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

async function pickTemplate(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Platform size" }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

/** The colour of an exported PNG at a point, as fractions of its size. */
async function pixel(page: Page, bytes: Buffer, fx: number, fy: number) {
  return page.evaluate(
    async ({ data, x, y }) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(data)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const px = ctx.getImageData(
        Math.floor(bitmap.width * x),
        Math.floor(bitmap.height * y),
        1,
        1,
      ).data;
      return [px[0], px[1], px[2]] as [number, number, number];
    },
    { data: [...bytes], x: fx, y: fy },
  );
}

/** Where a point of the picture sits in the frame, as fractions of the frame. */
async function inFrame(page: Page, fx: number, fy: number) {
  return page.evaluate(
    ({ x, y }) => {
      const picture = document.querySelector<HTMLElement>("[data-mark-layer]")!;
      const frame = picture.closest<HTMLElement>(".overflow-hidden.w-max")!;
      const p = picture.getBoundingClientRect();
      const f = frame.getBoundingClientRect();
      return {
        x: (p.left + p.width * x - f.left) / f.width,
        y: (p.top + p.height * y - f.top) / f.height,
      };
    },
    { x: fx, y: fy },
  );
}

/** Drags across the picture, from and to fractions of it. */
async function dragOnPicture(
  page: Page,
  from: [number, number],
  to: [number, number],
) {
  const box = await page.locator("[data-mark-layer]").first().boundingBox();
  if (!box) throw new Error("The picture has no box");
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], {
    steps: 6,
  });
  await page.mouse.up();
}

/** The colour at the centre of an exported clip at each time, unrounded. */
async function centres(page: Page, bytes: Buffer, times: number[]) {
  return page.evaluate(
    async ({ data, at }) => {
      const video = document.createElement("video");
      video.muted = true;
      video.src = URL.createObjectURL(
        new Blob([new Uint8Array(data)], { type: "video/mp4" }),
      );
      await new Promise((done) => (video.onloadedmetadata = done));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      const out: [number, number, number][] = [];
      for (const t of at) {
        await new Promise((done) => {
          video.onseeked = done;
          video.currentTime = t;
        });
        ctx.drawImage(video, 0, 0);
        const px = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
        out.push([px[0], px[1], px[2]]);
      }
      return out;
    },
    { data: [...bytes], at: times },
  );
}

/** A 480x300 picture of 4px black and white stripes, which a blur turns grey. */
async function loadStripes(page: Page) {
  const url = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 300;
    const ctx = canvas.getContext("2d")!;
    for (let x = 0; x < 480; x += 4) {
      ctx.fillStyle = (x / 4) % 2 ? "#000000" : "#ffffff";
      ctx.fillRect(x, 0, 4, 300);
    }
    return canvas.toDataURL("image/png");
  });
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "stripes.png",
    mimeType: "image/png",
    buffer: Buffer.from(url.split(",")[1], "base64"),
  });
  await expect(page.getByRole("button", { name: /Download/ })).toBeEnabled();
}

test.describe("templates", () => {
  test("writes a template's exact pixels", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await pickTemplate(page, "Instagram Portrait post");

    expect(pngSize(await exportFile(page))).toEqual({ width: 1080, height: 1350 });
  });

  test("encodes a clip at a template's exact size", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await pickTemplate(page, "Instagram Story");

    const bytes = await exportFile(page);
    const size = await page.evaluate(async (data) => {
      const video = document.createElement("video");
      video.src = URL.createObjectURL(
        new Blob([new Uint8Array(data)], { type: "video/mp4" }),
      );
      await new Promise((done) => (video.onloadedmetadata = done));
      return { width: video.videoWidth, height: video.videoHeight };
    }, [...bytes]);
    expect(size).toEqual({ width: 1080, height: 1920 });
  });

  test("draws the safe zone over the canvas and never into the file", async ({
    page,
  }) => {
    await openEditor(page);
    await loadImage(page);
    await pickTemplate(page, "Instagram Story");
    await expect(page.getByRole("switch", { name: "Safe zone guides" })).toBeChecked();

    // The guides dim everything outside the safe zone. The file's top edge,
    // which is inside the unsafe band, reads the gradient at full strength.
    const bytes = await exportFile(page);
    const top = await pixel(page, bytes, 0.5, 0.02);
    await page.getByRole("switch", { name: "Safe zone guides" }).click();
    const plain = await pixel(page, await exportFile(page), 0.5, 0.02);
    expect(top).toEqual(plain);
  });

  test("splits a carousel into slides that tile the strip", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await pickTemplate(page, "Instagram Portrait post");
    const slides = page.getByRole("slider", { name: "Carousel slides" });
    await slides.focus();
    await slides.press("ArrowRight");
    await slides.press("ArrowRight");

    const entries = unzip(await exportFile(page));
    expect(entries.map((e) => e.name)).toEqual([
      "shot-1.png",
      "shot-2.png",
      "shot-3.png",
    ]);
    for (const entry of entries) {
      expect(pngSize(entry.data)).toEqual({ width: 1080, height: 1350 });
    }
  });

  test("writes several sizes into one ZIP", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await page.getByRole("button", { name: /Download/ }).first().click();
    await pickSegmented(page, "output-sizes");
    await expect(page.getByText("4 selected")).toBeVisible();
    await page.keyboard.press("Escape");

    // `exportFile` opens the dialog again, which keeps the choice.
    const started = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download/ }).first().click();
    await page.getByRole("button", { name: /^Download$/ }).last().click();
    const download = await started;
    expect(download.suggestedFilename()).toBe("shot.zip");

    const { readFileSync } = await import("node:fs");
    const entries = unzip(readFileSync((await download.path())!));
    expect(entries.map((e) => pngSize(e.data))).toEqual([
      { width: 1080, height: 1350 },
      { width: 1080, height: 1920 },
      { width: 1600, height: 900 },
      { width: 1200, height: 628 },
    ]);
    // The canvas is back on its own size once the batch is done.
    await expect(page.getByRole("combobox", { name: "Platform size" })).toHaveText(
      /Any size/,
    );
  });
});

test.describe("marks", () => {
  test("a block covers the picture in the export", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await pickSegmented(page, "mark-tool-block");
    await pickSegmented(page, "mark-color-black");
    await dragOnPicture(page, [0.3, 0.3], [0.7, 0.7]);
    await expect(page.getByRole("button", { name: "Block 1" })).toBeVisible();

    const at = await inFrame(page, 0.5, 0.5);
    expect(await pixel(page, await exportFile(page), at.x, at.y)).toEqual([0, 0, 0]);
  });

  test("a blur greys stripes under it and leaves the rest sharp", async ({
    page,
  }) => {
    await openEditor(page);
    await loadStripes(page);
    await pickSegmented(page, "mark-tool-blur");
    await dragOnPicture(page, [0.3, 0.2], [0.7, 0.8]);

    const inside = await inFrame(page, 0.5, 0.5);
    const outside = await inFrame(page, 0.1, 0.5);
    const bytes = await exportFile(page);
    const [grey] = await pixel(page, bytes, inside.x, inside.y);
    // A row across a few stripes outside the blur still reaches both ends.
    // Single pixels on a stripe's edge are resampled at the export scale.
    const row = await Promise.all(
      [0, 1, 2, 3, 4, 5, 6, 7].map(
        async (i) => (await pixel(page, bytes, outside.x + i * 0.002, outside.y))[0],
      ),
    );
    expect(grey).toBeGreaterThan(60);
    expect(grey).toBeLessThan(200);
    expect(Math.min(...row)).toBeLessThan(20);
    expect(Math.max(...row)).toBeGreaterThan(235);
  });

  test("a block rides every frame of a clip", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await pickSegmented(page, "mark-tool-block");
    await pickSegmented(page, "mark-color-black");
    await dragOnPicture(page, [0.3, 0.3], [0.7, 0.7]);

    const bytes = await exportFile(page);
    const colours = await page.evaluate(async (data) => {
      const video = document.createElement("video");
      video.muted = true;
      video.src = URL.createObjectURL(
        new Blob([new Uint8Array(data)], { type: "video/mp4" }),
      );
      await new Promise((done) => (video.onloadedmetadata = done));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      const out: number[][] = [];
      for (const t of [0.5, 2.5, 4.5]) {
        await new Promise((done) => {
          video.onseeked = done;
          video.currentTime = t;
        });
        ctx.drawImage(video, 0, 0);
        const px = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
        out.push([px[0], px[1], px[2]]);
      }
      return out;
    }, [...bytes]);
    for (const [r, g, b] of colours) expect(r + g + b).toBeLessThan(40);
  });

  test("a blur on a clip encodes and keeps the picture's colour", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);
    await pickSegmented(page, "mark-tool-blur");
    await dragOnPicture(page, [0.3, 0.3], [0.7, 0.7]);

    // Each band is one flat colour, so a blur over it is the same colour.
    // What this proves is that the per-frame blur runs in the encode at all.
    const colours = await centres(page, await exportFile(page), [0.5, 2.5, 4.5]);
    expect(colours.map(bandOf)).toEqual(["red", "blue", "magenta"]);
  });

  test("Delete removes the mark just drawn, and undo brings it back", async ({
    page,
  }) => {
    await openEditor(page);
    await loadImage(page);
    await pickSegmented(page, "mark-tool-box");
    await dragOnPicture(page, [0.1, 0.1], [0.3, 0.3]);
    await settle(page);
    await dragOnPicture(page, [0.5, 0.5], [0.8, 0.8]);
    await settle(page);

    // Selected by being drawn, never focused, and no dialog in the way.
    await page.keyboard.press("Delete");
    await expect(page.getByRole("button", { name: "Box 2" })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // At once, inside the history's settle window: only this mark comes back,
    // and the one drawn before it is still there.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByRole("button", { name: "Box 2" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Box 1" })).toBeVisible();
  });

  test("Backspace removes it too, but not while typing in a field", async ({
    page,
  }) => {
    await openEditor(page);
    await loadImage(page);
    await pickSegmented(page, "mark-tool-text");
    const box = await page.locator("[data-mark-layer]").first().boundingBox();
    await page.mouse.click(box!.x + box!.width * 0.2, box!.y + box!.height * 0.2);

    // The panel's field is the text's own, and Backspace there edits it.
    await page.locator("#mark-text").fill("Hello");
    await page.locator("#mark-text").press("Backspace");
    await expect(page.getByRole("button", { name: "Text: Hell" })).toBeVisible();

    await page.locator("#mark-text").blur();
    await page.keyboard.press("Backspace");
    await expect(page.getByRole("button", { name: /^Text: / })).toHaveCount(0);
  });

  test("the panel's remove still confirms", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await pickSegmented(page, "mark-tool-box");
    await dragOnPicture(page, [0.2, 0.2], [0.5, 0.5]);

    await page.getByRole("button", { name: "Remove this mark" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("button", { name: "Box 1" })).toHaveCount(0);
  });

  test("text is placed with a press and edited in the panel", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await pickSegmented(page, "mark-tool-text");
    const box = await page.locator("[data-mark-layer]").first().boundingBox();
    await page.mouse.click(box!.x + box!.width * 0.2, box!.y + box!.height * 0.2);
    // The caption's field is labelled Text too, so this one goes by its id.
    await page.locator("#mark-text").fill("Click here");
    await expect(page.getByRole("button", { name: "Text: Click here" })).toBeVisible();
  });
});

test.describe("click ripples", () => {
  test("draws a ring at a click into the clip, and nothing after it", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);
    await settle(page);

    // One click at the centre at one second, stored the way a finished
    // motion read is, against the clip the edits record already names.
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((done, fail) => {
        const open = indexedDB.open("clyp", 1);
        open.onsuccess = () => done(open.result);
        open.onerror = () => fail(open.error);
      });
      const store = () => db.transaction("draft", "readwrite").objectStore("draft");
      const edits = await new Promise<{ of: unknown }>((done) => {
        const get = store().get("edits");
        get.onsuccess = () => done(get.result);
      });
      await new Promise((done) => {
        const put = store().put(
          {
            of: edits.of,
            samples: new Float32Array(0),
            clicks: new Float32Array([1, 0.5, 0.5]),
          },
          "motion",
        );
        put.onsuccess = done;
      });
    });
    await page.reload();
    await expect(page.getByRole("slider", { name: "Trim start" })).toBeVisible();
    await pause(page);

    await page.getByRole("switch", { name: "Show each click" }).click();
    // The track came back with the draft, so nothing asks to read it again.
    await expect(page.getByRole("button", { name: "Read the motion" })).toHaveCount(0);

    const [during, after] = await centres(page, await exportFile(page), [1.15, 2.5]);
    // The green second, washed towards white by the ring's fill.
    expect(during[0]).toBeGreaterThan(25);
    expect(bandOf(during)).toBe("green");
    // The blue second, long after the ring has gone.
    expect(after[0]).toBeLessThan(20);
    expect(bandOf(after)).toBe("blue");
  });
});

test.describe("the rest of the frame", () => {
  test("a handle badge is part of the artwork", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await page.getByLabel("Handle", { exact: true }).fill("@clyp");
    const badge = page.getByText("@clyp", { exact: true });
    await expect(badge).toBeVisible();
    expect(
      await badge.evaluate((el) => Boolean(el.closest(".overflow-hidden.w-max"))),
    ).toBe(true);
  });

  test("a phone frame adds its bezel to the export", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    const plain = pngSize(await exportFile(page));
    await pickSegmented(page, "device-phone");
    const framed = pngSize(await exportFile(page));
    expect(framed.width).toBeGreaterThan(plain.width);
    expect(framed.height).toBeGreaterThan(plain.height);
  });

  test("a saved look comes back after a reset", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await page.getByRole("tab", { name: "Solid" }).click();
    await page.getByRole("button", { name: "Save the current look" }).click();
    await page.getByLabel("Name").fill("Flat");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await page.getByRole("button", { name: "Reset the style" }).click();
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Preset" })).toHaveAttribute(
      "data-state",
      "active",
    );

    await page.getByRole("button", { name: "Flat", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Solid" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  test("a defocused background brings its grain, and keeps a chosen one", async ({
    page,
  }) => {
    await openEditor(page);
    await loadImage(page);
    const grain = page.getByRole("switch", { name: "Grain", exact: true });
    await expect(grain).not.toBeChecked();

    await page.getByRole("button", { name: "Poppies" }).click();
    await expect(grain).toBeChecked();
    await expect(page.getByText("70%")).toBeVisible();

    // Grain already on, so a second pick leaves its strength alone.
    const amount = page.getByRole("slider", { name: "Grain amount" });
    await amount.focus();
    await amount.press("ArrowLeft");
    await page.getByRole("button", { name: "Solar Wave" }).click();
    await expect(page.getByText("65%")).toBeVisible();
  });

  test("matching the picture takes its colour", async ({ page }) => {
    await openEditor(page);
    // The fixture is one flat blue.
    await loadImage(page);
    await page.getByRole("tab", { name: "Custom" }).click();
    await page.getByRole("button", { name: "Match the picture" }).click();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const style = JSON.parse(localStorage.getItem("clyp:style") ?? "{}");
          return style.customGradientFrom as string;
        }),
      )
      .toMatch(/^#[0-9a-f]{6}$/);
    const from = await page.evaluate(
      () => JSON.parse(localStorage.getItem("clyp:style") ?? "{}").customGradientFrom,
    );
    const rgb = [1, 3, 5].map((i) => parseInt(from.slice(i, i + 2), 16));
    expect(bandOf(rgb as [number, number, number])).toMatch(/blue|cyan/);
  });
});
