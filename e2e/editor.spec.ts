import { expect, test, type Page } from "@playwright/test";
import { gradientFamilies, gradientPresets } from "../lib/gradients";

import {
  keptReadout,
  laneX,
  loadClip,
  loadTrack,
  openEditor,
  outputSize,
  pickShape,
  pieceLabels,
  pressLane,
  removeStretch,
  seek,
  settle,
  tabStops,
  zoomLabels,
} from "./helpers";

/**
 * What the editor does, as opposed to what it writes.
 *
 * These are the truths a unit spec cannot reach, and every one of them stands
 * in for a bug that was found by driving the app: a trimmed piece that showed
 * the footage it slid over, a cut that could take the whole clip, a copy that
 * took the wrong selection.
 */


/**
 * Drags a lane control from where it sits to another point on the lane, both
 * in the lane's own seconds. Moved by the distance between them rather than
 * to an absolute x, since the grip's centre is a few pixels inside the edge
 * it moves.
 */
async function dragBy(
  page: Page,
  name: string,
  index: number,
  from: number,
  to: number,
) {
  const box = (await page
    .getByRole("slider", { name, exact: true })
    .nth(index)
    .boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (await laneX(page, to)) - (await laneX(page, from)), y, {
    steps: 12,
  });
  await page.mouse.up();
}

