import { describe, expect, it } from "vitest";

import { filenameFor } from "@/lib/download";

describe("filenameFor", () => {
  it("imposes the extension rather than trusting the field", () => {
    // A clip saved as demo.png is a file no player opens.
    expect(filenameFor("demo.png", "mp4")).toBe("demo.mp4");
    expect(filenameFor("shot.mp4", "png")).toBe("shot.png");
    expect(filenameFor("demo", "png")).toBe("demo.png");
  });

  it("takes what the user typed over the source name", () => {
    expect(filenameFor("hero", "png", "onboarding-flow.mp4")).toBe("hero.png");
  });

  it("falls back to the source name when nothing was typed", () => {
    expect(filenameFor(undefined, "mp4", "onboarding-flow.mp4")).toBe(
      "onboarding-flow.mp4",
    );
    expect(filenameFor("", "mp4", "demo.mp4")).toBe("demo.mp4");
    expect(filenameFor("   ", "mp4", "demo.mp4")).toBe("demo.mp4");
  });

  it("falls back to clyp with neither", () => {
    expect(filenameFor(undefined, "png")).toBe("clyp.png");
    expect(filenameFor("", "mp4", "")).toBe("clyp.mp4");
  });

  it("strips only the last extension", () => {
    expect(filenameFor("my.app.demo.mov", "mp4")).toBe("my.app.demo.mp4");
  });

  it("keeps a name a person chose", () => {
    for (const source of [
      "demo.mp4",
      "onboarding-flow.mp4",
      "my recording of the thing.mp4",
      "Q3 launch.mov",
      "video-of-the-new-editor.mp4",
    ]) {
      expect(filenameFor(undefined, "mp4", source)).not.toBe("clyp.mp4");
    }
  });

  it("skips a name a machine wrote", () => {
    for (const source of [
      "Screen Recording 2026-09-01 at 6.28.06 PM.mov",
      "Screenshot 2026-09-01 at 18.28.06.png",
      "screen-recording-1.mp4",
      "CleanShot 2026-09-01 at 18.28.06.png",
      "IMG_4821.mov",
      "PXL_20260901_182806.mp4",
      "DSC01234.png",
      "recording.mp4",
      "Untitled.mov",
      "video 2.mp4",
      "2026-09-01 18.28.06.mov",
      "2026-09-01.png",
      "18.28.06.mp4",
    ]) {
      expect(filenameFor(undefined, "mp4", source)).toBe("clyp.mp4");
    }
  });

  it("lets a typed name win over a machine-written source", () => {
    expect(
      filenameFor("launch", "mp4", "Screen Recording 2026-09-01 at 6.28.06 PM.mov"),
    ).toBe("launch.mp4");
  });
});
