import { mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const checker = fileURLToPath(
  new URL("../../../scripts/check-retired-name.mjs", import.meta.url),
);
const retiredName = String.fromCharCode(116, 105, 116, 97, 110);

function makeRepository(contents: string) {
  const directory = mkdtempSync(join(tmpdir(), "polymorfa-names-"));
  const initialize = spawnSync("git", ["init", "--quiet", directory], {
    encoding: "utf8",
  });
  expect(initialize.status, initialize.stderr).toBe(0);
  writeFileSync(join(directory, "README.md"), contents);
  const add = spawnSync("git", ["-C", directory, "add", "README.md"], {
    encoding: "utf8",
  });
  expect(add.status, add.stderr).toBe(0);
  return directory;
}

describe("retired product-name checker", () => {
  it("accepts tracked files that use the Polymorfa identity", () => {
    const result = spawnSync(
      process.execPath,
      [checker, "--root", makeRepository("Polymorfa SDK")],
      {
        encoding: "utf8",
      },
    );
    expect(result.status, result.stderr).toBe(0);
  });

  it("reports the path of a tracked case-insensitive retired-name match", () => {
    const result = spawnSync(
      process.execPath,
      [
        checker,
        "--root",
        makeRepository(`old ${retiredName.toUpperCase()} SDK`),
      ],
      {
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("README.md");
  });

  it("ignores a tracked file removed in the working tree", () => {
    const directory = makeRepository("Polymorfa SDK");
    unlinkSync(join(directory, "README.md"));

    const result = spawnSync(process.execPath, [checker, "--root", directory], {
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
  });
});
