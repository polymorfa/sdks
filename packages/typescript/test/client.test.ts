import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  Client,
  MessagingClient,
  PolymorfaConfigurationError,
  PolymorfaValidationError,
  type OrganizationEvent,
  type OrganizationQuickLinkSettings,
  type ProjectEvent,
  type ProjectQuickLinkSettings,
} from "../src/index.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function testClient(projectId?: string): Promise<{
  client: Client<"organization"> | Client<"project">;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer(({ path }) => ({
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_client",
    },
    body:
      path.includes("/transitions") || path.includes("/events?")
        ? '{"data":[],"page":{"nextCursor":null,"hasMore":false}}'
        : '{"data":{"id":"resource_1","status":"succeeded","sequence":1,"capabilities":{"cancellable":false,"watchable":false}}}',
  }));
  servers.push(server);
  const shared = {
    baseUrl: server.url,
    maxNetworkRetries: 0,
  } as const;
  return {
    requests: server.requests,
    client:
      projectId === undefined
        ? new Client({
            ...shared,
            credential: {
              type: "organizationApiKey",
              value: ORGANIZATION_API_KEY,
            },
          })
        : new Client({
            ...shared,
            credential: {
              type: "projectToken",
              value: PROJECT_TOKEN,
            },
            projectId,
          }),
  };
}

describe("Client ownership", () => {
  it("binds organization roots and immutable project views without probing", async () => {
    const { client, requests } = await testClient();
    if (client.owner !== "organization") throw new Error("unexpected owner");
    expect(client.projectId).toBeNull();
    expectTypeOf(client.events.retrieve).returns.resolves.toHaveProperty(
      "data",
    );

    const project = client.project("project/one");
    expect(project.owner).toBe("project");
    expect(project.projectId).toBe("project/one");
    expectTypeOf<
      Awaited<ReturnType<typeof project.events.retrieve>>["data"]
    >().toEqualTypeOf<ProjectEvent>();
    expectTypeOf<
      Awaited<ReturnType<typeof client.events.retrieve>>["data"]
    >().toEqualTypeOf<OrganizationEvent>();

    await client.events.retrieve("event/org");
    await project.events.retrieve("event/project");
    expect(requests.map(({ path }) => path)).toEqual([
      "/platform/events/event%2Forg",
      "/platform/projects/project%2Fone/events/event%2Fproject",
    ]);
  });

  it("requires explicit project binding and rejects listener credentials before fetch", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(
      () =>
        new (Client as unknown as new (options: unknown) => Client<"project">)({
          credential: {
            type: "projectToken",
            value: PROJECT_TOKEN,
          },
          projectId: undefined,
          fetch,
        }),
    ).toThrow(PolymorfaConfigurationError);
    expect(
      () =>
        new Client({
          credential: { type: "organizationApiKey", value: "pmfa_ls_once" },
          fetch,
        }),
    ).toThrow(PolymorfaConfigurationError);
    expect(
      () =>
        new MessagingClient({
          credential: { type: "apiKey", value: "pmfa_ls_once" },
          fetch,
        }),
    ).toThrow(PolymorfaConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed keys and special-purpose tickets before fetch", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const invalidOrganizationKeys = [
      `pmfa_at_${"A".repeat(69)}`,
      `pmfa_wst_${"A".repeat(68)}`,
      `pmfa_sd_${"A".repeat(69)}`,
      `pmfa_${"A".repeat(71)}`,
      `pmfa_${"A".repeat(73)}`,
      `pmfa_${"A".repeat(71)}+`,
    ];

    for (const value of invalidOrganizationKeys) {
      expect(
        () =>
          new Client({
            credential: { type: "organizationApiKey", value },
            fetch,
          }),
      ).toThrow(PolymorfaConfigurationError);
      expect(
        () =>
          new MessagingClient({
            credential: { type: "apiKey", value },
            fetch,
          }),
      ).toThrow(PolymorfaConfigurationError);
    }

    for (const value of [
      `pmfa_pt_${"A".repeat(93)}`,
      `pmfa_pt_${"A".repeat(95)}`,
      `pmfa_pt_${"A".repeat(93)}+`,
      `pmfa_pt_${"A".repeat(93)}B`,
    ]) {
      expect(
        () =>
          new Client({
            credential: { type: "projectToken", value },
            projectId: "project_1",
            fetch,
          }),
      ).toThrow(PolymorfaConfigurationError);
    }

    expect(fetch).not.toHaveBeenCalled();
  });

  it("treats an explicitly undefined organization projectId as unscoped", () => {
    const client = new (Client as unknown as new (options: unknown) => Client)({
      credential: {
        type: "organizationApiKey",
        value: ORGANIZATION_API_KEY,
      },
      projectId: undefined,
    });

    expect(client.owner).toBe("organization");
    expect(client.projectId).toBeNull();
  });

  it("rejects a second project binding for an opaque project token before fetch", async () => {
    const { client, requests } = await testClient("project_1");
    expect(client.project("project_1")).toBe(client);
    expect(() => client.project("project_2")).toThrow(
      PolymorfaConfigurationError,
    );
    expect(requests).toEqual([]);
  });
});

