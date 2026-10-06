import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

import {
  bandOf,
  loadClip,
  loadImage,
  openEditor,
  pickSegmented,
  readAlpha,
  settleArtwork,
} from "./helpers";

/**
 * Moving backgrounds: the flow and warp presets a shader draws.
 *
 * Each is read out of the file the app wrote. The preview's canvas is the one
 * thing read off the page, and only to say the PNG is the frame it shows.
 */

/** Opens the dialog, sets it up, and hands back what Download wrote. */
async function download(
  page: Page,
  pick: string[],
): Promise<{ name: string; bytes: Buffer }> {
  await settleArtwork(page);
  const started = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByRole("button", { name: /Download/ }).first().click();
  for (const id of pick) await pickSegmented(page, id);
  await page.getByRole("button", { name: /^Download/ }).last().click();
  const file = await started;
  return {
    name: file.suggestedFilename(),
    bytes: readFileSync((await file.path())!),
  };
}

/** The colour of an exported MP4 at a point, at each time asked for. */
async function videoPixels(
  page: Page,
  bytes: Buffer,
  fx: number,
  fy: number,
  times: number[],
) {
  return page.evaluate(
    async ({ data, x, y, at }) => {
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(data)], { type: "video/mp4" }),
      );
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      await new Promise((done, fail) => {
        video.onloadedmetadata = () => done(null);
        video.onerror = () => fail(new Error("That export would not load"));
      });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      const colours: number[][] = [];
      for (const time of at) {
        await new Promise((done) => {
          video.onseeked = () => done(null);
          video.currentTime = time;
        });
        ctx.drawImage(video, 0, 0);
        const px = ctx.getImageData(
          Math.floor(canvas.width * x),
          Math.floor(canvas.height * y),
          1,
          1,
        ).data;
        colours.push([px[0], px[1], px[2]]);
      }
      const duration = video.duration;
      URL.revokeObjectURL(url);
      return { duration, colours };
    },
    { data: [...bytes], x: fx, y: fy, at: times },
  );
}

/** The colour of an exported PNG at a point, as fractions of its size. */
function pngPixel(page: Page, bytes: Buffer, fx: number, fy: number) {
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
      return [px[0], px[1], px[2]];
    },
    { data: [...bytes], x: fx, y: fy },
  );
}

/** The live layer's own colour at a point, as fractions of its size. */
function previewPixel(page: Page, fx: number, fy: number) {
  return page.evaluate(
    ({ x, y }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        "[data-backdrop-phase]",
      )!;
      const px = canvas
        .getContext("2d")!
        .getImageData(
          Math.floor(canvas.width * x),
          Math.floor(canvas.height * y),
          1,
          1,
        ).data;
      return [px[0], px[1], px[2]];
    },
    { x: fx, y: fy },
  );
}

const distance = (a: number[], b: number[]) =>
  Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/** Where only the background paints: the top padding, left of centre. */
const PAD = { x: 0.3, y: 0.06 };

test.describe("a moving background", () => {
  test("draws the shader live, not its still stand-in", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await page.getByRole("button", { name: "Daydream" }).click();

    const phase = () =>
      page.evaluate(() =>
        Number(
          document
            .querySelector("[data-backdrop-phase]")
            ?.getAttribute("data-backdrop-phase"),
        ),
      );
    const first = await phase();
    await page.waitForTimeout(500);
    expect(await phase()).not.toBe(first);
  });

  test("held still, it reaches a PNG as the canvas shows it", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await page.getByRole("button", { name: "Daydream" }).click();
    await pickSegmented(page, "background-speed-0");
    // Still offers no loop, so the image's Download is the PNG it always was.
    await page.getByRole("button", { name: /Download/ }).first().click();
    await expect(page.locator('label[for="format-mp4"]')).toHaveCount(0);
    await page.keyboard.press("Escape");

    const shown = await previewPixel(page, PAD.x, PAD.y);
    const file = await download(page, []);
    expect(file.name).toMatch(/\.png$/);
    // The preview draws at screen size and the file at its own, so the two
    // agree within the dithering and a pixel of offset.
    expect(distance(await pngPixel(page, file.bytes, PAD.x, PAD.y), shown)).toBeLessThan(14);

    const alpha = await readAlpha(page, file.bytes);
    // Painted inside the frame's radius and nowhere outside it.
    expect(alpha.corner).toBe(0);
    expect(alpha.padding).toBe(255);
  });

  test("a different moment is a different PNG", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await page.getByRole("button", { name: "Daydream" }).click();
    await pickSegmented(page, "background-speed-0");

    const moment = page.getByRole("slider", { name: "Moment" });
    await moment.focus();
    await moment.press("Home");
    const start = await pngPixel(page, (await download(page, [])).bytes, PAD.x, PAD.y);
    for (let i = 0; i < 4; i++) await moment.press("PageUp");
    const later = await pngPixel(page, (await download(page, [])).bytes, PAD.x, PAD.y);
    expect(distance(start, later)).toBeGreaterThan(10);
  });

  test("an image over it downloads as one seamless loop", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await page.getByRole("button", { name: "Daydream" }).click();
    await pickSegmented(page, "background-speed-2");

    const file = await download(page, ["quality-1", "fps-30"]);
    expect(file.name).toMatch(/\.mp4$/);

    // Fast is a six second loop. The background moves through it, the picture
    // holds, and the last frame leads back into the first.
    const pad = await videoPixels(page, file.bytes, PAD.x, PAD.y, [0, 1.5, 3, 5.95]);
    expect(pad.duration).toBeCloseTo(6, 1);
    expect(distance(pad.colours[0], pad.colours[2])).toBeGreaterThan(10);
    expect(distance(pad.colours[0], pad.colours[3])).toBeLessThan(10);

    const centre = await videoPixels(page, file.bytes, 0.5, 0.5, [0, 3]);
    expect(distance(centre.colours[0], centre.colours[1])).toBeLessThan(6);
  });

  test("moves under a clip in its export", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await page.getByRole("button", { name: "Daydream" }).click();
    await pickSegmented(page, "background-speed-2");

    const file = await download(page, ["quality-1", "fps-30"]);
    const pad = await videoPixels(page, file.bytes, PAD.x, PAD.y, [0.5, 3.5]);
    expect(distance(pad.colours[0], pad.colours[1])).toBeGreaterThan(10);

    // The clip still lands on its own frames over it.
    const centre = await videoPixels(page, file.bytes, 0.5, 0.5, [0.5, 3.5]);
    expect(centre.colours.map((c) => bandOf(c as [number, number, number]))).toEqual([
      "red",
      "yellow",
    ]);
  });
});