test.describe("pieces", () => {
  test("taking a piece out takes its length off", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    expect(await keptReadout(page)).toBe("6.000s");

    await removeStretch(page, 2, 3);
    expect(await pieceLabels(page)).toEqual([
      "Piece, 0.000s to 2.000s",
      "Piece, 3.000s to 6.000s",
    ]);
    expect(await keptReadout(page)).toBe("5.000s of 6.000s");
  });

  test("a trimmed piece closes the gap and the next piece keeps its footage", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);
    await seek(page, 3);
    await page.keyboard.press("s");

    // The first piece's end comes in from 3s to 1s. The second piece moves
    // up to meet it and still opens on its own third second. This is the bug
    // where it opened on whatever footage it had slid over.
    await dragBy(page, "Piece end", 0, 3, 1);
    expect(await pieceLabels(page)).toEqual([
      "Piece, 0.000s to 1.000s",
      "Piece, 3.000s to 6.000s",
    ]);
    expect(await keptReadout(page)).toBe("4.000s of 6.000s");

    const second = (await page
      .getByRole("button", { name: /^Piece, 3\.000/ })
      .boundingBox())!;
    expect(Math.abs(second.x - (await laneX(page, 1)))).toBeLessThan(4);
  });

  test("an end drags back out as far as the file goes", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await removeStretch(page, 2, 3);

    // The first piece ends at 2s. Its end drags out two seconds, back over
    // the footage that was taken out and on into what the next piece also
    // shows, since every piece is its own reference to the file.
    await dragBy(page, "Piece end", 0, 2, 4);
    expect(await pieceLabels(page)).toEqual([
      "Piece, 0.000s to 4.000s",
      "Piece, 3.000s to 6.000s",
    ]);
    expect(await keptReadout(page)).toBe("7.000s");

    // And no further than the file's own end.
    await dragBy(page, "Piece end", 0, 4, 9);
    expect(await pieceLabels(page)).toEqual([
      "Piece, 0.000s to 6.000s",
      "Piece, 3.000s to 6.000s",
    ]);
  });

  test("a start edge moves alone, and the pieces close up when it is let go", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);
    await seek(page, 3);
    await page.keyboard.press("s");

    // The second piece's start comes in from 3s to 4s. While it is held, its
    // end stays where it was and a gap opens in front of it.
    const piece = page.getByRole("button", { name: /^Piece, 3\.000/ });
    const before = (await piece.boundingBox())!;
    const edge = (await page
      .getByRole("slider", { name: "Piece start", exact: true })
      .nth(1)
      .boundingBox())!;
    const y = edge.y + edge.height / 2;
    const x = edge.x + edge.width / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (await laneX(page, 4)) - (await laneX(page, 3)), y, {
      steps: 12,
    });
    const held = (await page.getByRole("button", { name: /^Piece, 4\.000/ }).boundingBox())!;
    expect(Math.abs(held.x + held.width - (before.x + before.width))).toBeLessThan(3);
    expect(held.x - before.x).toBeGreaterThan(20);

    await page.mouse.up();
    await expect
      .poll(async () => {
        const box = (await page
          .getByRole("button", { name: /^Piece, 4\.000/ })
          .boundingBox())!;
        return Math.round(box.x - (await laneX(page, 3)));
      })
      .toBe(0);
    expect(await keptReadout(page)).toBe("5.000s of 6.000s");
  });

  test("a piece is dragged to another place in the order", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await seek(page, 2);
    await page.keyboard.press("s");

    // [0, 2] then [2, 6]. The first is picked up and dropped past the
    // middle of the second.
    const piece = (await page.getByRole("button", { name: /^Piece, 0\.000/ }).boundingBox())!;
    const y = piece.y + piece.height / 2;
    await page.mouse.move(piece.x + piece.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(await laneX(page, 5.5), y, { steps: 12 });
    await page.mouse.up();

    const order = await page
      .getByRole("button", { name: /^Piece, / })
      .evaluateAll((els) =>
        els
          .map((el) => ({
            label: el.getAttribute("aria-label") ?? "",
            left: el.getBoundingClientRect().left,
          }))
          .sort((a, b) => a.left - b.left)
          .map((el) => el.label),
      );
    expect(order).toEqual(["Piece, 2.000s to 6.000s", "Piece, 0.000s to 2.000s"]);
    expect(await keptReadout(page)).toBe("6.000s");
    // The playhead stays on its footage, the source's second second, which
    // now opens the clip. It went to the clip's end when the bar tracked the
    // piece by its place in the order.
    await expect(page.getByRole("slider", { name: "Playhead" })).toHaveAttribute(
      "aria-valuetext",
      "0.000s",
    );
  });

  test("the ruler holds still while the first piece's start is dragged", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);
    await seek(page, 3);
    await page.keyboard.press("s");

    // The ruler's zero and the first piece's end, before anything moves.
    const zero = page.locator("[data-timeline] span", { hasText: /^0s$/ }).first();
    const zeroBefore = (await zero.boundingBox())!;
    const first = page.getByRole("button", { name: /^Piece, 0\.000/ });
    const before = (await first.boundingBox())!;

    const edge = (await page
      .getByRole("slider", { name: "Piece start", exact: true })
      .first()
      .boundingBox())!;
    const x = edge.x + edge.width / 2;
    const y = edge.y + edge.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (await laneX(page, 1)) - (await laneX(page, 0)), y, {
      steps: 12,
    });

    // Held: the start is under the pointer, the end has not moved, the ruler
    // has not moved, and the bubble names the length the piece now has.
    const held = (await page.getByRole("button", { name: /^Piece, 1\.000/ }).boundingBox())!;
    expect(Math.abs(held.x + held.width - (before.x + before.width))).toBeLessThan(3);
    expect((await zero.boundingBox())!.x).toBeCloseTo(zeroBefore.x, 0);
    // The piece's own corner says it too, so the bubble is the later one.
    await expect(
      page.locator("[data-timeline] span", { hasText: /^2\.0s$/ }),
    ).toHaveCount(2);

    // Let go: the piece goes back to the timeline's start.
    await page.mouse.up();
    await expect
      .poll(async () => {
        const box = (await page
          .getByRole("button", { name: /^Piece, 1\.000/ })
          .boundingBox())!;
        return Math.round(box.x - (await laneX(page, 0)));
      })
      .toBe(0);
    expect((await zero.boundingBox())!.x).toBeCloseTo(zeroBefore.x, 0);
  });

  test("a piece is copied and pasted right after itself", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await seek(page, 2);
    await page.keyboard.press("s");
    await page.getByRole("button", { name: /^Piece, 0\.000/ }).click();

    await page.keyboard.press("Meta+c");
    await page.keyboard.press("Meta+v");
    const order = await page
      .getByRole("button", { name: /^Piece, / })
      .evaluateAll((els) =>
        els
          .map((el) => ({
            label: el.getAttribute("aria-label") ?? "",
            left: el.getBoundingClientRect().left,
          }))
          .sort((a, b) => a.left - b.left)
          .map((el) => el.label),
      );
    expect(order).toEqual([
      "Piece, 0.000s to 2.000s",
      "Piece, 0.000s to 2.000s",
      "Piece, 2.000s to 6.000s",
    ]);
    expect(await keptReadout(page)).toBe("8.000s");
  });

  test("the timeline zooms with Cmd and the wheel, and the slider follows", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);
    const zoom = page.getByRole("slider", { name: "Timeline zoom" });
    const lane = page.locator('[data-lane="video"]').first();
    const before = Number(await zoom.getAttribute("aria-valuenow"));
    const width = (await lane.boundingBox())!.width;

    const box = (await lane.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + box.height / 2);
    await page.keyboard.down("Meta");
    await page.mouse.wheel(0, -400);
    await page.keyboard.up("Meta");

    await expect
      .poll(async () => Number(await zoom.getAttribute("aria-valuenow")))
      .toBeGreaterThan(before);
    expect((await lane.boundingBox())!.width).toBeGreaterThan(width);
  });

  test("the clip's own edges trim it and stop at the shortest", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);

    await dragBy(page, "Clip start", 0, 0, 7);
    await dragBy(page, "Clip end", 0, 6, -1);
    expect(await keptReadout(page)).toBe("0.200s of 6.000s");
  });

  test("a press on the bare rail puts the selection away", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await removeStretch(page, 2, 3);

    const piece = page.getByRole("button", { name: /^Piece, 0\.000/ });
    await piece.click();
    await expect(piece).toHaveAttribute("aria-pressed", "true");
    // The pieces end at 5s, so 9s on the timeline is bare track.
    await pressLane(page, 9);
    await expect(piece).toHaveAttribute("aria-pressed", "false");
  });

  test("a second stretch can be taken out after the first", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await removeStretch(page, 1, 2);
    await removeStretch(page, 4, 5);
    expect(await pieceLabels(page)).toEqual([
      "Piece, 0.000s to 1.000s",
      "Piece, 2.000s to 4.000s",
      "Piece, 5.000s to 6.000s",
    ]);
    expect(await keptReadout(page)).toBe("4.000s of 6.000s");
  });

  test("offers one cutting tool", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await expect(
      page.getByRole("button", { name: /^Split at the playhead/ }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /^Cut at the playhead/ }),
    ).toHaveCount(0);
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

  test("copies the one thing that is selected", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await seek(page, 0.5);
    await page.getByRole("button", { name: "Add a zoom" }).click();
    // Selecting a piece must put the zoom's selection away, or "the selected
    // thing" is ambiguous and the copy takes the zoom anyway.
    await seek(page, 3);
    await page.keyboard.press("s");
    await expect(page.getByRole("button", { name: /^Zoom \d/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await page.keyboard.press("Meta+c");
    await seek(page, 5);
    await page.keyboard.press("Meta+v");
    expect(await zoomLabels(page)).toHaveLength(1);
  });
});

