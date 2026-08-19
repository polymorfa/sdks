import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../../../", import.meta.url).pathname;

describe("npm package", () => {
  it("packs and imports in a clean consumer without runtime dependencies", () => {
    const build = spawnSync("npm", ["run", "build"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    expect(build.status, build.stderr).toBe(0);

    const directory = mkdtempSync(join(tmpdir(), "polymorfa-package-"));
    const packed = spawnSync(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", directory],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    expect(packed.status, packed.stderr).toBe(0);
    const metadata = JSON.parse(packed.stdout) as Array<{
      readonly filename: string;
      readonly files: Array<{ readonly path: string }>;
    }>;
    const paths = metadata[0]?.files.map(({ path }) => path) ?? [];
    expect(paths).toContain("LICENSE");
    expect(paths).toContain("README.md");
    expect(paths).toContain("packages/typescript/README.md");
    expect(paths).toContain("packages/typescript/dist/index.js");
    expect(
      paths.some((path) => path.includes("/src/") || path.includes("/test/")),
    ).toBe(false);

    const consumer = join(directory, "consumer.mjs");
    const initialize = spawnSync("npm", ["init", "-y"], {
      cwd: directory,
      encoding: "utf8",
    });
    expect(initialize.status, initialize.stderr).toBe(0);
    const tarball = join(directory, metadata[0]?.filename ?? "missing.tgz");
    const install = spawnSync("npm", ["install", "--ignore-scripts", tarball], {
      cwd: directory,
      encoding: "utf8",
    });
    expect(install.status, install.stderr).toBe(0);
    writeFileSync(
      consumer,
      [
        'import { MessagingClient, PlatformClient, SDK_VERSION } from "@polymorfa/sdk";',
        'const messaging = new MessagingClient({ credential: { type: "apiKey", value: "pmfa_fixture" } });',
        'const platform = new PlatformClient({ apiKey: "pmfa_fixture" });',
        "console.log(JSON.stringify({ version: SDK_VERSION, messaging: !!messaging.raw, platform: !!platform.raw }));",
      ].join("\n"),
    );
    const imported = spawnSync(process.execPath, [consumer], {
      cwd: directory,
      encoding: "utf8",
    });
    expect(imported.status, imported.stderr).toBe(0);
    expect(JSON.parse(imported.stdout)).toEqual({
      version: "0.1.0-dev.0",
      messaging: true,
      platform: true,
    });

    const installedManifest = JSON.parse(
      readFileSync(
        join(directory, "node_modules", "@polymorfa", "sdk", "package.json"),
        "utf8",
      ),
    ) as { readonly dependencies?: Readonly<Record<string, string>> };
    expect(installedManifest.dependencies ?? {}).toEqual({});
  }, 30_000);
});
