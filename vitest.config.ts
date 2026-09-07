import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@polymorfa/calls": fileURLToPath(
        new URL("./packages/calls/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.{ts,tsx}"],
    testTimeout: 10_000,
  },
});