/** Takes a second off the clip's end, from the keyboard. One edit. */
async function trimASecond(page: Page) {
  const end = page.getByRole("slider", { name: "Clip end", exact: true });
  await end.focus();
  await end.press("Shift+ArrowLeft");
}

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

    await trimASecond(page);
    // Waited out on purpose. Two edits inside one settle window are one
    // entry, so without this the trim and the speed would come back together.
    await settle(page);
    await expect(undo).toBeEnabled();
    await page.getByRole("radio", { name: "2x", exact: true }).first().click();
    await expect.poll(speed).toBe("2x");
    await settle(page);

    await undo.click();
    await expect.poll(speed).toBe("1x");
    expect(await keptReadout(page)).toBe("5.000s of 6.000s");

    await undo.click();
    expect(await keptReadout(page)).toBe("6.000s");
    await expect(undo).toBeDisabled();

    await redo.click();
    expect(await keptReadout(page)).toBe("5.000s of 6.000s");
    await redo.click();
    await expect.poll(speed).toBe("2x");
    await expect(redo).toBeDisabled();
  });

  test("answers the keyboard too", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);
    await trimASecond(page);
    await settle(page);
    expect(await keptReadout(page)).toBe("5.000s of 6.000s");

    await page.keyboard.press("Meta+z");
    expect(await keptReadout(page)).toBe("6.000s");
    await page.keyboard.press("Meta+Shift+z");
    expect(await keptReadout(page)).toBe("5.000s of 6.000s");
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
    await trimASecond(page);
    await page.getByRole("radio", { name: "2x", exact: true }).first().click();
    await settle(page);

    await undo.click();
    expect(await keptReadout(page)).toBe("6.000s");
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
    // From the registry, so a family added later is counted rather than
    // breaking the spec: the first four hold thirty-two, the scenes sixteen.
    expect(grids).toHaveLength(gradientFamilies.length);
    grids.forEach((grid, i) => {
      expect(grid.swatches).toBe(
        gradientPresets.filter((p) => p.family === gradientFamilies[i].id).length,
      );
      expect(grid.stops).toBe(1);
    });

    const focused = () =>
      page.evaluate(() => document.activeElement?.textContent?.trim());
    await page.locator('[aria-label="Atmosphere backgrounds"] button').first().focus();
    expect(await focused()).toBe("Golden Hour");
    await page.keyboard.press("ArrowRight");
    expect(await focused()).toBe("Afterglow");
    // The arrows stop at the fold: a swatch behind a closed one cannot take
    // focus, so walking onto it would look like the keys dying.
    await page.keyboard.press("End");
    expect(await focused()).toBe("Tidal");
    await page.keyboard.press("Home");
    expect(await focused()).toBe("Golden Hour");

    await page.getByRole("button", { name: /^Atmosphere/ }).click();
    await page.locator('[aria-label="Atmosphere backgrounds"] button').first().focus();
    await page.keyboard.press("End");
    expect(await focused()).toBe("Ionosphere");
  });

  test("shows one row of a family and folds the rest", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);

    const trigger = page.getByRole("button", { name: /^Atmosphere/ });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    const shape = () =>
      page.evaluate(() => {
        const grid = document.querySelector(
          '[aria-label="Atmosphere backgrounds"]',
        )!;
        const all = [...grid.querySelectorAll("button")];
        const shown = all.filter((b) => !b.closest("[inert]"));
        const box = (b: Element) => b.getBoundingClientRect();
        return {
          shown: shown.length,
          rows: new Set(shown.map((b) => Math.round(box(b).top))).size,
          // Both grids have to line up column for column, or the fold reads as
          // a second picker rather than more of the same one.
          columns: new Set(all.map((b) => Math.round(box(b).left))).size,
        };
      });

    expect(await shape()).toEqual({ shown: 8, rows: 1, columns: 8 });

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(await shape()).toEqual({ shown: 32, rows: 4, columns: 8 });

    // A folded swatch is a real choice, and the section names what it picked.
    await page.getByRole("button", { name: "Ionosphere" }).click();
    await expect(
      page.getByText("Ionosphere", { exact: true }).first(),
    ).toBeVisible();
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
    // between the panel's first control and its second. Each panel section's
    // header is a stop of its own since they fold, which a reader can use to
    // take the rest of a section out of the walk. Each background family is
    // two, its header and its one swatch stop. Measured at 83 with eleven
    // families, so the bound leaves room for about three more.
    expect(await tabStops(page)).toBeLessThan(90);
  });
});

