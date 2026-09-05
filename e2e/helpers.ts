import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Download, type Page } from "@playwright/test";

import { SETTLE_MS } from "../components/use-edit-history";

/**
 * Driving the app, and reading back what it wrote.
 *
 * **Exported files are decoded in the browser, not by a command line tool.**
 * An mp4 goes into a `<video>` and a PNG through `createImageBitmap`, both on
 * a blank page, so the suite needs nothing installed beyond the browser it
 * already drives. ffmpeg is for regenerating the fixtures, never for reading
 * an export.
 */

// From the project root, which is where Playwright runs. `import.meta` is not
// available: the specs are loaded as CommonJS, since the package is not typed
// as a module.
export const fixture = (name: string) =>
  join(process.cwd(), "e2e", "fixtures", name);

/** The fixture clip, one flat colour a second. See `fixtures/README.md`. */
export const BANDS = [
  { at: 0.5, name: "red" },
  { at: 1.5, name: "green" },
  { at: 2.5, name: "blue" },
  { at: 3.5, name: "yellow" },
  { at: 4.5, name: "magenta" },
  { at: 5.5, name: "cyan" },
] as const;

export const CLIP_SECONDS = 6;
export const CLIP_FRAMES = 180;

/** Which band a colour is, by its dominant channels. Encoding shifts the exact
 * values by a few units, so they are read as a shape rather than matched. */
export function bandOf([r, g, b]: [number, number, number]): string {
  const high = (v: number) => v > 110;
  const key = `${high(r) ? 1 : 0}${high(g) ? 1 : 0}${high(b) ? 1 : 0}`;
  return (
    {
      "100": "red",
      "010": "green",
      "001": "blue",
      "110": "yellow",
      "101": "magenta",
      "011": "cyan",
    }[key] ?? `other(${r},${g},${b})`
  );
}

export async function openEditor(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose file" })).toBeVisible();
}

/** Drops the clip in and pauses it, which every spec wants. */
export async function loadClip(page: Page, name = "clip.mp4") {
  await page
    .locator('input[type="file"][accept*="video"]')
    .first()
    .setInputFiles(fixture(name));
  await expect(page.getByRole("slider", { name: "Trim start" })).toBeVisible();
  await pause(page);
}

export async function loadImage(page: Page, name = "shot.png") {
  await page.locator('input[type="file"]').first().setInputFiles(fixture(name));
  await expect(page.getByRole("button", { name: /Download/ })).toBeEnabled();
}

export async function loadTrack(page: Page, name = "track.mp3") {
  await page
    .locator('input[type="file"][accept*="audio"]')
    .first()
    .setInputFiles(fixture(name));
  await expect(page.getByRole("slider", { name: /^Soundtrack, / })).toBeVisible();
}

/**
 * Waits out the undo history's settle window.
 *
 * A change becomes an entry only once it has held still, so a drag of any
 * length collapses into one. Two edits made inside one window are therefore
 * one undo, which is the design and not a bug: a spec that wants them
 * separate has to wait, and a spec that wants them coalesced must not.
 */
export const settle = (page: Page) => page.waitForTimeout(SETTLE_MS + 150);

export const pause = (page: Page) =>
  page.evaluate(() => {
    const video = document.querySelector("video");
    if (video) video.pause();
  });

/** Puts the playhead exactly where a spec needs it, with playback stopped. */
export async function seek(page: Page, seconds: number) {
  await page.evaluate((at) => {
    const video = document.querySelector("video");
    if (video) {
      video.pause();
      video.currentTime = at;
    }
  }, seconds);
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector("video")?.currentTime ?? -1),
    )
    .toBeCloseTo(seconds, 1);
}

/**
 * How long an exported clip runs, within the tail its audio adds.
 *
 * `video.duration` is the container's, which is the longest track. AAC frames
 * are 1024 samples, so a carried soundtrack runs up to about 90ms past the
 * last picture, and a player stops at the longer track. That is the right
 * answer and is not worth trimming to the sample, so the assertion allows it
 * rather than the app removing it.
 *
 * A clip past 1x has no sound of its own, so it lands exactly on its length.
 */
export function expectLength(duration: number, seconds: number) {
  expect(duration).toBeGreaterThanOrEqual(seconds - 0.02);
  expect(duration).toBeLessThan(seconds + 0.15);
}

/** The trim bar's own readout, which is the kept length in source seconds. */
export const keptReadout = (page: Page) =>
  page.locator("span:has(> span > span.tabular-nums)").first().innerText();

export const zoomLabels = (page: Page) =>
  page.getByRole("button", { name: /^Zoom \d/ }).evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label") ?? ""),
  );

export const cutLabels = (page: Page) =>
  page.getByRole("button", { name: /^Cut, / }).evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label") ?? ""),
  );

