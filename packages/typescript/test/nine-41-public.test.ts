import { createHmac } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import {
  Client,
  MessagingClient,
  PolymorfaConfigurationError,
  PolymorfaValidationError,
  PolymorfaServerError,
  constructWebhookEvent,
  isEvent,
  type DirectHistorySyncPayload,
  type HistorySyncPayload,
} from "../src/index.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
const projectId = "018f0000-0000-7000-8000-000000000001",
  otherId = "018f0000-0000-7000-8000-000000000002";
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
it("checks bare testing-phone results and actual202 through native HTTP", async () => {
  const fixtures = [
    {
      session: "s/a",
      phone: "+15551234567",
      online: false,
      devices: [{ deviceId: 99 }],
    },
    { session: "s/a", to: "+15551234568", messageId: null },
    { session: "s/a", deviceId: 99, unlinked: true },
  ];
  const server = await startTestServer((_request, index) => ({
    status: index === 1 ? 202 : 200,
    headers: {
      "content-type": "application/json",
      "x-trace-id": "a".repeat(32),
    },
    body: JSON.stringify(index < 3 ? fixtures[index] : {}),
  }));
  servers.push(server);
  const m = new MessagingClient({
    credential: { type: "projectToken", value: PROJECT_TOKEN },
    baseUrl: server.url,
  });
  expect((await m.testing.getPhone(projectId, "s/a")).data).toEqual(
    fixtures[0],
  );
  expect(
    (
      await m.testing.sendPhoneMessage(projectId, "s/a", {
        to: "+15551234568",
        text: "x",
      })
    ).metadata.status,
  ).toBe(202);
  expect(
    (await m.testing.unlinkPhoneDevice(projectId, "s/a", 99)).data,
  ).toEqual(fixtures[2]);
  expect(server.requests.map((r) => [r.method, r.path, r.body])).toEqual([
    ["GET", `/messaging/testing/${projectId}/numbers/s%2Fa/phone`, ""],
    [
      "POST",
      `/messaging/testing/${projectId}/numbers/s%2Fa/phone/messages`,
      '{"to":"+15551234568","text":"x"}',
    ],
    [
      "POST",
      `/messaging/testing/${projectId}/numbers/s%2Fa/phone/devices/99/unlink`,
      "",
    ],
  ]);
  await expect(m.testing.getPhone(projectId, "s/a")).rejects.toMatchObject({
    code: "invalid_response",
    metadata: { headers: { "x-trace-id": "a".repeat(32) } },
  });
});
it("keeps supported Client group authority and refuses malformed capability envelopes", async () => {
  const data = {
    status: "unknown",
    syncedAt: null,
    checkedAt: null,
    capabilities: [
      {
        key: "polls.endTime",
        kind: "feature",
        unit: null,
        value: null,
        source: null,
      },
    ],
  };
  const server = await startTestServer((_request, index) => ({
    body: JSON.stringify(
      index === 0 ? { success: true, data } : { success: false, data },
    ),
  }));
  servers.push(server);
  const m = new MessagingClient({
    credential: { type: "clientToken", value: "pmfa_ct_c3ludGhldGlj" },
    baseUrl: server.url,
  });
  expect(
    (await m.groups.getCapabilities("s/a", "9999999999999999999")).data.data,
  ).toEqual(data);
  await expect(
    m.groups.getCapabilities("s/a", "9999999999999999999"),
  ).rejects.toBeInstanceOf(PolymorfaServerError);
});
it("retains simultaneous A/B request-log views, cursors and large string identities", async () => {
  const server = await startTestServer((request) => {
    const selected = request.path.includes(otherId) ? otherId : projectId;
    return {
      body: JSON.stringify({
        data: [
          {
            id: "9999999999999999999",
            projectId: selected,
            createdAt: "2026-10-14T00:00:00Z",
            method: "GET",
            route: "/fixture",
            status: 200,
            durationMs: 0,
            result: "success",
            source: "api",
            requestId: null,
            traceId: null,
            errorCode: null,
            mcpTool: null,
            credential: { type: "project_token", id: selected, last4: null },
          },
        ],
        page: { nextCursor: null, hasMore: false, followCursor: "next" },
      }),
    };
  });
  servers.push(server);
  const c = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const a = c.project(projectId),
    b = c.project(otherId);
  for (const view of [a, b, a])
    expect((await view.requestLogs.list()).items[0]?.id).toBe(
      "9999999999999999999",
    );
  expect(server.requests.map((r) => r.path)).toEqual(
    [projectId, otherId, projectId].map(
      (id) => `/platform/projects/${id}/request-logs`,
    ),
  );
  await expect(
    a.requestLogs.list({ projectId: otherId }),
  ).rejects.toBeInstanceOf(PolymorfaValidationError);
  expect(server.requests).toHaveLength(3);
});
it("exports the projected descriptor union alongside archive/Cloud and verifies exact signed public events", async () => {
  const common = {
    delivery: "descriptor" as const,
    whatsapp_ids: { linked_devices: "notification" },
    original_whatsapp_ids: { linked_devices: "original" },
    syncType: "FUTURE_PROVIDER_TYPE",
    chunkOrder: 0,
    progress: 0,
    fileLength: 0,
    oldestMessageAt: "2026-10-14T00:00:00.000Z",
  };
  const inline: DirectHistorySyncPayload = {
    ...common,
    inline: { encoding: "zlib-base64-protobuf", data: "eA==" },
  };
  const media: DirectHistorySyncPayload = {
    ...common,
    fileLength: 1,
    media: {
      type: "md-msg-hist",
      directPath: "/history",
      mediaKey: "key",
      fileSha256: "hash",
      fileEncSha256: "encrypted",
    },
  };
  const archive: HistorySyncPayload = {
    whatsapp_ids: { linked_devices: "archive" },
    messages: [],
    mode: "deliver",
    syncType: "RECENT",
    fileLength: 0,
    conversationCount: 0,
    messageCount: 0,
    pushNameCount: 0,
    statusMessageCount: 0,
    whatsapp: { encoding: "gzip-base64-protobuf", data: "H4s=" },
  };
  const cloud: HistorySyncPayload = { kind: "history", value: {} };
  // @ts-expect-error descriptor branches are exclusive
  const both: DirectHistorySyncPayload = { ...inline, media: media.media };
  // @ts-expect-error a descriptor must contain media or inline
  const neither: DirectHistorySyncPayload = common;
  expect(both).toBeDefined();
  expect(neither).toBeDefined();
  for (const payload of [inline, media, archive, cloud]) {
    const raw = JSON.stringify({
      id: projectId,
      session: "s",
      timestamp: "2026-10-14T00:00:00Z",
      event: "history.sync",
      payload,
    });
    const event = await constructWebhookEvent(
      raw,
      createHmac("sha256", "fixture").update(raw).digest("hex"),
      "fixture",
    );
    expect(event.payload).toEqual(payload);
    if (isEvent(event, "history.sync") && "delivery" in event.payload) {
      expect(event.payload.whatsapp_ids.linked_devices).toBe("notification");
      if (event.payload.media)
        expect(event.payload.media.type).toBe("md-msg-hist");
    }
  }
});

