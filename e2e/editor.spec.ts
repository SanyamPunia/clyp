import { expect, test, type Page } from "@playwright/test";

import {
  CLIP_SECONDS,
  cutLabels,
  keptReadout,
  loadClip,
  loadTrack,
  openEditor,
  pressLane,
  seek,
  settle,
  tabStops,
  zoomLabels,
} from "./helpers";

/**
 * What the editor does, as opposed to what it writes.
 *
 * These are the truths a unit spec cannot reach, and every one of them stands
 * in for a bug that was found by driving the app: a Cut button with no way
 * back to it, a cut that could take the whole clip, a copy that took the wrong
 * selection.
 */

const cutButton = (page: Page) =>
  page.getByRole("button", { name: "Cut at the playhead" });

async function addCut(page: Page, at: number) {
  await seek(page, at);
  await cutButton(page).click();
}

test.describe("cuts", () => {
  test("takes the cut second off the length", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    expect(await keptReadout(page)).toBe("6.000s");

    await addCut(page, 2);
    expect(await cutLabels(page)).toEqual(["Cut, 2.000s to 3.000s"]);
    expect(await keptReadout(page)).toBe("5.000s of 6.000s");
  });

  test("a press on the bare lane puts the selection away", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await addCut(page, 2);

    // The selected cut's controls take the Cut button's slot no longer, but
    // the selection still has to be dismissable, or nothing else can be
    // selected. This is the bug that stopped a second cut being placed.
    await expect(page.getByRole("button", { name: /^Cut, / })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await pressLane(page, 0.72);
    await expect(page.getByRole("button", { name: /^Cut, / })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("a second cut can be placed after the first", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await addCut(page, 1);
    await pressLane(page, 0.72);
    await addCut(page, 4);

    expect(await cutLabels(page)).toEqual([
      "Cut, 1.000s to 2.000s",
      "Cut, 4.000s to 5.000s",
    ]);
    expect(await keptReadout(page)).toBe("4.000s of 6.000s");
  });

  test("cannot be dragged until nothing is left", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await addCut(page, 2);

    const lane = page.locator("div.h-9.cursor-grab").first();
    const box = (await lane.boundingBox())!;
    const y = box.y + box.height / 2;
    const dragTo = async (from: number, to: number) => {
      await page.mouse.move(box.x + box.width * from, y);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(box.x + box.width * (from + (to - from) * (i / 12)), y);
      }
      await page.mouse.up();
    };

    await dragTo(2 / CLIP_SECONDS, -0.4);
    await dragTo(3 / CLIP_SECONDS, 1.4);

    // The edge slides to the limit and stops, leaving exactly the minimum.
    expect(await cutLabels(page)).toEqual(["Cut, 0.000s to 5.800s"]);
    expect(await keptReadout(page)).toBe("0.200s of 6.000s");
  });
});

test.describe("copy and paste", () => {
  test("a zoom keeps its length and its level", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await seek(page, 0.5);
    await page.getByRole("button", { name: "Add a zoom" }).click();
    await page.getByRole("radio", { name: "3x", exact: true }).first().click();
    expect(await zoomLabels(page)).toEqual(["Zoom 3x, 0.500s to 2.500s"]);

    await page.keyboard.press("Meta+c");
    await seek(page, 3.5);
    await page.keyboard.press("Meta+v");

    expect(await zoomLabels(page)).toEqual([
      "Zoom 3x, 0.500s to 2.500s",
      "Zoom 3x, 3.500s to 5.500s",
    ]);
  });

  test("a cut keeps its length", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await addCut(page, 2.2);
    await page.keyboard.press("Meta+c");
    await seek(page, 0.4);
    await page.keyboard.press("Meta+v");

    expect(await cutLabels(page)).toEqual([
      "Cut, 0.400s to 1.400s",
      "Cut, 2.200s to 3.200s",
    ]);
  });

  test("copies the one thing that is selected", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await seek(page, 0.5);
    await page.getByRole("button", { name: "Add a zoom" }).click();
    // Selecting a cut must put the zoom's selection away, or "the selected
    // thing" is ambiguous and the copy takes whichever it checks first.
    await addCut(page, 3);
    await expect(page.getByRole("button", { name: /^Zoom \d/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await page.keyboard.press("Meta+c");
    await seek(page, 5);
    await page.keyboard.press("Meta+v");

    expect(await cutLabels(page)).toHaveLength(2);
    expect(await zoomLabels(page)).toHaveLength(1);
  });
});

