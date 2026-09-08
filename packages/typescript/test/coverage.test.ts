import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";
import { HttpCallsApi } from "../../calls/src/index.js";
import { BrowserMessagingClient } from "../../browser/src/index.js";
import {
  BridgeClient,
  Client,
  MessagingClient,
  SystemClient,
} from "../src/index.js";

const checker = fileURLToPath(
  new URL("../../../scripts/check-coverage.mjs", import.meta.url),
);
const messagingContract = fileURLToPath(
  new URL("../../../contracts/openapi.messaging.json", import.meta.url),
);
const platformContract = fileURLToPath(
  new URL("../../../contracts/openapi.platform.json", import.meta.url),
);
const repositoryLedger = fileURLToPath(
  new URL("../../../contracts/coverage.json", import.meta.url),
);
const knownFingerprint =
  "43b00b873e450f67c069001200873efdb343ec4a35a3204ff4b70682d9363f73";

function operation(responseType = "object") {
  return {
    operationId: "listItems",
    summary: "Human documentation does not affect structural coverage",
    responses: {
      "200": {
        description: "OK",
        content: { "application/json": { schema: { type: responseType } } },
      },
    },
  };
}

function runChecker(
  options: {
    readonly extraOperation?: boolean;
    readonly responseType?: string;
    readonly strict?: boolean;
  } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "polymorfa-coverage-"));
  const messaging = join(directory, "messaging.json");
  const platform = join(directory, "platform.json");
  const ledger = join(directory, "ledger.json");
  const report = join(directory, "report.json");
  writeFileSync(
    messaging,
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Messaging", version: "1" },
      paths: {
        "/v1/items": { get: operation(options.responseType) },
        ...(options.extraOperation
          ? { "/v1/items/{id}": { delete: operation() } }
          : {}),
      },
    }),
  );
  writeFileSync(
    platform,
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Platform", version: "1" },
      paths: {},
    }),
  );
  writeFileSync(
    ledger,
    JSON.stringify({
      schemaVersion: 1,
      sourceCommit: "fixture",
      operations: [
        {
          family: "messaging",
          method: "GET",
          path: "/v1/items",
          operationId: "listItems",
          fingerprint: knownFingerprint,
          typescript: { status: "covered", method: "RawClient.request" },
        },
      ],
    }),
  );

  const checkerArguments = [
    checker,
    "--messaging",
    messaging,
    "--platform",
    platform,
    "--ledger",
    ledger,
    "--report",
    report,
    ...(options.strict ? ["--strict"] : []),
  ];
  const result = spawnSync(process.execPath, checkerArguments, {
    encoding: "utf8",
  });
  return {
    ...result,
    report:
      result.status === 0
        ? (JSON.parse(readFileSync(report, "utf8")) as Record<string, unknown>)
        : undefined,
  };
}

function runRepositoryChecker() {
  const directory = mkdtempSync(join(tmpdir(), "polymorfa-coverage-repo-"));
  const report = join(directory, "report.json");
  const result = spawnSync(
    process.execPath,
    [
      checker,
      "--messaging",
      messagingContract,
      "--platform",
      platformContract,
      "--ledger",
      repositoryLedger,
      "--report",
      report,
      "--strict",
    ],
    { encoding: "utf8" },
  );
  return {
    ...result,
    report:
      result.status === 0
        ? (JSON.parse(readFileSync(report, "utf8")) as Record<string, unknown>)
        : undefined,
  };
}

