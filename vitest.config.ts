import { defineConfig } from "vitest/config";
import { join } from "node:path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [["tests/ui/**", "jsdom"]],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "server-only": join(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
