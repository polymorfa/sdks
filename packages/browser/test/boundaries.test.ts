import { readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));

describe("browser package boundaries", () => {
  it("imports only the Calls client from @polymorfa/sdk and has no server-key fixture", async () => {
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
          // The Calls client is platform-neutral and shared with the server
          // SDK; nothing else of @polymorfa/sdk may reach the browser.
          const sdkImports = [
            ...source.matchAll(/["'](@polymorfa\/sdk[^"']*)["']/g),
          ].map((match) => match[1]);
          if (
            sdkImports.some(
              (specifier) =>
                !/^@polymorfa\/sdk\/calls(?:\/internal)?$/.test(
                  specifier ?? "",
                ),
            ) ||
            /pmfa_(?!ct_)/.test(source)
          )
            matches.push(path.slice(dirname(sourceRoot).length));
        }
      }
    }
    expect(matches).toEqual([]);
  });

  it("uses the shared Calls client rather than a copy", async () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies).toEqual({ "@polymorfa/sdk": "0.1.0-dev.0" });
  });
});
