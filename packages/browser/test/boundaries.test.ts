import { readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));

describe("browser package boundaries", () => {
  it("contains no server SDK import or server-key fixture", async () => {
    const { readdir } = await import("node:fs/promises");
    const pending = [sourceRoot];
    const matches: string[] = [];
    while (pending.length > 0) {
      const directory = pending.pop();
      if (directory === undefined) break;
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) pending.push(path);
        else if (extname(path) === ".ts") {
          const source = readFileSync(path, "utf8");
          if (source.includes("@polymorfa/sdk") || /pmfa_(?!ct_)/.test(source))
            matches.push(path.slice(dirname(sourceRoot).length));
        }
      }
    }
    expect(matches).toEqual([]);
  });
});
