import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const sdkRoot = fileURLToPath(new URL("../../typescript/", import.meta.url));
const workspaceModules = fileURLToPath(
  new URL("../../../node_modules/", import.meta.url),
);

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

function consumer(directory: string, name: string, packages: string[]) {
  const cwd = join(directory, name);
  mkdirSync(cwd);
  const initialize = spawnSync("npm", ["init", "-y"], {
    cwd,
    encoding: "utf8",
  });
  expect(initialize.status, initialize.stderr).toBe(0);
  // Only packages that are published: no private @polymorfa/calls.
  const install = spawnSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...packages],
    { cwd, encoding: "utf8" },
  );
  expect(install.status, install.stderr).toBe(0);
  return cwd;
}

function run(cwd: string, lines: readonly string[]) {
  const file = join(cwd, "consumer.mjs");
  writeFileSync(file, lines.join("\n"));
  const result = spawnSync(process.execPath, [file], {
    cwd,
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n");
}

describe("@polymorfa/ui-kit package", () => {
  it("installs with @polymorfa/sdk alone and imports every subpath without React", () => {
    for (const cwd of [sdkRoot, packageRoot]) {
      const build = spawnSync("npm", ["run", "build"], {
        cwd,
        encoding: "utf8",
      });
      expect(build.status, build.stdout + build.stderr).toBe(0);
    }
    const directory = mkdtempSync(join(tmpdir(), "polymorfa-ui-kit-package-"));
    const sdk = pack(sdkRoot, directory);
    const kit = pack(packageRoot, directory);
    const paths = kit.files.map(({ path }) => path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "LICENSE",
        "README.md",
        "dist/browser/index.js",
        "dist/browser/internal.js",
        "dist/react/index.js",
        "dist/web-components/index.js",
        "dist/web-components/chat.js",
        "dist/web-components/templates.js",
        "dist/web-components/calls.js",
        "dist/appearance/index.js",
        "dist/store/index.js",
        "dist/store/react.js",
        "dist/devtools/index.js",
        "dist/devtools/production.js",
      ]),
    );
    expect(
      paths.some((path) => path.includes("src/") || path.includes("test/")),
    ).toBe(false);

    const tarballs = [
      join(directory, kit.filename),
      join(directory, sdk.filename),
    ];
    const plain = consumer(directory, "without-react", tarballs);
    expect(existsSync(join(plain, "node_modules", "@polymorfa", "calls"))).toBe(
      false,
    );
    expect(existsSync(join(plain, "node_modules", "react"))).toBe(false);

    const output = run(plain, [
      // A registry that records definitions: importing a subpath must not
      // register custom elements on its own.
      "const defined = [];",
      "globalThis.customElements = { define: (name) => defined.push(name), get: () => undefined };",
      'const { BrowserMessagingClient, BrowserTransport, ClientTokenManager, createSameOriginTemplateBuilderTransport } = await import("@polymorfa/ui-kit");',
      'const { CallsSignalingClient } = await import("@polymorfa/ui-kit/internal");',
      'const { CallsDisabledError } = await import("@polymorfa/sdk/calls");',
      'const token = await new ClientTokenManager(async () => "pmfa_ct_Zml4dHVyZQ").get();',
      'const client = new BrowserMessagingClient({ session: "support", getClientToken: async () => token });',
      "const templates = createSameOriginTemplateBuilderTransport();",
      // A browser request refused because calling is off raises the one
      // CallsDisabledError class applications import from the SDK.
      "const transport = new BrowserTransport({",
      '  getClientToken: async () => "pmfa_ct_Zml4dHVyZQ",',
      '  baseUrl: "https://api.polymorfa.test",',
      "  maxNetworkRetries: 0,",
      '  fetch: async () => new Response(JSON.stringify({ error: { code: "calls_disabled", message: "Calling is off" } }), { status: 403, headers: { "content-type": "application/json" } }),',
      "});",
      "let disabled = false;",
      'try { await new CallsSignalingClient(transport).offer("call-1", { sdp: "v=0", connectionId: "conn_0123456789" }); } catch (error) { disabled = error instanceof CallsDisabledError; }',
      "console.log(token, typeof client.messages.send, typeof templates.save, disabled);",
      'const { defineAppearance } = await import("@polymorfa/ui-kit/appearance");',
      "console.log(defineAppearance().theme);",
      'const { createPolymorfaStore } = await import("@polymorfa/ui-kit/store");',
      'const store = await createPolymorfaStore({ name: "consumer" });',
      'const result = await store.ingest({ id: "e1", session: "s", timestamp: "2026-09-01T00:00:00Z", event: "session.status", payload: { status: "ready" } });',
      'console.log(store.mode, result.accepted, (await store.sessions.get("s")).status);',
      "store.close();",
      'const components = await import("@polymorfa/ui-kit/web-components");',
      'const chat = await import("@polymorfa/ui-kit/web-components/chat");',
      'const builder = await import("@polymorfa/ui-kit/web-components/templates");',
      'const calls = await import("@polymorfa/ui-kit/web-components/calls");',
      "console.log(typeof components.defineUiKit, typeof components.definePolymorfaElements, typeof chat.defineChatElements, typeof builder.defineTemplateElements, typeof calls.defineCallElements, defined.length);",
      'const devtools = await import("@polymorfa/ui-kit/devtools");',
      'const production = await import("@polymorfa/ui-kit/devtools/production");',
      "console.log(typeof devtools.mountDevAssistant, production.mountDevAssistant());",
      'for (const subpath of ["react", "store/react"]) {',
      "  try { await import(`@polymorfa/ui-kit/${subpath}`); console.log(subpath, 'loaded'); }",
      "  catch (error) { console.log(subpath, error.code, /'react'/.test(error.message)); }",
      "}",
    ]);
    expect(output).toEqual([
      "pmfa_ct_Zml4dHVyZQ function function true",
      "system",
      "memory 1 ready",
      "function function function function function 0",
      "function null",
      // React is an optional peer: only the React subpaths need it.
      "react ERR_MODULE_NOT_FOUND true",
      "store/react ERR_MODULE_NOT_FOUND true",
    ]);

    const manifest = JSON.parse(
      readFileSync(
        join(plain, "node_modules", "@polymorfa", "ui-kit", "package.json"),
        "utf8",
      ),
    ) as {
      readonly dependencies?: Readonly<Record<string, string>>;
      readonly peerDependenciesMeta?: Readonly<
        Record<string, { readonly optional?: boolean }>
      >;
      readonly sideEffects?: boolean;
    };
    expect(manifest.dependencies).toEqual({ "@polymorfa/sdk": "0.1.0-dev.0" });
    expect(manifest.peerDependenciesMeta).toEqual({
      react: { optional: true },
      "react-dom": { optional: true },
    });
    expect(manifest.sideEffects).toBe(false);

    // The workspace's own React copies stand in for the application's, so
    // the check needs no registry access.
    const withReact = consumer(directory, "with-react", [
      ...tarballs,
      join(workspaceModules, "react"),
      join(workspaceModules, "react-dom"),
    ]);
    expect(
      run(withReact, [
        'const { PolymorfaProvider, Inbox, DialPad } = await import("@polymorfa/ui-kit/react");',
        'const { usePolymorfaStoreQuery } = await import("@polymorfa/ui-kit/store/react");',
        "console.log(typeof PolymorfaProvider, typeof Inbox, typeof DialPad, typeof usePolymorfaStoreQuery);",
      ]),
    ).toEqual(["function function function function"]);
  }, 120_000);
});