describe("coverage checker", () => {
  it("reports the reviewed repository ledger totals", () => {
    const result = runRepositoryChecker();
    expect(result.status, result.stderr).toBe(0);
    expect(result.report).toMatchObject({
      sourceCommit: "6918c56135e28ba64557e344cb72889f1f517eb5",
      total: 402,
      covered: 274,
      partial: 0,
      missing: 0,
      excluded: 128,
      changed: 0,
      resolutions: [],
    });
  });

  it("maps the complete Customers contract to the Platform resource", () => {
    const ledger = JSON.parse(readFileSync(repositoryLedger, "utf8")) as {
      operations: Array<{
        path: string;
        operationId: string;
        typescript: { status: string; method?: string };
      }>;
    };
    const customerMappings = Object.fromEntries(
      ledger.operations
        .filter(({ path }) => path.includes("customers"))
        .map(({ operationId, typescript }) => [operationId, typescript.method]),
    );

    expect(customerMappings).toEqual({
      archiveCustomer: "Client.customers.archive",
      createCustomer: "Client.customers.create",
      createCustomerPairingLink: "Client.customers.createPairingLink",
      enableCustomers: "Client.customers.enable",
      getCustomer: "Client.customers.retrieve",
      getCustomersStatus: "Client.customers.status",
      listCustomerEvents: "Client.customers.listEvents",
      listCustomerNumbers: "Client.customers.listNumbers",
      listCustomerPairingLinks: "Client.customers.listPairingLinks",
      listCustomers: "Client.customers.list",
      restoreCustomer: "Client.customers.restore",
      revokeCustomerPairingLink: "Client.customers.revokePairingLink",
      transferCustomerNumber: "Client.customers.transferNumber",
      updateCustomer: "Client.customers.update",
    });
  });

  it("maps the complete Messaging campaign workflow", () => {
    const ledger = JSON.parse(readFileSync(repositoryLedger, "utf8")) as {
      operations: Array<{
        operationId: string;
        typescript: { status: string; method?: string };
      }>;
    };
    const operationIds = [
      "listCampaigns",
      "createCampaign",
      "getCampaign",
      "getCampaignAnalytics",
      "launchCampaign",
      "pauseCampaign",
      "resumeCampaign",
      "stopCampaign",
      "requeueCampaign",
    ];
    const mappings = Object.fromEntries(
      ledger.operations
        .filter(({ operationId }) => operationIds.includes(operationId))
        .map(({ operationId, typescript }) => [operationId, typescript.method]),
    );

    expect(mappings).toEqual({
      createCampaign: "MessagingClient.campaigns.create",
      getCampaign: "MessagingClient.campaigns.retrieve",
      getCampaignAnalytics: "MessagingClient.campaigns.analytics",
      launchCampaign: "MessagingClient.campaigns.launch",
      listCampaigns: "MessagingClient.campaigns.list",
      pauseCampaign: "MessagingClient.campaigns.pause",
      requeueCampaign: "MessagingClient.campaigns.requeue",
      resumeCampaign: "MessagingClient.campaigns.resume",
      stopCampaign: "MessagingClient.campaigns.stop",
    });
  });

  it("maps batch session lifecycle to the organization-key client", () => {
    const ledger = JSON.parse(readFileSync(repositoryLedger, "utf8")) as {
      operations: Array<{
        operationId: string;
        typescript: { status: string; method?: string };
      }>;
    };
    const operationIds = ["stopSessions", "deleteSessions"];
    const mappings = Object.fromEntries(
      ledger.operations
        .filter(({ operationId }) => operationIds.includes(operationId))
        .map(({ operationId, typescript }) => [operationId, typescript.method]),
    );

    expect(mappings).toEqual({
      deleteSessions: "Client.sessions.deleteMany",
      stopSessions: "Client.sessions.stopMany",
    });
  });

  it("resolves every covered ledger mapping to a public client method", () => {
    const ledger = JSON.parse(readFileSync(repositoryLedger, "utf8")) as {
      operations: Array<{
        typescript: { status: string; method?: string };
      }>;
    };
    const client = new Client({
      credential: { type: "organizationApiKey", value: "pmfa_platform" },
    });
    const projectClient = client.project("project_coverage");
    const roots: Readonly<Record<string, unknown>> = {
      MessagingClient: new MessagingClient({
        credential: { type: "apiKey", value: "pmfa_messaging" },
      }),
      Client: client,
      SystemClient: new SystemClient(),
      BridgeClient: new BridgeClient({
        credential: { type: "projectToken", value: "pmfa_pt_bridge" },
      }),
      HttpCallsApi: new HttpCallsApi({ apiKey: "pmfa_calls" }),
      BrowserMessagingClient: new BrowserMessagingClient({
        session: "coverage",
        getClientToken: async () => "pmfa_ct_coverage",
      }),
    };

    for (const operation of ledger.operations) {
      if (operation.typescript.status !== "covered") continue;
      const parts = operation.typescript.method?.split(".") ?? [];
      const projectScoped = parts[1] === "project(projectId)";
      let value: unknown = projectScoped
        ? projectClient
        : roots[parts[0] ?? ""];
      for (const part of parts.slice(projectScoped ? 2 : 1)) {
        expect(value, operation.typescript.method).toBeTypeOf("object");
        value = (value as Readonly<Record<string, unknown>>)[part];
      }
      expect(value, operation.typescript.method).toBeTypeOf("function");
    }
  });

  it("maps every Presence operation to the server resource", () => {
    const ledger = JSON.parse(readFileSync(repositoryLedger, "utf8")) as {
      operations: Array<{
        operationId: string;
        typescript: { status: string; method?: string };
      }>;
    };
    const presenceMappings = Object.fromEntries(
      ledger.operations
        .filter(({ operationId }) =>
          [
            "setPresence",
            "getPresence",
            "getChatPresence",
            "subscribePresence",
          ].includes(operationId),
        )
        .map(({ operationId, typescript }) => [operationId, typescript.method]),
    );

    expect(presenceMappings).toEqual({
      getPresence: "MessagingClient.presence.get",
      getChatPresence: "MessagingClient.presence.getForChat",
      setPresence: "MessagingClient.presence.set",
      subscribePresence: "MessagingClient.presence.subscribe",
    });
  });

  it("maps every Channels operation to the server resource", () => {
    const ledger = JSON.parse(readFileSync(repositoryLedger, "utf8")) as {
      operations: Array<{
        operationId: string;
        typescript: { status: string; method?: string };
      }>;
    };
    const channelOperationIds = [
      "listChannels",
      "createChannel",
      "getChannel",
      "deleteChannel",
      "listChannelMessages",
      "listChannelMessageUpdates",
      "markChannelMessageViewed",
      "reactToChannelMessage",
      "subscribeChannelLiveUpdates",
      "followChannel",
      "unfollowChannel",
      "muteChannel",
      "unmuteChannel",
    ];
    const channelMappings = Object.fromEntries(
      ledger.operations
        .filter(({ operationId }) => channelOperationIds.includes(operationId))
        .map(({ operationId, typescript }) => [operationId, typescript.method]),
    );

    expect(channelMappings).toEqual({
      deleteChannel: "MessagingClient.channels.delete",
      listChannels: "MessagingClient.channels.list",
      getChannel: "MessagingClient.channels.retrieve",
      listChannelMessageUpdates: "MessagingClient.channels.listMessageUpdates",
      listChannelMessages: "MessagingClient.channels.listMessages",
      createChannel: "MessagingClient.channels.create",
      followChannel: "MessagingClient.channels.follow",
      subscribeChannelLiveUpdates:
        "MessagingClient.channels.subscribeToLiveUpdates",
      reactToChannelMessage: "MessagingClient.channels.reactToMessage",
      markChannelMessageViewed: "MessagingClient.channels.markMessageViewed",
      muteChannel: "MessagingClient.channels.mute",
      unfollowChannel: "MessagingClient.channels.unfollow",
      unmuteChannel: "MessagingClient.channels.unmute",
    });
  });

  it("maps every non-Quick-Replies Business App operation to the server resource", () => {
    const ledger = JSON.parse(readFileSync(repositoryLedger, "utf8")) as {
      operations: Array<{
        operationId: string;
        typescript: { status: string; method?: string };
      }>;
    };
    const expectedMappings = {
      appealBusinessCollection: "MessagingClient.business.appealCollection",
      appealBusinessProduct: "MessagingClient.business.appealProduct",
      createBusinessCatalog: "MessagingClient.business.createCatalog",
      createBusinessCollection: "MessagingClient.business.createCollection",
      createBusinessProduct: "MessagingClient.business.createProduct",
      deleteBusinessCollection: "MessagingClient.business.deleteCollection",
      deleteBusinessCoverPhoto: "MessagingClient.business.deleteCoverPhoto",
      deleteBusinessProduct: "MessagingClient.business.deleteProduct",
      getBusinessCatalog: "MessagingClient.business.getCatalog",
      getBusinessCollection: "MessagingClient.business.getCollection",
      getBusinessCollections: "MessagingClient.business.listCollections",
      getBusinessEligibility: "MessagingClient.business.getEligibility",
      getBusinessLinkedAccounts: "MessagingClient.business.getLinkedAccounts",
      getBusinessMerchantCompliance:
        "MessagingClient.business.getMerchantCompliance",
      getBusinessOrder: "MessagingClient.business.getOrder",
      getBusinessProduct: "MessagingClient.business.getProduct",
      getProjectObservationPolicy:
        "MessagingClient.observationPolicies.retrieveForProject",
      getSessionObservationPolicy:
        "MessagingClient.observationPolicies.retrieveForSession",
      getOwnBusinessProfile: "MessagingClient.business.getProfile",
      reorderBusinessCollections: "MessagingClient.business.reorderCollections",
      setBusinessCartEnabled: "MessagingClient.business.setCartEnabled",
      setBusinessCoverPhoto: "MessagingClient.business.setCoverPhoto",
      setBusinessMerchantCompliance:
        "MessagingClient.business.setMerchantCompliance",
      updateProjectObservationPolicy:
        "MessagingClient.observationPolicies.updateForProject",
      updateSessionObservationPolicy:
        "MessagingClient.observationPolicies.updateForSession",
      setBusinessProductVisibility:
        "MessagingClient.business.setProductVisibility",
      updateBusinessCollection: "MessagingClient.business.updateCollection",
      updateBusinessProduct: "MessagingClient.business.updateProduct",
      updateBusinessProfile: "MessagingClient.business.updateProfile",
    } as const;
    const contract = JSON.parse(readFileSync(messagingContract, "utf8")) as {
      paths: Readonly<
        Record<
          string,
          Readonly<
            Record<
              string,
              | {
                  readonly operationId?: string;
                  readonly tags?: readonly string[];
                }
              | readonly unknown[]
            >
          >
        >
      >;
    };
    const contractOperationIds = Object.values(contract.paths)
      .flatMap((path) => Object.values(path))
      .filter(
        (
          operation,
        ): operation is {
          readonly operationId: string;
          readonly tags?: readonly string[];
        } => {
          if (
            operation === null ||
            typeof operation !== "object" ||
            Array.isArray(operation)
          ) {
            return false;
          }
          const candidate = operation as {
            readonly operationId?: string;
            readonly tags?: readonly string[];
          };
          return (
            candidate.tags?.includes("Business App") === true &&
            typeof candidate.operationId === "string" &&
            !candidate.operationId.includes("BusinessQuick")
          );
        },
      )
      .map(({ operationId }) => operationId)
      .sort();
    const operationIds = new Set(Object.keys(expectedMappings));
    const mappings = Object.fromEntries(
      ledger.operations
        .filter(({ operationId }) => operationIds.has(operationId))
        .map(({ operationId, typescript }) => [operationId, typescript.method]),
    );

    expect(contractOperationIds).toEqual([...operationIds].sort());
    expect(mappings).toEqual(expectedMappings);
  });

  it("maps the complete Calls, LIDs, and Users tags to their server resources", () => {
    const ledger = JSON.parse(readFileSync(repositoryLedger, "utf8")) as {
      operations: Array<{
        operationId: string;
        typescript: { status: string; method?: string };
      }>;
    };
    const mappings = Object.fromEntries(
      ledger.operations
        .filter(({ operationId }) =>
          ["rejectCall", "resolveLIDs", "getUserSecurityCode"].includes(
            operationId,
          ),
        )
        .map(({ operationId, typescript }) => [operationId, typescript.method]),
    );
    const contract = JSON.parse(readFileSync(messagingContract, "utf8")) as {
      paths: Readonly<
        Record<
          string,
          Readonly<
            Record<
              string,
              | {
                  readonly operationId?: string;
                  readonly tags?: readonly string[];
                }
              | readonly unknown[]
            >
          >
        >
      >;
    };
    const contractOperationIds = Object.values(contract.paths)
      .flatMap((path) => Object.values(path))
      .filter(
        (
          operation,
        ): operation is {
          readonly operationId: string;
          readonly tags?: readonly string[];
        } => {
          if (
            operation === null ||
            typeof operation !== "object" ||
            Array.isArray(operation)
          ) {
            return false;
          }
          const candidate = operation as {
            readonly operationId?: string;
            readonly tags?: readonly string[];
          };
          return (
            candidate.tags?.some((tag) =>
              ["Calls", "LIDs", "Users"].includes(tag),
            ) === true && typeof candidate.operationId === "string"
          );
        },
      )
      .map(({ operationId }) => operationId)
      .sort();

    expect(contractOperationIds).toEqual([
      "getUserSecurityCode",
      "rejectCall",
      "resolveLIDs",
    ]);
    expect(mappings).toEqual({
      getUserSecurityCode: "MessagingClient.users.getSecurityCode",
      rejectCall: "MessagingClient.calls.reject",
      resolveLIDs: "MessagingClient.lids.resolve",
    });
  });

  it("maps the organization-key Platform access family and excludes dashboard member mutations", () => {
    const ledger = JSON.parse(readFileSync(repositoryLedger, "utf8")) as {
      operations: Array<{
        operationId: string;
        typescript: { status: string; method?: string };
      }>;
    };
    const operationIds = [
      "deactivateApiKey",
      "listApiKeys",
      "listMembers",
      "listAuditLogs",
      "listSessionBans",
      "listActiveSessionBans",
      "listSecurityIncidents",
      "acknowledgeSecurityIncident",
      "getOrganizationOperation",
      "listPolymorfaTokens",
      "inviteMember",
      "updateMemberRole",
      "deleteMember",
    ];
    const mappings = Object.fromEntries(
      ledger.operations
        .filter(({ operationId }) => operationIds.includes(operationId))
        .map(({ operationId, typescript }) => [operationId, typescript]),
    );

    expect(mappings).toMatchObject({
      deactivateApiKey: {
        status: "covered",
        method: "Client.apiKeys.deactivate",
      },
      listApiKeys: {
        status: "covered",
        method: "Client.apiKeys.list",
      },
      listMembers: {
        status: "covered",
        method: "Client.members.list",
      },
      listAuditLogs: {
        status: "covered",
        method: "Client.auditLogs.list",
      },
      listSessionBans: {
        status: "covered",
        method: "Client.sessionBans.list",
      },
      listActiveSessionBans: {
        status: "covered",
        method: "Client.sessionBans.listActive",
      },
      listSecurityIncidents: {
        status: "covered",
        method: "Client.securityIncidents.list",
      },
      acknowledgeSecurityIncident: {
        status: "covered",
        method: "Client.securityIncidents.acknowledge",
      },
      getOrganizationOperation: {
        status: "covered",
        method: "Client.operations.retrieve",
      },
      listPolymorfaTokens: {
        status: "covered",
        method: "Client.projectTokens.list",
      },
      inviteMember: { status: "excluded" },
      updateMemberRole: { status: "excluded" },
      deleteMember: { status: "excluded" },
    });
  });

  it("accepts a complete ledger and emits machine-readable counts", () => {
    const result = runChecker();
    expect(result.status, result.stderr).toBe(0);
    expect(result.report).toMatchObject({
      total: 1,
      covered: 1,
      missing: 0,
      changed: 0,
      gaps: [],
    });
  });

  it("fails when a contract operation has no ledger row", () => {
    const result = runChecker({ extraOperation: true, strict: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DELETE /v1/items/{id}");
  });

  it("reports an absent ledger row as a non-blocking gap when strict mode is off", () => {
    const result = runChecker({ extraOperation: true });
    expect(result.status, result.stderr).toBe(0);
    expect(result.report).toMatchObject({
      total: 2,
      covered: 1,
      missing: 1,
      changed: 0,
    });
    expect(result.report?.gaps).toEqual([
      expect.objectContaining({
        method: "DELETE",
        path: "/v1/items/{id}",
        status: "missing",
      }),
    ]);
  });

  it("reports a structural fingerprint change as a non-blocking gap", () => {
    const result = runChecker({ responseType: "array" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.report).toMatchObject({
      total: 1,
      covered: 0,
      missing: 0,
      changed: 1,
    });
    expect(result.report?.gaps).toEqual([
      expect.objectContaining({
        family: "messaging",
        method: "GET",
        path: "/v1/items",
        status: "changed",
      }),
    ]);
  });
});
