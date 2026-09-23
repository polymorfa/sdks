import { readFileSync } from "node:fs";
import { afterEach, expect, expectTypeOf, it } from "vitest";
import {
  Client,
  FollowableIndexedEventPage,
  PolymorfaValidationError,
  type IndexedEventPage,
  type OrganizationEvent,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

it("matches both indexed event-list contract paths", () => {
  const spec = JSON.parse(
    readFileSync(
      new URL("../../../contracts/openapi.platform.json", import.meta.url),
      "utf8",
    ),
  );
  for (const path of [
    "/platform/events",
    "/platform/projects/{projectId}/events",
  ]) {
    const operation = spec.paths[path].get;
    expect(operation.parameters).toContainEqual(
      expect.objectContaining({ name: "afterOffset", in: "query" }),
    );
    expect(JSON.stringify(operation.responses["200"])).toContain(
      "IndexedEventPageMetadata",
    );
  }
});

it("follows nextOffset, not a cursor, for organization event pages", async () => {
  const server = await startTestServer((_request, index) => ({
    body: JSON.stringify({
      data: [{ id: `event-${index + 1}` }],
      page: {
        nextCursor: null,
        hasMore: index === 0,
        nextOffset: index === 0 ? "41" : null,
        highWatermark: "45",
      },
    }),
  }));
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });

  const first = await client.events.list({ afterOffset: "0", limit: 1 });
  expect(first).toBeInstanceOf(FollowableIndexedEventPage);
  expect(first.items[0]?.id).toBe("event-1");
  expect(first.hasMore).toBe(true);
  expect(first.nextOffset).toBe("41");
  expect(first.highWatermark).toBe("45");
  expect(first.response.data.page.highWatermark).toBe("45");
  expectTypeOf(first.highWatermark).toEqualTypeOf<string>();

  const second = await first.nextPage();
  expect(second?.items[0]?.id).toBe("event-2");
  expect(second?.hasMore).toBe(false);
  expect(second?.nextOffset).toBeNull();
  await expect(second?.nextPage()).resolves.toBeNull();
  expect(server.requests.map(({ path }) => path)).toEqual([
    "/platform/events?afterOffset=0&limit=1",
    "/platform/events?afterOffset=41&limit=1",
  ]);
});

it("uses the project event route and rejects incompatible offset filters locally", async () => {
  const server = await startTestServer(() => ({
    body: JSON.stringify({
      data: [],
      page: {
        nextCursor: null,
        hasMore: false,
        nextOffset: null,
        highWatermark: "9",
      },
    }),
  }));
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const events = client.project(PROJECT_ID).events;
  const page = await events.list({
    afterOffset: "0",
    type: "message.received",
  });
  expect(page.highWatermark).toBe("9");
  expect(server.requests[0]?.path).toBe(
    `/platform/projects/${PROJECT_ID}/events?afterOffset=0&type=message.received`,
  );

  for (const params of [
    { afterOffset: "1", cursor: "cursor" },
    { afterOffset: "1", since: "2026-09-01T00:00:00Z" },
    { afterOffset: "1", until: "2026-09-02T00:00:00Z" },
  ]) {
    await expect(events.list(params)).rejects.toBeInstanceOf(
      PolymorfaValidationError,
    );
  }
  for (const afterOffset of ["-1", "01", "9223372036854775808"]) {
    await expect(events.list({ afterOffset })).rejects.toMatchObject({
      code: "invalid_after_offset",
    });
    await expect(events.listIndexed({ afterOffset })).rejects.toMatchObject({
      code: "invalid_after_offset",
    });
  }
  expect(server.requests).toHaveLength(1);
});

it("accepts a final indexed page without nextOffset and preserves the public page type", async () => {
  const server = await startTestServer(() => ({
    body: JSON.stringify({
      data: [],
      page: { nextCursor: null, hasMore: false, highWatermark: "9" },
    }),
  }));
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const followable = await client.events.list({ afterOffset: "0" });
  expect(followable.nextOffset).toBeNull();
  const indexed: IndexedEventPage<OrganizationEvent> =
    await client.events.listIndexed({ afterOffset: "0" });
  expect(indexed.page).toEqual({
    hasMore: false,
    nextOffset: null,
    highWatermark: "9",
  });
});
