import { createHmac } from "node:crypto";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  Client,
  MessagingClient,
  constructWebhookDelivery,
  constructWebhookEvent,
  isWebhookEventBatch,
  webhooks,
  type ContactUpdatePayload,
  type IncomingOrderCart,
  type HistoryMessage,
  type WebhookPayloadMap,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
async function setup(
  status = 200,
  data: unknown = { success: true, data: {} },
) {
  const server = await startTestServer(() => ({
    status,
    body: JSON.stringify(data),
  }));
  servers.push(server);
  const client = new MessagingClient({
    baseUrl: server.url,
    credential: { type: "projectToken", value: PROJECT_TOKEN },
    maxNetworkRetries: 2,
  });
  return { server, client };
}
const event = {
  id: "evt-1",
  session: "support",
  timestamp: "2026-10-21T10:00:00Z",
  event: "message.received",
  payload: {},
};
const batch = {
  object: "event_batch",
  version: 1,
  id: "00000000-0000-4000-8000-000000000001",
  events: [event],
};
async function decode(value: unknown) {
  const raw = JSON.stringify(value);
  return constructWebhookDelivery(
    raw,
    createHmac("sha256", "secret").update(raw).digest("hex"),
    "secret",
  );
}

describe("round-2 customer routes", () => {
  it("uses native catalog routes and opaque IDs/cursors, separate from Graph reads", async () => {
    const { client, server } = await setup();
    await client.catalogs.list("number/eu");
    await client.catalogs.retrieve(
      "number/eu",
      "12345678901234567890123456789012",
    );
    await client.catalogs.sync("number/eu", "123");
    await client.catalogs.listProducts("number/eu", "123", {
      limit: 100,
      cursor: "opaque_-",
    });
    await client.cloudMarketing.getStatus("number/eu");
    await client.contacts.block("number/eu", "123");
    await client.contacts.unblock("number/eu", "123");
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /messaging/number%2Feu/catalogs",
      "GET /messaging/number%2Feu/catalogs/12345678901234567890123456789012",
      "POST /messaging/number%2Feu/catalogs/123/sync",
      "GET /messaging/number%2Feu/catalogs/123/products?limit=100&cursor=opaque_-",
      "GET /messaging/number%2Feu/marketing-messages/status",
      "POST /messaging/number%2Feu/contacts/123/block",
      "POST /messaging/number%2Feu/contacts/123/unblock",
    ]);
  });
  it("rejects invalid bounds and client credentials before transport", async () => {
    const { client, server } = await setup();
    expect(() => client.catalogs.retrieve("support", "../123")).toThrow(
      "1 to 32 digits",
    );
    expect(() =>
      client.catalogs.listProducts("support", "123", { limit: 101 }),
    ).toThrow("1 to 100");
    expect(() =>
      client.catalogs.listProducts("support", "123", { cursor: "../" }),
    ).toThrow("nextCursor");
    expect(() => client.cloudMarketing.getStatus("")).toThrow("Number ID");
    const browser = new MessagingClient({
      baseUrl: server.url,
      credential: { type: "clientToken", value: `pmfa_ct_${"A".repeat(94)}` },
    });
    expect(() => browser.catalogs.list("support")).toThrow(
      "organization API key",
    );
    expect(() => browser.cloudMarketing.getStatus("support")).toThrow(
      "organization API key",
    );
    expect(server.requests).toHaveLength(0);
  });
  it("surfaces feature_unavailable for every new native read/write without fallback", async () => {
    const { client, server } = await setup(403, {
      error: { code: "feature_unavailable", message: "Beta unavailable" },
    });
    const calls = [
      () => client.catalogs.list("n"),
      () => client.catalogs.retrieve("n", "1"),
      () => client.catalogs.sync("n", "1"),
      () => client.catalogs.listProducts("n", "1"),
      () => client.cloudMarketing.getStatus("n"),
      () =>
        client.officialGroups.setPicture(
          "n",
          "1",
          new Blob(["jpeg"], { type: "image/jpeg" }),
        ),
    ];
    for (const call of calls)
      await expect(call()).rejects.toMatchObject({
        status: 403,
        code: "feature_unavailable",
      });
    expect(server.requests).toHaveLength(calls.length);
  });
  it.each(["catalog_sync_cooldown", "upstream_failure"])(
    "never replays an explicit sync after %s, even with an idempotency key",
    async (code) => {
      const { client, server } = await setup(
        code === "catalog_sync_cooldown" ? 429 : 502,
        { error: { code, message: code } },
      );
      await expect(
        client.catalogs.sync("n", "1", {
          idempotencyKey: "sync-1",
          maxNetworkRetries: 4,
        }),
      ).rejects.toMatchObject({ code });
      expect(server.requests).toHaveLength(1);
    },
  );
  it("uploads the Official picture as multipart bytes and never sends a JSON file object", async () => {
    const { client, server } = await setup();
    await client.officialGroups.setPicture(
      "n/eu",
      "g/1",
      new Blob(["jpeg-fixture"], { type: "image/jpeg" }),
    );
    const request = server.requests[0]!;
    expect(request.method).toBe("PUT");
    expect(request.path).toBe(
      "/messaging/n%2Feu/official-groups/g%2F1/picture",
    );
    expect(request.headers["content-type"]).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    expect(request.body).toContain('name="file"; filename="picture.jpg"');
    expect(request.body).toContain("Content-Type: image/jpeg");
    expect(request.body).toContain("jpeg-fixture");
    expect(() =>
      client.officialGroups.setPicture(
        "n",
        "g",
        new Blob([], { type: "image/jpeg" }),
      ),
    ).toThrow("JPEG");
    expect(() =>
      client.officialGroups.setPicture(
        "n",
        "g",
        new Blob(["png"], { type: "image/png" }),
      ),
    ).toThrow("JPEG");
  });
  it("keeps Hybrid groups on the native Linked Devices route and retains the not-executed error", async () => {
    const { client, server } = await setup(409, {
      error: {
        code: "hybrid_group_linked_devices_unavailable",
        message: "Not executed",
      },
    });
    await expect(client.groups.retrieve("hybrid", "123")).rejects.toMatchObject(
      { code: "hybrid_group_linked_devices_unavailable" },
    );
    expect(
      server.requests.every((r) => !r.path.includes("official-groups")),
    ).toBe(true);
  });
  it("sends batching only on Platform endpoint management and retains feature errors", async () => {
    const { server } = await setup(403, {
      error: { code: "feature_unavailable", message: "Beta unavailable" },
    });
    const client = new Client({
      baseUrl: server.url,
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    });
    const input = { enabled: true, maxEvents: 2, windowMs: 100 };
    await expect(
      client.webhooks.update("w/1", { batching: input }),
    ).rejects.toMatchObject({ code: "feature_unavailable" });
    expect(server.requests[0]!.path).toBe("/platform/webhooks/w%2F1");
    expect(JSON.parse(server.requests[0]!.body)).toEqual({ batching: input });
    expect(() =>
      client.webhooks.update("w", {
        batching: { enabled: true, maxEvents: 1 },
      }),
    ).toThrow("2 to 100");
    expect(() =>
      client.webhooks.update("w", {
        batching: { enabled: true, windowMs: 1001 },
      }),
    ).toThrow("100 to 1000");
    expect(() =>
      client.webhooks.create({
        url: "https://example.invalid",
        eventTypes: [],
        format: "meta",
        batching: { enabled: true },
      }),
    ).toThrow("native format");
  });
});

