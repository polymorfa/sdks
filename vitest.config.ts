import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@polymorfa\/calls$/,
        replacement: fileURLToPath(
          new URL("./packages/calls/src/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/calls\/internal$/,
        replacement: fileURLToPath(
          new URL("./packages/calls/src/internal.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/browser$/,
        replacement: fileURLToPath(
          new URL("./packages/browser/src/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/browser\/internal$/,
        replacement: fileURLToPath(
          new URL("./packages/browser/src/internal.ts", import.meta.url),
        ),
      },
    ],
  },
  test: {
    include: ["packages/*/test/**/*.test.{ts,tsx}"],
    testTimeout: 10_000,
  },
});
