import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/typescript/test/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
