import { afterEach, expect, it } from "vitest";
import {
  Client,
  MessagingClient,
  PolymorfaConfigurationError,
} from "../src/index.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
const projectId = "018f0000-0000-7000-8000-000000000001";
const campaignId = "018f0000-0000-7000-8000-000000000002";
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
it("rejects invalid mapping keys, defaulted follow-up relations, list reasons and launch owners before HTTP", async () => {
  const server = await startTestServer(() => ({ body: '{"data":{}}' }));
  servers.push(server);
  const m = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const c = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const calls: (() => unknown)[] = [
    () =>
      m.campaigns.create("p", {
        name: "x",
        variableMapping: { "bad key": {} },
      } as never),
    () =>
      m.campaigns.create("p", {
        name: "x",
        variableMapping: { good: { source: null } },
      } as never),
    () =>
      m.campaigns.create("p", {
        name: "x",
        followUp: {
          delaySeconds: 604800,
          message: { type: "text", text: "x" },
        },
      }),
    () =>
      m.campaigns.listRecipients("p", campaignId, {
        reason: "invalid",
      } as never),
    () => c.campaigns.launch(campaignId, { projectId, extra: true } as never),
    ...[
      "https://example.local./x",
      "https://example.internal./x",
      "https://example.localhost/x",
      "https://127.0.0.1/x",
    ].map(
      (url) => () =>
        m.campaigns.create("p", {
          name: "x",
          trackedLinks: [{ key: "a", url }],
        }),
    ),
    ...["Upper", "0first", "a".repeat(17)].map(
      (key) => () =>
        m.campaigns.create("p", {
          name: "x",
          messageVariations: [
            { key, weight: 50, blueprint: { version: 2, source: "a" } },
            {
              key: "valid",
              weight: 50,
              blueprint: { version: 2, source: "b" },
            },
          ],
        }),
    ),
  ];
  for (const call of calls)
    expect(
      await Promise.resolve()
        .then(call)
        .catch((e) => e),
    ).toBeInstanceOf(PolymorfaConfigurationError);
  expect(server.requests).toHaveLength(0);
});
it("preserves numeric mapping keys, null resets, combined filters and false launch flags on fixed routes", async () => {
  const server = await startTestServer(() => ({
    body: '{"data":{"id":"018f0000-0000-7000-8000-000000000002","status":"queued","operationId":"op"}}',
  }));
  servers.push(server);
  const m = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const c = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  await m.campaigns.create("p", {
    name: "x",
    variableMapping: JSON.parse('{"0":{},"__proto__":{"fallback":"x"}}'),
    trackedLinks: [
      { key: "a", url: "https://example.test" },
      { key: "b", url: "https://example.test" },
      { key: "c", url: "https://example.invalid/x" },
    ],
  } as never);
  await m.campaigns.update("p", campaignId, {
    templateId: null,
    variableMapping: null,
    trackedLinks: null,
  } as never);
  await m.campaigns.listRecipients("p", campaignId, {
    reason: "missing_variable",
    status: "failed",
    cursor: "opaque",
    limit: 2,
  } as never);
  await c.campaigns.launch(campaignId, {
    projectId,
    skipMissingVariables: false,
  });
  expect(JSON.parse(server.requests[0]!.body).variableMapping).toEqual(
    JSON.parse('{"0":{},"__proto__":{"fallback":"x"}}'),
  );
  expect(JSON.parse(server.requests[1]!.body)).toEqual({
    templateId: null,
    variableMapping: null,
    trackedLinks: null,
  });
  expect(server.requests[2]!.path).toContain("reason=missing_variable");
  expect(JSON.parse(server.requests[3]!.body)).toEqual({
    projectId,
    skipMissingVariables: false,
  });
});

it("checks UTF-16 and count boundaries without inventing limits for open composed messages", async () => {
  const server = await startTestServer(() => ({
    body: '{"success":true,"data":{}}',
  }));
  servers.push(server);
  const m = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const c = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const mapping = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [
      `v${i}`,
      { fallback: "😀".repeat(512) },
    ]),
  );
  await m.campaigns.create("p", {
    name: "x",
    variableMapping: mapping,
    trackedLinks: Array.from({ length: 5 }, (_, i) => ({
      key: `k${i}`,
      url: "https://example.test/same",
    })),
    followUp: {
      delaySeconds: 60,
      expirySeconds: 86400,
      message: { type: "text", text: "😀".repeat(8192) },
    },
  });
  await c.campaigns.create({
    projectId,
    name: "x",
    messagesArray: [
      {},
      {
        source: "x".repeat(16385),
        extension: false,
        buttons: Array.from({ length: 4 }, () => ({
          kind: "reply" as const,
          label: "",
        })),
      },
    ],
  });
  for (const fields of [
    { variableMapping: { ...mapping, extra: {} } },
    { variableMapping: { ok: { fallback: "😀".repeat(512) + "x" } } },
    { variableMapping: { ok: { fallback: "\u00a0\ufeff" } } },
    {
      trackedLinks: Array.from({ length: 6 }, (_, i) => ({
        key: `k${i}`,
        url: "https://example.test",
      })),
    },
    {
      trackedLinks: [
        { key: "same", url: "https://example.test/a" },
        { key: "same", url: "https://example.test/b" },
      ],
    },
    { followUp: { message: { type: "text", text: "😀".repeat(8192) + "x" } } },
    { followUp: { message: { type: "text", text: "{{ LINK:foo }}" } } },
    {
      followUp: {
        delaySeconds: 604800,
        expirySeconds: 604800,
        message: { type: "text", text: "x" },
      },
    },
  ]) {
    expect(
      await Promise.resolve()
        .then(() => m.campaigns.create("p", { name: "x", ...fields } as never))
        .catch((e) => e),
    ).toBeInstanceOf(PolymorfaConfigurationError);
  }
  expect(server.requests).toHaveLength(2);
});
