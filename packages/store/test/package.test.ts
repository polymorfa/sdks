import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

describe("@polymorfa/store package", () => {
  it("packs only build output and imports in a clean consumer", () => {
    const build = spawnSync("npm", ["run", "build"], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const directory = mkdtempSync(join(tmpdir(), "polymorfa-store-package-"));
    const packed = spawnSync(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", directory],
      { cwd: packageRoot, encoding: "utf8" },
    );
    expect(packed.status, packed.stderr).toBe(0);
    const metadata = JSON.parse(packed.stdout) as Array<{
      readonly filename: string;
      readonly files: Array<{ readonly path: string }>;
    }>;
    const paths = metadata[0]?.files.map(({ path }) => path) ?? [];
    expect(paths).toEqual(
      expect.arrayContaining([
        "LICENSE",
        "README.md",
        "dist/index.js",
        "dist/react.js",
      ]),
    );
    expect(
      paths.some((path) => path.includes("src/") || path.includes("test/")),
    ).toBe(false);

    expect(
      spawnSync("npm", ["init", "-y"], { cwd: directory, encoding: "utf8" })
        .status,
    ).toBe(0);
    const install = spawnSync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--legacy-peer-deps",
        join(directory, metadata[0]?.filename ?? "missing.tgz"),
      ],
      { cwd: directory, encoding: "utf8" },
    );
    expect(install.status, install.stderr).toBe(0);
    const consumer = join(directory, "consumer.mjs");
    writeFileSync(
      consumer,
      'import { createPolymorfaStore } from "@polymorfa/store"; const store = await createPolymorfaStore({ name: "consumer" }); const result = await store.ingest({ id: "e1", session: "s", timestamp: "2026-09-01T00:00:00Z", event: "session.status", payload: { status: "ready" } }); console.log(store.mode, result.accepted, (await store.sessions.get("s")).status); store.close();',
    );
    const imported = spawnSync(process.execPath, [consumer], {
      cwd: directory,
      encoding: "utf8",
    });
    expect(imported.status, imported.stderr).toBe(0);
    expect(imported.stdout.trim()).toBe("memory 1 ready");
  }, 60_000);
});
