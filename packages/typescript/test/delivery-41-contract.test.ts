import { afterEach, expect, it, vi } from "vitest";
import {
  Client,
  MessagingClient,
  PolymorfaConfigurationError,
  PolymorfaServerError,
} from "../src/index.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
const projectId = "018f0000-0000-7000-8000-000000000001";
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
it("selects delivery intent versions without changing legacy reset or explicit versions", async () => {
  const server = await startTestServer(() => ({ body: '{"data":{}}' }));
  servers.push(server);
  const c = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  }).project(projectId);
  await c.sessionConfiguration.update({
    configuration: { set: { historySync: { delivery: "descriptor" } } },
    revision: 0,
  } as never);
  await c.sessionConfiguration.update({
    configuration: { reset: ["historySync"] },
    revision: 0,
  });
  await c.sessionConfiguration.update(
    {
      configuration: { reset: ["historySync.delivery"] },
      revision: 0,
    } as never,
    { apiVersion: "2026-09-22" },
  );
  expect(server.requests.map((r) => r.headers["polymorfa-version"])).toEqual([
    "2026-10-14",
    "2026-09-22",
    "2026-09-22",
  ]);
  expect(JSON.parse(server.requests[0]!.body)).toEqual({
    projectId,
    revision: 0,
    configuration: { set: { historySync: { delivery: "descriptor" } } },
  });
});
it("keeps QuickLink omission, explicit modes and descriptor consent distinct", async () => {
  const server = await startTestServer(() => ({
    body: '{"success":true,"data":{"purpose":"initial","connectionGoal":"single","id":"link","url":"https://example.test/link","session":"session","expiresAt":null}}',
  }));
  servers.push(server);
  const m = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  await m.quickLinks.create();
  await m.quickLinks.create({ signalMode: "standard" });
  await m.quickLinks.create({
    signalMode: "zero_knowledge",
    configuration: {
      historySync: {
        consent: "force_off",
        delivery: "descriptor",
        requestFull: false,
      },
    },
  });
  await m.quickLinks.create(
    { configuration: { historySync: { delivery: "descriptor" } } },
    { apiVersion: "2026-09-22" },
  );
  expect(server.requests.map((r) => r.headers["polymorfa-version"])).toEqual([
    "2026-09-22",
    "2026-10-14",
    "2026-10-14",
    "2026-09-22",
  ]);
  expect(JSON.parse(server.requests[0]!.body)).toEqual({});
  expect(JSON.parse(server.requests[2]!.body)).toEqual({
    signalMode: "zero_knowledge",
    configuration: {
      historySync: {
        consent: "force_off",
        delivery: "descriptor",
        requestFull: false,
      },
    },
  });
});
it("rejects archive writes, nested custody aliases and supplementary custody before I/O", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const m = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    fetch,
  });
  const c = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    fetch,
  }).project(projectId);
  const calls = [
    () =>
      c.sessionConfiguration.update({
        configuration: { set: { historySync: { delivery: "archive" } } },
        revision: 0,
      } as never),
    () =>
      m.quickLinks.create({
        configuration: { signalMode: "zero_knowledge" },
      } as never),
    () =>
      m.quickLinks.create({
        purpose: "add_connection",
        session: "x",
        addConnection: "official_api",
        signalMode: "standard",
      } as never),
  ];
  for (const call of calls)
    expect(
      await Promise.resolve()
        .then((): Promise<unknown> => call())
        .catch((e) => e),
    ).toBeInstanceOf(PolymorfaConfigurationError);
  expect(fetch).not.toHaveBeenCalled();
});
it("refuses Client direct upload before reading input, keeps relay and custom transport available", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(
      new Response(
        '{"success":true,"data":{"directPath":"/x","url":"https://cdn.whatsapp.net/x"}}',
        { headers: { "content-type": "application/json" } },
      ),
    );
  const m = new MessagingClient({
    credential: { type: "clientToken", value: "pmfa_ct_synthetic" },
    fetch,
  });
  const open = vi.fn(
    () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([1]));
          c.close();
        },
      }),
  );
  await expect(
    m.whatsappMedia.upload(
      "s",
      { open },
      { mediaType: "image", egress: "direct" },
    ),
  ).rejects.toBeInstanceOf(PolymorfaConfigurationError);
  expect(open).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(() => m.whatsappMedia.transport("direct")).toThrow(
    PolymorfaConfigurationError,
  );
  for (const invalid of [undefined, null, "invalid"])
    expect(() => m.whatsappMedia.transport(invalid as never)).toThrow(
      PolymorfaConfigurationError,
    );
  await m.whatsappMedia.upload("s", new Uint8Array([1]), {
    mediaType: "image",
    egress: "relay",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const custom = {
    name: "customer",
    async upload(
      _session: string,
      body: import("../src/index.js").WhatsAppEncryptedUploadBody,
    ) {
      const reader = (await body.open()).getReader();
      while (!(await reader.read()).done) {
        /* Consume the encrypted body only. */
      }
      return { directPath: "/custom", url: "https://example.test/custom" };
    },
  };
  expect(
    (
      await m.whatsappMedia.upload("s", new Uint8Array([1]), {
        mediaType: "image",
        egress: custom,
      })
    ).egress,
  ).toBe("customer");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("validates canonical history success and server credentials", async () => {
  const server = await startTestServer(() => ({
    body: '{"success":false,"data":{"requestId":"private","status":"requested"}}',
  }));
  servers.push(server);
  const m = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  await expect(
    m.historySync.requestChunkRetry("s", {
      syncType: "RECENT",
      chunkOrder: 0,
      regenerate: false,
    }),
  ).rejects.toBeInstanceOf(PolymorfaServerError);
  const browser = new MessagingClient({
    credential: { type: "clientToken", value: "pmfa_ct_synthetic" },
    baseUrl: server.url,
  });
  expect(
    await Promise.resolve()
      .then(() =>
        browser.historySync.requestChunkRetry("s", {
          syncType: "RECENT",
          chunkOrder: 0,
        }),
      )
      .catch((e) => e),
  ).toBeInstanceOf(PolymorfaConfigurationError);
  expect(server.requests).toHaveLength(1);
});

it("submits keyed history commands once with call-time wire bytes", async () => {
  // These routes have no server replay ledger, so a caller key and retry
  // option must not repeat an uncertain phone command.
  const retry = {
    syncType: "RECENT" as const,
    chunkOrder: 0,
    regenerate: false,
  };
  const deletion = {
    directPath: "/original",
    fileEncSha256: "A".repeat(43) + "=",
  };
  const server = await startTestServer((_request, index) => {
    if (index === 0) {
      retry.chunkOrder = 9;
      retry.regenerate = true;
    } else deletion.directPath = "/changed";
    return { status: 503, body: '{"error":{"code":"service_unavailable"}}' };
  });
  servers.push(server);
  const m = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const options = {
    idempotencyKey: "caller-key",
    maxNetworkRetries: 1,
    apiVersion: "2026-10-14",
  };
  const failure = { status: 503, metadata: { attempts: 1 } };
  const retried = m.historySync.requestChunkRetry("s", retry, options);
  await expect(retried).rejects.toBeInstanceOf(PolymorfaServerError);
  await expect(retried).rejects.toMatchObject(failure);
  expect(server.requests).toHaveLength(1);
  const deleted = m.historySync.deleteChunk("s", deletion, options);
  await expect(deleted).rejects.toBeInstanceOf(PolymorfaServerError);
  await expect(deleted).rejects.toMatchObject(failure);
  expect(server.requests).toHaveLength(2);
  expect(JSON.parse(server.requests[0]!.body)).toEqual({
    syncType: "RECENT",
    chunkOrder: 0,
    regenerate: false,
  });
  expect(JSON.parse(server.requests[1]!.body).directPath).toBe("/original");
  expect(
    server.requests.every(
      (r) =>
        r.headers["idempotency-key"] === "caller-key" &&
        r.headers["polymorfa-version"] === "2026-10-14",
    ),
  ).toBe(true);
});

it("retains A/B configuration owners through interleaved reads, writes and caller mutation", async () => {
  const otherId = "018f0000-0000-7000-8000-000000000002";
  const server = await startTestServer(() => ({ body: '{"data":{}}' }));
  servers.push(server);
  const c = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const a = c.project(projectId).sessionConfiguration,
    b = c.project(otherId).sessionConfiguration;
  await a.retrieve({ apiVersion: "2026-10-14" });
  await b.update({
    revision: 0,
    configuration: { set: { historySync: { delivery: "descriptor" } } },
  });
  await b.retrieve({ apiVersion: "2026-10-14" });
  await a.update({
    revision: 0,
    configuration: { reset: ["historySync.delivery"] },
  });
  expect(
    server.requests.map((r) =>
      r.method === "GET"
        ? new URL(r.path, server.url).searchParams.get("projectId")
        : JSON.parse(r.body).projectId,
    ),
  ).toEqual([projectId, otherId, otherId, projectId]);
  expect(Object.isFrozen(a)).toBe(true);
  expect(Object.isFrozen(b)).toBe(true);
  expect(() => Object.assign(a, { projectId: otherId })).toThrow(TypeError);
  expect(() =>
    a.update({
      revision: 0,
      configuration: { reset: ["historySync.delivery"] },
      projectId: otherId,
    } as never),
  ).toThrow(PolymorfaConfigurationError);
  expect(server.requests).toHaveLength(4);
});

it("retains old and new configuration reads, requested/effective divergence and optional session custody facts", async () => {
  const observation = {
    presenceMode: "off",
    typingMode: "off",
    labelMode: "off",
    quickReplyMode: "off",
  };
  const server = await startTestServer((request) => {
    const current = request.headers["polymorfa-version"] === "2026-10-14";
    const delivery = current ? { delivery: "descriptor" } : {};
    const configuration = {
      effective: {
        observation,
        historySync: { mode: "metadata_only", requestFull: false, ...delivery },
        hms: { enabled: false },
      },
      requestedHistory: { mode: "deliver", requestFull: true, ...delivery },
      historyConsent: "declined",
      overrides: current ? { historySync: delivery } : {},
      sources: {
        "historySync.mode": "consent",
        "historySync.requestFull": "consent",
        ...(current ? { "historySync.delivery": "platform" } : {}),
        hms: "platform",
        "observation.presenceMode": "platform",
        "observation.typingMode": "platform",
        "observation.labelMode": "platform",
        "observation.quickReplyMode": "platform",
      },
      revisions: { team: 0, project: 0, session: 0 },
    };
    const session = {
      sessionId: projectId,
      name: "Synthetic Number",
      tenantId: projectId,
      type: "linked_device",
      testMode: true,
      status: "connected",
      createdAt: "2026-10-14T00:00:00Z",
      updatedAt: "2026-10-14T00:00:00Z",
      configuration,
      ...(current ? { signalMode: "zero_knowledge" } : {}),
    };
    return {
      body: JSON.stringify(
        request.path.includes("session-configuration")
          ? { data: configuration }
          : { success: true, data: session },
      ),
    };
  });
  servers.push(server);
  const c = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const legacy = (await c.project(projectId).sessionConfiguration.retrieve())
    .data;
  const current = (
    await c
      .project(projectId)
      .sessionConfiguration.retrieve({ apiVersion: "2026-10-14" })
  ).data;
  expect(legacy.requestedHistory).not.toHaveProperty("delivery");
  expect(current.requestedHistory).toEqual({
    mode: "deliver",
    requestFull: true,
    delivery: "descriptor",
  });
  expect(current.effective.historySync).toEqual({
    mode: "metadata_only",
    requestFull: false,
    delivery: "descriptor",
  });
  expect(current.sources["historySync.delivery"]).toBe("platform");
  expect(
    (await c.sessions.retrieve(projectId)).data.data.signalMode,
  ).toBeUndefined();
  expect(
    (await c.sessions.retrieve(projectId, { apiVersion: "2026-10-14" })).data
      .data.signalMode,
  ).toBe("zero_knowledge");
  const updated = await c.sessions.update(projectId, {
    revision: 0,
    configuration: { set: { historySync: { delivery: "descriptor" } } },
  });
  expect(updated.data.data.configuration?.requestedHistory.requestFull).toBe(
    true,
  );
  expect(server.requests.at(-1)!.headers["polymorfa-version"]).toBe(
    "2026-10-14",
  );
  expect(JSON.parse(server.requests.at(-1)!.body).revision).toBe(0);
  for (const extra of [
    { signalMode: "standard" },
    { configuration: { set: { signalMode: "zero_knowledge" } } },
  ])
    expect(() =>
      c.sessions.update(projectId, {
        revision: 0,
        configuration: {},
        ...extra,
      } as never),
    ).toThrow(PolymorfaConfigurationError);
  expect(server.requests).toHaveLength(5);
});

it("rejects history command enum, uint32, null and hash violations before I/O", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const m = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    fetch,
  });
  const retry = { syncType: "RECENT", chunkOrder: 0 };
  for (const patch of [
    { syncType: "FUTURE" },
    { chunkOrder: -1 },
    { chunkOrder: 4294967296 },
    { regenerate: null },
    { chunkMessageId: null },
    { chunkMessageId: "x".repeat(129) },
  ])
    await expect(
      m.historySync.requestChunkRetry("s", { ...retry, ...patch } as never),
    ).rejects.toBeInstanceOf(PolymorfaConfigurationError);
  for (const patch of [
    { directPath: "not-absolute" },
    { fileEncSha256: "A".repeat(43) },
    { encHandle: null },
    { extra: true },
  ])
    await expect(
      m.historySync.deleteChunk("s", {
        directPath: "/valid",
        fileEncSha256: "A".repeat(43) + "=",
        ...patch,
      } as never),
    ).rejects.toBeInstanceOf(PolymorfaConfigurationError);
  expect(fetch).not.toHaveBeenCalled();
});