describe("signed webhook batches", () => {
  it("accepts a one-member window, unknown events, original order and member IDs", async () => {
    const value = {
      ...batch,
      events: [event, { ...event, id: "evt-2", event: "future.event" }],
    };
    expect(await decode(value)).toEqual(value);
    expect(await decode(batch)).toEqual(batch);
    const fixture = await webhooks.createFixture({
      event: await decode(value),
      secret: "secret",
    });
    expect(
      await webhooks.verifyDelivery({
        body: fixture.body,
        signature: fixture.signature,
        secret: "secret",
      }),
    ).toEqual(value);
  });
  it("keeps single deliveries and the single-only API unchanged", async () => {
    expect(await decode(event)).toEqual(event);
    const raw = JSON.stringify(batch);
    const signature = createHmac("sha256", "secret").update(raw).digest("hex");
    await expect(
      constructWebhookEvent(raw, signature, "secret"),
    ).rejects.toMatchObject({ code: "invalid_webhook_event" });
  });
  it("authenticates the entire body before parsing, including the batch ID and every member", async () => {
    const raw = JSON.stringify(batch);
    const signature = createHmac("sha256", "secret").update(raw).digest("hex");
    await expect(
      constructWebhookDelivery(
        raw.replace("evt-1", "evt-2"),
        signature,
        "secret",
      ),
    ).rejects.toMatchObject({ code: "invalid_webhook_signature" });
    await expect(
      constructWebhookDelivery("{", signature, "secret"),
    ).rejects.toMatchObject({ code: "invalid_webhook_signature" });
  });
  it.each([
    { ...batch, version: 2 },
    { ...batch, id: "bad" },
    { ...batch, events: [] },
    { ...batch, events: Array(101).fill(event) },
    { ...batch, events: [event, {}] },
    { ...batch, events: [batch] },
    { ...batch, extra: true },
  ])(
    "rejects malformed batches without returning partial members",
    async (value) => {
      await expect(decode(value)).rejects.toThrow();
    },
  );
  it("types incoming carts, lifecycle and separate previous identities", async () => {
    expectTypeOf<HistoryMessage["order"]>().toEqualTypeOf<
      IncomingOrderCart | undefined
    >();
    expectTypeOf<
      WebhookPayloadMap["marketing.onboarding_updated"]["kind"]
    >().toEqualTypeOf<"terms_signed" | "ad_account_linked">();
    const contact: ContactUpdatePayload = {
      id: "new",
      parentBsuid: "US.ENT.metadata",
      identityChange: {
        reason: "user_id_changed",
        messageId: "meta1",
        previous: { id: "old", bsuid: "old-bsuid" },
      },
    };
    const decoded = await decode({
      ...event,
      event: "contact.update",
      payload: contact,
    });
    expect(isWebhookEventBatch(decoded)).toBe(false);
    expect(decoded).toMatchObject({
      payload: { id: "new", identityChange: { previous: { id: "old" } } },
    });
  });
});
