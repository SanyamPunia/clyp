import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The pure modules under `lib/` only. Nothing here renders a component or
 * touches a document: the arithmetic is what has no other guard, since every
 * number in it was measured by hand once and nothing re-checks it.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
