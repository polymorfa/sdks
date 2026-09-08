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
            credential: { type: "organizationApiKey", value: "pmfa_org" },
          })
        : new Client({
            ...shared,
            credential: { type: "projectToken", value: "pmfa_pt_project" },
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
      "/v1/events/event%2Forg",
      "/v1/projects/project%2Fone/events/event%2Fproject",
    ]);
  });

  it("requires explicit project binding and rejects listener credentials before fetch", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(
      () =>
        new (Client as unknown as new (options: unknown) => Client<"project">)({
          credential: { type: "projectToken", value: "pmfa_pt_project" },
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
    expect(requests[0]?.path).toBe("/v1/projects/project%2Fa/custom");

    for (const path of [
      "https://evil.test/x",
      "//evil.test/x",
      "/../events",
      "/v1/projects/project_2/events",
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
      "GET /v1/projects/project%2Fa/events?type=message.received&limit=10",
      "POST /v1/projects/project%2Fa/events/event%2Fa/replays",
      "GET /v1/projects/project%2Fa/webhook-deliveries/delivery%2Fa/attempts/attempt%2Fa",
      "GET /v1/projects/project%2Fa/operations/operation%2Fa/transitions?afterSequence=4",
      "POST /v1/projects/project%2Fa/operations/operation%2Fa/cancel",
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
      { headline: "Connect your number", defaultMethod: "qr" },
      { idempotencyKey: "quicklink-project-1" },
    );

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/quicklink",
      "GET /v1/quicklink?projectId=project%2Fa",
      "PUT /v1/quicklink",
      "PUT /v1/quicklink",
    ]);
    expect(requests[0]?.headers["polymorfa-version"]).toBe("1.0.0");
    expect(requests[2]?.body).toBe(
      '{"enabled":true,"methods":["qr","pairing"]}',
    );
    expect(requests[3]?.body).toBe(
      '{"headline":"Connect your number","defaultMethod":"qr","projectId":"project/a"}',
    );
    expect(requests[2]?.headers["idempotency-key"]).toBe("quicklink-org-1");
    expect(requests[3]?.headers["idempotency-key"]).toBe("quicklink-project-1");
  });
});