it("sends independent hand-authored sticker descriptors with exact IDs, versions and animation flags", async () => {
  const server = await startTestServer(() => ({
    body: '{"success":true,"data":{"id":"9999999999999999999"}}',
  }));
  servers.push(server);
  const m = new MessagingClient({
    credential: { type: "projectToken", value: PROJECT_TOKEN },
    baseUrl: server.url,
  });
  const descriptor = {
    directPath: "/sticker",
    url: "https://cdn.whatsapp.net/sticker",
    mediaKey: "A".repeat(43) + "=",
    fileSha256: "B".repeat(42) + "A=",
    fileEncSha256: "C".repeat(42) + "A=",
    fileLength: 1,
    mimeType: "image/webp",
    width: 1,
    height: 65536,
    mediaKeyTimestamp: 1,
    isAnimated: false,
  };
  for (const isAnimated of [false, true]) {
    const body = {
      conversation: { phoneNumber: "+15551234567" },
      content: { sticker: { descriptor: { ...descriptor, isAnimated } } },
    };
    expect(
      (
        await m.messages.send(
          "s/a",
          body,
          isAnimated ? { apiVersion: "2026-09-22" } : {},
        )
      ).data.data.id,
    ).toBe("9999999999999999999");
    expect(JSON.parse(server.requests.at(-1)!.body)).toEqual(body);
  }
  expect(server.requests.map((r) => r.headers["polymorfa-version"])).toEqual([
    "2026-10-14",
    "2026-09-22",
  ]);
  for (const invalid of [
    { mimeType: "image/png" },
    { mediaKey: "short" },
    { height: undefined },
    { width: 0 },
    { isAnimated: null },
    { seconds: 1 },
    { fileLength: 0 },
  ]) {
    expect(
      await Promise.resolve()
        .then(() =>
          m.messages.send("s/a", {
            conversation: { phoneNumber: "+15551234567" },
            content: { sticker: { descriptor: { ...descriptor, ...invalid } } },
          } as never),
        )
        .catch((e) => e),
    ).toBeInstanceOf(PolymorfaConfigurationError);
  }
  expect(server.requests).toHaveLength(2);
});

it("captures descriptor send recipient and bytes before caller-key replay", async () => {
  const descriptor = {
    directPath: "/sticker",
    url: "https://cdn.whatsapp.net/sticker",
    mediaKey: "A".repeat(43) + "=",
    fileSha256: "B".repeat(42) + "A=",
    fileEncSha256: "C".repeat(42) + "A=",
    fileLength: 1,
    mimeType: "image/webp",
    isAnimated: false,
  };
  const body = {
    conversation: { phoneNumber: "+15551234567" },
    content: { sticker: { descriptor } },
  };
  const server = await startTestServer((_request, index) => {
    if (index === 0) {
      descriptor.isAnimated = true;
      body.conversation.phoneNumber = "+15551234568";
      return { status: 503, body: '{"error":{"code":"service_unavailable"}}' };
    }
    return { body: '{"success":true,"data":{"id":"9999999999999999999"}}' };
  });
  servers.push(server);
  const m = new MessagingClient({
    credential: { type: "projectToken", value: PROJECT_TOKEN },
    baseUrl: server.url,
  });
  expect(
    (
      await m.messages.send("s/a", body, {
        idempotencyKey: "caller-descriptor",
        maxNetworkRetries: 1,
      })
    ).data.data.id,
  ).toBe("9999999999999999999");
  expect(server.requests).toHaveLength(2);
  expect(server.requests[0]!.body).toBe(server.requests[1]!.body);
  expect(JSON.parse(server.requests[1]!.body).conversation.phoneNumber).toBe(
    "+15551234567",
  );
  expect(
    server.requests.map((r) => [
      r.path,
      r.headers["idempotency-key"],
      r.headers["polymorfa-version"],
    ]),
  ).toEqual(
    Array.from({ length: 2 }, () => [
      "/messaging/s%2Fa/messages/send",
      "caller-descriptor",
      "2026-10-14",
    ]),
  );
});