/** A press on the bare lane, which seeks and puts any selection away. */
export async function pressLane(page: Page, fraction: number) {
  const lane = page.locator("div.h-9.cursor-grab").first();
  const box = await lane.boundingBox();
  if (!box) throw new Error("The lane has no box");
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
}

/**
 * Waits out every running animation.
 *
 * The artwork fades in over 420ms after a 40ms delay, and an export fired
 * inside that window bakes the partly-faded picture: invisible on an opaque
 * background, and alpha 253 instead of 255 on a transparent one. A reader
 * cannot open the modal and confirm it that fast, but a spec can, so the wait
 * belongs here rather than the app holding the export back.
 */
export async function settleArtwork(page: Page) {
  await page
    .waitForFunction(
      () => document.getAnimations().every((a) => a.playState !== "running"),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => {
      // Something loops forever. The export is still worth attempting, and
      // whatever it produces is what the assertions will judge.
    });
}

/** Runs an export and hands back what it wrote, as bytes. */
export async function exportFile(page: Page): Promise<Buffer> {
  await settleArtwork(page);

  const started = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByRole("button", { name: /Download/ }).first().click();
  const confirm = page.getByRole("button", { name: /^(Download|Export)/ }).last();
  await expect(confirm).toBeEnabled();
  await confirm.click();

  const download: Download = await started;
  const path = await download.path();
  return readFileSync(path);
}

/**
 * What an exported mp4 contains, read by a `<video>` on a blank page.
 *
 * Its duration, and the colour at the centre of each time asked for. The
 * centre is the picture rather than the styled surround, so a band read there
 * is a band of the clip.
 */
export async function readVideo(
  page: Page,
  bytes: Buffer,
  times: number[],
): Promise<{ duration: number; colours: string[] }> {
  const result = await page.evaluate(
    async ({ data, at }) => {
      const blob = new Blob([new Uint8Array(data)], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
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
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2D context");

      const colours: [number, number, number][] = [];
      for (const time of at) {
        await new Promise((done) => {
          video.onseeked = () => done(null);
          video.currentTime = time;
        });
        ctx.drawImage(video, 0, 0);
        const { data: px } = ctx.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
        );
        colours.push([px[0], px[1], px[2]]);
      }

      const duration = video.duration;
      URL.revokeObjectURL(url);
      return { duration, colours };
    },
    { data: [...bytes], at: times },
  );

  return {
    duration: result.duration,
    colours: result.colours.map((rgb) => bandOf(rgb as [number, number, number])),
  };
}

/**
 * Whether an exported mp4's audio is continuous, read through a
 * `WebAudio` decode: the loudest and quietest windows, and whether any window
 * is effectively silent. A join that dropped samples shows up as a silent one.
 */
export async function readAudio(page: Page, bytes: Buffer) {
  return page.evaluate(async ({ data }) => {
    const ctx = new OfflineAudioContext(1, 1, 8000);
    const buffer = await ctx.decodeAudioData(new Uint8Array(data).buffer);
    const channel = buffer.getChannelData(0);
    const window = Math.round(buffer.sampleRate / 10);

    let quiet = 0;
    let lowest = Infinity;
    let windows = 0;
    for (let i = 0; i + window <= channel.length; i += window) {
      let sum = 0;
      for (let j = i; j < i + window; j++) sum += channel[j] * channel[j];
      const rms = Math.sqrt(sum / window);
      if (rms < 0.02) quiet++;
      if (rms < lowest) lowest = rms;
      windows++;
    }
    return { seconds: buffer.duration, windows, quiet, lowest };
  }, { data: [...bytes] });
}

/** The alpha channel of an exported PNG, at the places that decide it. */
export async function readAlpha(page: Page, bytes: Buffer) {
  return page.evaluate(async ({ data }) => {
    const blob = new Blob([new Uint8Array(data)], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    ctx.drawImage(bitmap, 0, 0);

    const alphaAt = (x: number, y: number) =>
      ctx.getImageData(x, y, 1, 1).data[3];

    return {
      width: bitmap.width,
      height: bitmap.height,
      // Outside the frame's radius, in its padding, and on the picture.
      corner: alphaAt(2, 2),
      padding: alphaAt(Math.floor(bitmap.width / 2), 12),
      centre: alphaAt(
        Math.floor(bitmap.width / 2),
        Math.floor(bitmap.height / 2),
      ),
    };
  }, { data: [...bytes] });
}

/** Every element a Tab press can reach, which is not every button. */
export const tabStops = (page: Page) =>
  page.evaluate(() => {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    return [...document.querySelectorAll(selector)].filter((el) => {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      // A -1 tabindex is reachable by script, never by Tab.
      return el.getAttribute("tabindex") !== "-1";
    }).length;
  });