test.describe("undo", () => {
  test("walks the edits back and forward in order", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    const undo = page.getByRole("button", { name: /^Undo/ });
    const redo = page.getByRole("button", { name: /^Redo/ });
    const speed = () =>
      page.locator('[aria-label="Playback speed"] [aria-checked="true"]').innerText();

    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();

    await addCut(page, 2);
    // Waited out on purpose. Two edits inside one settle window are one
    // entry, so without this the cut and the speed would come back together.
    await settle(page);
    await expect(undo).toBeEnabled();
    await pressLane(page, 0.72);
    await page.getByRole("radio", { name: "2x", exact: true }).first().click();
    await expect.poll(speed).toBe("2x");
    await settle(page);

    await undo.click();
    await expect.poll(speed).toBe("1x");
    expect(await cutLabels(page)).toHaveLength(1);

    await undo.click();
    expect(await cutLabels(page)).toHaveLength(0);
    await expect(undo).toBeDisabled();

    await redo.click();
    expect(await cutLabels(page)).toHaveLength(1);
    await redo.click();
    await expect.poll(speed).toBe("2x");
    await expect(redo).toBeDisabled();
  });

  test("answers the keyboard too", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await addCut(page, 2);
    await settle(page);
    expect(await cutLabels(page)).toHaveLength(1);

    await page.keyboard.press("Meta+z");
    expect(await cutLabels(page)).toHaveLength(0);
    await page.keyboard.press("Meta+Shift+z");
    expect(await cutLabels(page)).toHaveLength(1);
  });

  test("collapses edits made inside one settle window into one entry", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);
    const undo = page.getByRole("button", { name: /^Undo/ });

    // No wait between them. A drag rewrites the state every frame, and one
    // entry per frame is a history nobody can walk back, so the window is
    // what collapses a drag into the snapshot taken before it began.
    await addCut(page, 2);
    await pressLane(page, 0.72);
    await page.getByRole("radio", { name: "2x", exact: true }).first().click();
    await settle(page);

    await undo.click();
    expect(await cutLabels(page)).toHaveLength(0);
    await expect(
      page.locator('[aria-label="Playback speed"] [aria-checked="true"]'),
    ).toHaveText("1x");
    await expect(undo).toBeDisabled();
  });
});

test.describe("the keyboard", () => {
  test("moves and resizes a zoom", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await seek(page, 1);
    await page.getByRole("button", { name: "Add a zoom" }).click();
    expect(await zoomLabels(page)).toEqual(["Zoom 2x, 1.000s to 3.000s"]);

    const body = page.getByRole("button", { name: /^Zoom \d/ }).first();
    await body.focus();
    // One frame of the export, which is 1/30s.
    await page.keyboard.press("ArrowRight");
    expect(await zoomLabels(page)).toEqual(["Zoom 2x, 1.033s to 3.033s"]);
    await page.keyboard.press("Shift+ArrowRight");
    expect(await zoomLabels(page)).toEqual(["Zoom 2x, 2.033s to 4.033s"]);
    await page.keyboard.press("Shift+ArrowLeft");
    expect(await zoomLabels(page)).toEqual(["Zoom 2x, 1.033s to 3.033s"]);

    // The edges are sliders that carry their value, reachable while selected.
    const end = page.getByRole("slider", { name: "Zoom end" });
    await expect(end).toHaveAttribute("aria-valuetext", "3.033s");
    await end.focus();
    await page.keyboard.press("Shift+ArrowRight");
    expect(await zoomLabels(page)).toEqual(["Zoom 2x, 1.033s to 4.033s"]);
  });

  test("removes through the confirm", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await seek(page, 1);
    await page.getByRole("button", { name: "Add a zoom" }).click();

    await page.getByRole("button", { name: /^Zoom \d/ }).first().focus();
    await page.keyboard.press("Delete");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Remove this zoom?");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await zoomLabels(page)).toHaveLength(1);
  });

  test("walks the background picker with the arrows, one stop a family", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);

    const grids = await page.evaluate(() =>
      [...document.querySelectorAll('[role="group"][aria-label$="backgrounds"]')].map(
        (grid) => ({
          swatches: grid.querySelectorAll("button").length,
          stops: grid.querySelectorAll('button[tabindex="0"]').length,
        }),
      ),
    );
    expect(grids).toHaveLength(4);
    for (const grid of grids) {
      expect(grid.swatches).toBe(16);
      expect(grid.stops).toBe(1);
    }

    const focused = () =>
      page.evaluate(() => document.activeElement?.textContent?.trim());
    await page.locator('[aria-label="Atmosphere backgrounds"] button').first().focus();
    expect(await focused()).toBe("Golden Hour");
    await page.keyboard.press("ArrowRight");
    expect(await focused()).toBe("Afterglow");
    await page.keyboard.press("End");
    expect(await focused()).toBe("Pre-Dawn");
    await page.keyboard.press("Home");
    expect(await focused()).toBe("Golden Hour");
  });

  test("moves and chooses inside a chip pill", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);

    const group = page.locator('[role="radiogroup"][aria-label="Playback speed"]');
    await expect(group.locator('[role="radio"]')).toHaveCount(4);
    await expect(group.locator('[tabindex="0"]')).toHaveCount(1);

    await group.locator('[aria-checked="true"]').focus();
    await page.keyboard.press("ArrowRight");
    await expect(group.locator('[aria-checked="true"]')).toHaveText("1.5x");
    await page.keyboard.press("End");
    await expect(group.locator('[aria-checked="true"]')).toHaveText("3x");
  });

  test("keeps the whole page inside a workable number of tab stops", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);
    // The picker alone was sixty-four of them before the roving grid, a wall
    // between the panel's first control and its second.
    expect(await tabStops(page)).toBeLessThan(60);
  });
});

test.describe("the soundtrack", () => {
  test("is reachable and movable from the keyboard", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await loadTrack(page);

    const region = page.getByRole("slider", { name: /^Soundtrack, / });
    await expect(region).toHaveAttribute("aria-valuenow", "0");

    // A track lands filling the clip, so there is nowhere for it to move
    // until its tail comes in. That is the bound working, not a dead control.
    await region.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(region).toHaveAttribute("aria-valuenow", "0");

    const end = page.getByRole("slider", { name: "Soundtrack end" });
    await end.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(end).toHaveAttribute("aria-valuetext", "4.000s");

    await region.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(region).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("Home");
    await expect(region).toHaveAttribute("aria-valuenow", "0");
  });
});
