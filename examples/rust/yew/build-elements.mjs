import { build } from "esbuild";
import { fileURLToPath } from "node:url";
await build({
  entryPoints: [fileURLToPath(new URL("frontend/bridge.js", import.meta.url))],
  outfile: fileURLToPath(
    new URL("frontend/public/elements.js", import.meta.url),
  ),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