describe("project raw confinement", () => {
  it("prefixes safe relative paths and rejects escape attempts before fetch", async () => {
    const { client, requests } = await testClient("project/a");
    await client.raw.request({ method: "GET", path: "/custom" });
    expect(requests[0]?.path).toBe("/platform/projects/project%2Fa/custom");

    for (const path of [
      "https://evil.test/x",
      "//evil.test/x",
      "/../events",
      "/platform/projects/project_2/events",
      "/\\evil.test/x",
    ]) {
      await expect(
        client.raw.request({ method: "GET", path }),
      ).rejects.toBeInstanceOf(PolymorfaValidationError);
    }
    await expect(
      client.raw.request({
        method: "GET",
        path: "/events",
        headers: { Authorization: "Bearer stolen" },
      }),
    ).rejects.toBeInstanceOf(PolymorfaValidationError);
    expect(requests).toHaveLength(1);
  });
});

describe("durable developer resources", () => {
  it("uses exact project routes for events, deliveries, attempts, and operations", async () => {
    const { client, requests } = await testClient("project/a");
    await client.events.list({ type: "message.received", limit: 10 });
    await client.events.replay(
      "event/a",
      { webhookId: "webhook/a" },
      { idempotencyKey: "replay-1" },
    );
    await client.webhookDeliveries.retrieveAttempt("delivery/a", "attempt/a");
    await client.operations.listTransitions("operation/a", {
      afterSequence: 4,
    });
    await client.operations.cancel("operation/a", {
      idempotencyKey: "cancel-1",
    });

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/projects/project%2Fa/events?type=message.received&limit=10",
      "POST /platform/projects/project%2Fa/events/event%2Fa/replays",
      "GET /platform/projects/project%2Fa/webhook-deliveries/delivery%2Fa/attempts/attempt%2Fa",
      "GET /platform/projects/project%2Fa/operations/operation%2Fa/transitions?afterSequence=4",
      "POST /platform/projects/project%2Fa/operations/operation%2Fa/cancel",
    ]);
    expect(requests[1]?.body).toBe('{"webhookId":"webhook/a"}');
    expect(requests[1]?.headers["idempotency-key"]).toBe("replay-1");
  });
});

describe("QuickLink settings", () => {
  it("binds settings reads and updates to the client ownership context", async () => {
    const { client, requests } = await testClient();
    if (client.owner !== "organization") throw new Error("unexpected owner");
    const project = client.project("project/a");

    expectTypeOf<
      Awaited<ReturnType<typeof client.quickLinkSettings.retrieve>>["data"]
    >().toEqualTypeOf<OrganizationQuickLinkSettings | null>();
    expectTypeOf<
      Awaited<ReturnType<typeof project.quickLinkSettings.retrieve>>["data"]
    >().toEqualTypeOf<ProjectQuickLinkSettings | null>();

    await client.quickLinkSettings.retrieve({ apiVersion: "1.0.0" });
    await project.quickLinkSettings.retrieve();
    await client.quickLinkSettings.update(
      { enabled: true, methods: ["qr", "pairing"] },
      { idempotencyKey: "quicklink-org-1" },
    );
    await project.quickLinkSettings.update(
      {
        headline: "Connect your number",
        defaultMethod: "qr",
        allowPhoneChange: false,
        hideWatermark: false,
        connectionPreference: "cloud",
        connectionEnforcement: "prefer",
        successCallbackUrl: "https://example.com/connected",
        failureCallbackUrl: "https://example.com/failed",
      },
      { idempotencyKey: "quicklink-project-1" },
    );

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/quicklink",
      "GET /platform/quicklink?projectId=project%2Fa",
      "PUT /platform/quicklink",
      "PUT /platform/quicklink",
    ]);
    expect(requests[0]?.headers["polymorfa-version"]).toBe("1.0.0");
    expect(requests[2]?.body).toBe(
      '{"enabled":true,"methods":["qr","pairing"]}',
    );
    expect(requests[3]?.body).toBe(
      '{"headline":"Connect your number","defaultMethod":"qr","allowPhoneChange":false,"hideWatermark":false,"connectionPreference":"cloud","connectionEnforcement":"prefer","successCallbackUrl":"https://example.com/connected","failureCallbackUrl":"https://example.com/failed","projectId":"project/a"}',
    );
    expect(requests[2]?.headers["idempotency-key"]).toBe("quicklink-org-1");
    expect(requests[3]?.headers["idempotency-key"]).toBe("quicklink-project-1");
  });
});
