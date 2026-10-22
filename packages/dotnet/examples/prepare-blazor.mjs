import { cpSync, mkdirSync } from "node:fs";
const target = new URL("aspnet-core/wwwroot/blazor/", import.meta.url);
mkdirSync(target, { recursive: true });
cpSync(new URL("blazor-wasm/bin/served/wwwroot/", import.meta.url), target, {
  recursive: true,
});
