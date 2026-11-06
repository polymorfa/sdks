import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@polymorfa\/sdk$/,
        replacement: fileURLToPath(
          new URL("./packages/typescript/src/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/sdk\/calls$/,
        replacement: fileURLToPath(
          new URL("./packages/calls/src/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/sdk\/calls\/internal$/,
        replacement: fileURLToPath(
          new URL("./packages/calls/src/internal.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/ui-kit$/,
        replacement: fileURLToPath(
          new URL("./packages/ui-kit/src/browser/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/ui-kit\/internal$/,
        replacement: fileURLToPath(
          new URL("./packages/ui-kit/src/browser/internal.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/ui-kit\/react$/,
        replacement: fileURLToPath(
          new URL("./packages/ui-kit/src/react/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/ui-kit\/web-components$/,
        replacement: fileURLToPath(
          new URL(
            "./packages/ui-kit/src/web-components/index.ts",
            import.meta.url,
          ),
        ),
      },
      {
        find: /^@polymorfa\/ui-kit\/web-components\/chat$/,
        replacement: fileURLToPath(
          new URL(
            "./packages/ui-kit/src/web-components/chat.ts",
            import.meta.url,
          ),
        ),
      },
      {
        find: /^@polymorfa\/ui-kit\/web-components\/templates$/,
        replacement: fileURLToPath(
          new URL(
            "./packages/ui-kit/src/web-components/templates.ts",
            import.meta.url,
          ),
        ),
      },
      {
        find: /^@polymorfa\/ui-kit\/web-components\/calls$/,
        replacement: fileURLToPath(
          new URL(
            "./packages/ui-kit/src/web-components/calls.ts",
            import.meta.url,
          ),
        ),
      },
      {
        find: /^@polymorfa\/ui-kit\/appearance$/,
        replacement: fileURLToPath(
          new URL("./packages/ui-kit/src/appearance/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/ui-kit\/store$/,
        replacement: fileURLToPath(
          new URL("./packages/ui-kit/src/store/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/ui-kit\/store\/react$/,
        replacement: fileURLToPath(
          new URL("./packages/ui-kit/src/store/react.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/ui-kit\/devtools$/,
        replacement: fileURLToPath(
          new URL("./packages/ui-kit/src/devtools/index.ts", import.meta.url),
        ),
      },
      {
        find: /^@polymorfa\/ui-kit\/devtools\/production$/,
        replacement: fileURLToPath(
          new URL(
            "./packages/ui-kit/src/devtools/production.ts",
            import.meta.url,
          ),
        ),
      },
    ],
  },
  test: {
    include: ["packages/*/test/**/*.test.{ts,tsx}"],
    testTimeout: 10_000,
  },
});