test.describe("the style panel", () => {
  test("resets every control, and only when there is something to reset", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);

    const reset = page.getByRole("button", { name: "Reset the style" });
    // Nothing to undo yet, so it is not an action.
    await expect(reset).toBeDisabled();

    await page.getByRole("tab", { name: "Solid" }).click();
    await expect(reset).toBeEnabled();

    // Confirmed first: undo covers the clip's edits and not the style, so
    // this is the one panel action with nothing behind it.
    await reset.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Reset the style?");
    await dialog.getByRole("button", { name: "Reset" }).click();

    await expect(reset).toBeDisabled();
    await expect(page.getByRole("tab", { name: "Presets" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("offers eight frame shapes and applies the one picked", async ({
    page,
  }) => {
    await openEditor(page);
    await loadClip(page);

    await expect(page.locator('label[for^="aspect-"]')).toHaveCount(8);

    // A square target grows the short axis, so the output is square.
    await pickShape(page, "1:1");
    await page.getByRole("button", { name: /Download/ }).first().click();
    const { width, height } = await outputSize(page);
    expect(width).toBe(height);
  });

  test("the link-preview shape is wider than it is tall", async ({ page }) => {
    await openEditor(page);
    await loadClip(page);

    await pickShape(page, "1.91:1");
    await page.getByRole("button", { name: /Download/ }).first().click();
    const { width, height } = await outputSize(page);
    // A decimal ratio, which is the first one the parser has had to take.
    expect(width / height).toBeCloseTo(1.91, 1);
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
