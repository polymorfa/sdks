import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

describe("@polymorfa/browser package", () => {
  it("packs and imports in a clean consumer with no runtime dependencies", () => {
    const build = spawnSync("npm", ["run", "build"], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(build.status, build.stderr).toBe(0);
    const directory = mkdtempSync(join(tmpdir(), "polymorfa-browser-package-"));
    const packed = spawnSync(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", directory],
      {
        cwd: packageRoot,
        encoding: "utf8",
      },
    );
    expect(packed.status, packed.stderr).toBe(0);
    const metadata = JSON.parse(packed.stdout) as Array<{
      readonly filename: string;
      readonly files: Array<{ readonly path: string }>;
    }>;
    const paths = metadata[0]?.files.map(({ path }) => path) ?? [];
    expect(paths).toContain("LICENSE");
    expect(paths).toContain("README.md");
    expect(paths).toContain("dist/index.js");
    expect(
      paths.some((path) => path.includes("/src/") || path.includes("/test/")),
    ).toBe(false);

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
    const consumer = join(directory, "consumer.mjs");
    writeFileSync(
      consumer,
      'import { BrowserMessagingClient, ClientTokenManager } from "@polymorfa/browser"; const token = await new ClientTokenManager(async () => "pmfa_ct_fixture").get(); const client = new BrowserMessagingClient({ session: "support", getClientToken: async () => token }); console.log(token, typeof client.messages.send);',
    );
    const imported = spawnSync(process.execPath, [consumer], {
      cwd: directory,
      encoding: "utf8",
    });
    expect(imported.status, imported.stderr).toBe(0);
    expect(imported.stdout.trim()).toBe("pmfa_ct_fixture function");
    const manifest = JSON.parse(
      readFileSync(
        join(
          directory,
          "node_modules",
          "@polymorfa",
          "browser",
          "package.json",
        ),
        "utf8",
      ),
    ) as { readonly dependencies?: Readonly<Record<string, string>> };
    expect(manifest.dependencies ?? {}).toEqual({});
  }, 30_000);
});
