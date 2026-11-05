import { build } from "esbuild";
import { fileURLToPath } from "node:url";
for (const [entry, out] of [
  ["aspnet-core/wwwroot/elements.ts", "aspnet-core/wwwroot/elements.js"],
  [
    "blazor-components/wwwroot/messaging.ts",
    "blazor-components/wwwroot/messaging.js",
  ],
])
  await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    outfile: fileURLToPath(new URL(out, import.meta.url)),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
