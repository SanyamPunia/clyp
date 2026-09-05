import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import {
  BANDS,
  CLIP_SECONDS,
  bandOf,
  expectLength,
  exportFile,
  loadClip,
  loadImage,
  loadTrack,
  openEditor,
  pickSegmented,
  pressLane,
  readAlpha,
  readAudio,
  readVideo,
  seek,
} from "./helpers";

/**
 * What the app actually wrote.
 *
 * Every assertion here is about a file, not about the DOM that produced it.
 * The fixture clip is one flat colour a second, so a cut is proved by the
 * colours that survive, and it carries a continuous 440Hz tone, so a join is
 * proved by finding no silence at it.
 */

/** Small padding, so the encode is cheap. Each press takes 4px off. */
async function shrinkPadding(page: import("@playwright/test").Page) {
  const padding = page.getByRole("slider", { name: /Padding/i }).first();
  await padding.focus();
  for (let i = 0; i < 14; i++) await padding.press("ArrowLeft");
}

/** Places a cut of the default length at `at`, deselecting first. */
async function cutAt(page: import("@playwright/test").Page, at: number) {
  await pressLane(page, 0.72);
  await seek(page, at);
  await page.getByRole("button", { name: "Cut at the playhead" }).click();
  await expect(page.getByRole("button", { name: /^Cut, / })).not.toHaveCount(0);
}

test.describe("the exported clip", () => {
  test("is the whole clip when nothing is cut", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await shrinkPadding(page);

    const file = await exportFile(page);
    const { duration, colours } = await readVideo(
      page,
      file,
      BANDS.map((band) => band.at),
    );

    expectLength(duration, CLIP_SECONDS);
    expect(colours).toEqual(BANDS.map((band) => band.name));
  });

  test("drops the cut second and closes the gap", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await shrinkPadding(page);
    await cutAt(page, 2);

    const file = await exportFile(page);
    const { duration, colours } = await readVideo(
      page,
      file,
      [0.5, 1.5, 2.5, 3.5, 4.5],
    );

    // The blue second is gone, and what was at 3s is now at 2s.
    expectLength(duration, 5);
    expect(colours).toEqual(["red", "green", "yellow", "magenta", "cyan"]);
  });

  test("drops two cuts", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await shrinkPadding(page);
    await cutAt(page, 1);
    await cutAt(page, 4);

    const file = await exportFile(page);
    const { duration, colours } = await readVideo(page, file, [0.5, 1.5, 2.5, 3.5]);

    expectLength(duration, 4);
    expect(colours).toEqual(["red", "blue", "yellow", "cyan"]);
  });

  test("carries the clip's own sound across a cut with no silence in it", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);
    await shrinkPadding(page);
    await cutAt(page, 2);

    const file = await exportFile(page);
    const audio = await readAudio(page, file);

    // The tail of one sample is dropped at each join, which is well under a
    // frame. A join that lost more than that shows as a silent window.
    expect(audio.seconds).toBeGreaterThan(4.9);
    expect(audio.windows).toBeGreaterThan(30);
    expect(audio.quiet).toBe(0);
    expect(audio.lowest).toBeGreaterThan(0.02);
  });

  test("plays a laid soundtrack through a cut rather than jumping with it", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);
    await shrinkPadding(page);
    await loadTrack(page);
    await cutAt(page, 1);

    const file = await exportFile(page);
    const audio = await readAudio(page, file);

    // Music laid over a jump cut does not jump: it is scheduled once and runs
    // at its own tempo, so the mix is continuous for the export's length.
    expect(audio.seconds).toBeGreaterThan(4.9);
    expect(audio.quiet).toBe(0);
  });

  test("halves the length at 2x", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await shrinkPadding(page);
    await page.getByRole("radio", { name: "2x", exact: true }).first().click();

    const file = await exportFile(page);
    const { duration } = await readVideo(page, file, [0.5]);
    // No sound of its own past 1x, so this lands exactly.
    expectLength(duration, CLIP_SECONDS / 2);
  });
});

test.describe("a clip's current frame", () => {
  test("downloads as a PNG of the frame the playhead is on", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);
    await shrinkPadding(page);
    // The yellow second. Download offers the clip or this, and Copy has
    // always taken the frame because the clipboard has no MP4 flavour.
    await seek(page, 3.5);

    const started = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: /Download/ }).first().click();
    await pickSegmented(page, "format-png");
    await expect(
      page.getByRole("heading", { name: "Download frame" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Download/ }).last().click();
    const download = await started;

    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const alpha = await readAlpha(page, readFileSync((await download.path())!));
    expect(bandOf(alpha.rgb)).toBe("yellow");
  });

  test("offers the choice only for a clip being downloaded", async ({
    page,
  }) => {
    await openEditor(page);
    await loadImage(page);
    await page.getByRole("button", { name: /Download/ }).first().click();
    // A still has no second thing it could be.
    await expect(page.locator('label[for="format-png"]')).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Download image" }),
    ).toBeVisible();
  });
});

test.describe("the exported still", () => {
  test("keeps its transparency on a transparent background", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await page.getByRole("tab", { name: "None" }).click();

    const alpha = await readAlpha(page, await exportFile(page));

    // Only the artwork is opaque. This is the one the cross-fade broke: the
    // outgoing gradient was left painted under a layer that is not opaque, so
    // the old background reached the file.
    expect(alpha.corner).toBe(0);
    expect(alpha.padding).toBe(0);
    expect(alpha.centre).toBe(255);
  });

  test("is opaque inside the frame on a solid background", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);
    await page.getByRole("tab", { name: "Solid" }).click();

    const alpha = await readAlpha(page, await exportFile(page));

    // Transparent only outside the frame's own radius.
    expect(alpha.corner).toBe(0);
    expect(alpha.padding).toBe(255);
    expect(alpha.centre).toBe(255);
  });

  test("is opaque throughout on a gradient", async ({ page }) => {
    await openEditor(page);
    await loadImage(page);

    const alpha = await readAlpha(page, await exportFile(page));
    expect(alpha.padding).toBe(255);
    expect(alpha.centre).toBe(255);
  });
});
