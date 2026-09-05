import { defineConfig, devices } from "@playwright/test";

/**
 * The truths that only the running app can tell.
 *
 * The unit specs under `lib/` cover the arithmetic. What they cannot reach is
 * whether the app wired it up: every bug this suite was written after was
 * found by driving the real thing, never by a failing unit test. A background
 * that still showed the old gradient, a cut that could take the whole clip, a
 * Cut button with no way back to it.
 *
 * It is not part of `pnpm check`. It needs a browser and a server, and the
 * gate is meant to be fast enough to run on every change.
 */
const PORT = 3111;

export default defineConfig({
  testDir: "./e2e",
  // The exports encode video. One at a time keeps that honest, and the suite
  // is small enough that the wall-clock cost is worth the determinism.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // The canvas autoplays the clip, and a headless browser will not without
    // this. Every spec pauses it first, but the drop itself has to play.
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  /**
   * A production build, not `next dev`.
   *
   * Three separate failures came from the dev server before this: it holds a
   * single-instance lock per project, so a second run cannot start one and a
   * crashed one leaves the lock behind; it recompiles when a file changes,
   * which aborted a navigation mid-test when an unrelated edit landed; and it
   * costs several hundred megabytes more, which matters on a machine already
   * running an editor.
   *
   * A build is what ships, it does not move under the suite, and the seconds
   * it costs to start are bought back by not chasing any of that.
   */
  webServer: {
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
