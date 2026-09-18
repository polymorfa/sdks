import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const sdkRoot = fileURLToPath(new URL("../../typescript/", import.meta.url));

function pack(cwd: string, directory: string) {
  const packed = spawnSync(
    "npm",
    ["pack", "--json", "--ignore-scripts", "--pack-destination", directory],
    { cwd, encoding: "utf8" },
  );
  expect(packed.status, packed.stderr).toBe(0);
  return JSON.parse(packed.stdout)[0] as {
    readonly filename: string;
    readonly files: Array<{ readonly path: string }>;
  };
}

describe("@polymorfa/browser package", () => {
  it("installs with @polymorfa/sdk alone and shares its Calls classes", () => {
    for (const cwd of [sdkRoot, packageRoot]) {
      const build = spawnSync("npm", ["run", "build"], {
        cwd,
        encoding: "utf8",
      });
      expect(build.status, build.stdout + build.stderr).toBe(0);
    }
    const directory = mkdtempSync(join(tmpdir(), "polymorfa-browser-package-"));
    const sdk = pack(sdkRoot, directory);
    const browser = pack(packageRoot, directory);
    const paths = browser.files.map(({ path }) => path);
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
    // Only packages that are published: no private @polymorfa/calls.
    const install = spawnSync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        join(directory, browser.filename),
        join(directory, sdk.filename),
      ],
      { cwd: directory, encoding: "utf8" },
    );
    expect(install.status, install.stderr).toBe(0);
    expect(
      existsSync(join(directory, "node_modules", "@polymorfa", "calls")),
    ).toBe(false);

    const consumer = join(directory, "consumer.mjs");
    writeFileSync(
      consumer,
      [
        'import { BrowserMessagingClient, BrowserTransport, ClientTokenManager, createSameOriginTemplateBuilderTransport } from "@polymorfa/browser";',
        'import { CallsSignalingClient } from "@polymorfa/browser/internal";',
        'import { CallsDisabledError } from "@polymorfa/sdk/calls";',
        'const token = await new ClientTokenManager(async () => "pmfa_ct_fixture").get();',
        'const client = new BrowserMessagingClient({ session: "support", getClientToken: async () => token });',
        "const templates = createSameOriginTemplateBuilderTransport();",
        // A browser request refused because calling is off raises the one
        // CallsDisabledError class applications import from the SDK.
        "const transport = new BrowserTransport({",
        '  getClientToken: async () => "pmfa_ct_fixture",',
        '  baseUrl: "https://api.polymorfa.test",',
        "  maxNetworkRetries: 0,",
        '  fetch: async () => new Response(JSON.stringify({ error: { code: "calls_disabled", message: "Calling is off" } }), { status: 403, headers: { "content-type": "application/json" } }),',
        "});",
        "let disabled = false;",
        'try { await new CallsSignalingClient(transport).offer("call-1", { sdp: "v=0", connectionId: "conn_0123456789" }); } catch (error) { disabled = error instanceof CallsDisabledError; }',
        "console.log(token, typeof client.messages.send, typeof templates.save, disabled);",
      ].join("\n"),
    );
    const imported = spawnSync(process.execPath, [consumer], {
      cwd: directory,
      encoding: "utf8",
    });
    expect(imported.status, imported.stderr).toBe(0);
    expect(imported.stdout.trim()).toBe(
      "pmfa_ct_fixture function function true",
    );
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
    expect(manifest.dependencies).toEqual({ "@polymorfa/sdk": "0.1.0-dev.0" });
  }, 60_000);
});
