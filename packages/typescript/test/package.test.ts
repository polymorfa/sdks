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
        'import { MessagingClient, PlatformClient, PRESENCE_STATES, PRIVACY_SETTING_VALUES, SDK_VERSION } from "@polymorfa/sdk";',
        'const messaging = new MessagingClient({ credential: { type: "apiKey", value: "pmfa_fixture" } });',
        'const platform = new PlatformClient({ apiKey: "pmfa_fixture" });',
        "console.log(JSON.stringify({ version: SDK_VERSION, messaging: !!messaging.raw, business: typeof messaging.business.getCatalog, calls: typeof messaging.calls.reject, messagingMedia: typeof messaging.media.download, chats: typeof messaging.chats.editMessage, channels: typeof messaging.channels.listMessageUpdates, contacts: typeof messaging.contacts.list, groups: typeof messaging.groups.list, labels: typeof messaging.labels.list, lids: typeof messaging.lids.resolve, observationPolicies: typeof messaging.observationPolicies.retrieveForProject, profile: typeof messaging.profile.get, privacy: typeof messaging.privacy.set, privacyValues: PRIVACY_SETTING_VALUES.defense, presence: typeof messaging.presence.getForChat, presenceStates: PRESENCE_STATES, quickReplies: typeof messaging.quickReplies.list, pairing: typeof messaging.sessions.requestPairingCode, operations: typeof messaging.operations.retrieve, templates: typeof messaging.templates.create, users: typeof messaging.users.getSecurityCode, platform: !!platform.raw, apiKeys: typeof platform.apiKeys.deactivate, auditLogs: typeof platform.auditLogs.list, billing: typeof platform.billing.usage, members: typeof platform.members.list, platformOperations: typeof platform.operations.retrieve, projectTokens: typeof platform.projectTokens.list, securityIncidents: typeof platform.securityIncidents.acknowledge, sessionBans: typeof platform.sessionBans.listActive, memberInvite: typeof platform.members.invite, organizationUpdate: typeof platform.organizations.update }));",
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
      business: "function",
      calls: "function",
      messagingMedia: "function",
      chats: "function",
      channels: "function",
      contacts: "function",
      groups: "function",
      labels: "function",
      lids: "function",
      observationPolicies: "function",
      profile: "function",
      privacy: "function",
      privacyValues: ["on_standard", "off"],
      presence: "function",
      presenceStates: ["available", "unavailable"],
      quickReplies: "function",
      pairing: "function",
      operations: "function",
      templates: "function",
      users: "function",
      platform: true,
      apiKeys: "function",
      auditLogs: "function",
      billing: "function",
      members: "function",
      platformOperations: "function",
      projectTokens: "function",
      securityIncidents: "function",
      sessionBans: "function",
      memberInvite: "undefined",
      organizationUpdate: "undefined",
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
