import { afterEach, expect, it } from "vitest";
import { Client, PolymorfaValidationError } from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
const servers: TestServer[] = [];
afterEach(async () => Promise.all(servers.splice(0).map((s) => s.close())));
it("reads enabled or disabled analytics and confines a project token without widening", async () => {
  const body = {
    enabled: false,
    period: { start: 0, end: 1 },
    requestVitals: { requests: 0, failures: 0, errorRate: null },
    summary: null,
    numbers: [],
    series: [],
    callSeries: [],
  };
  const server = await startTestServer(() => ({
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: body }),
  }));
  servers.push(server);
  const root = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  expect((await root.analytics.get({ start: 0, end: 1 })).data).toEqual(body);
  const id = "11111111-2222-4333-8444-555555555555";
  const project = new Client({
    credential: { type: "projectToken", value: PROJECT_TOKEN },
    projectId: id,
    baseUrl: server.url,
  });
  expect((await project.analytics.get({ sessionId: id })).data.enabled).toBe(
    false,
  );
  expect(server.requests[1]?.path).toBe(
    `/platform/projects/${id}/analytics?sessionId=${id}`,
  );
  expect(server.requests[1]?.headers.authorization).toContain(PROJECT_TOKEN);
  await expect(
    project.analytics.get({
      projectId: "22222222-2222-4333-8444-555555555555",
    }),
  ).rejects.toBeInstanceOf(PolymorfaValidationError);
  await expect(
    root.analytics.get({ start: 10, end: 1 }),
  ).rejects.toBeInstanceOf(PolymorfaValidationError);
  await expect(
    root.analytics.get({ sessionId: "name" }),
  ).rejects.toBeInstanceOf(PolymorfaValidationError);
});

it("preserves nullable call quality, follow-up coverage and per-number call series", async () => {
  const calls = {
    total: 3,
    answerRate: 0.5,
    mediaQuality: { measuredCalls: 0, averageRttMs: null },
    followUp: {
      eligibleMissed: 1,
      returnedWithin24h: 0,
      rate: 0,
      pendingWindow: 1,
      unknownContact: 1,
    },
  };
  const body = {
    enabled: true,
    summary: { calls },
    numbers: [{ sessionId: "number", calls }],
    series: [],
    callSeries: [{ sessionId: "number", ts: 1, answered: 1, missed: 1 }],
  };
  const server = await startTestServer(() => ({
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: body }),
  }));
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const result = (await client.analytics.get()).data;
  expect(result.summary?.calls.followUp).toEqual(calls.followUp);
  expect(result.numbers[0]?.calls.mediaQuality.averageRttMs).toBeNull();
  expect(result.callSeries).toEqual(body.callSeries);
});

it("returns collector text and metadata with validated project filters", async () => {
  const id = "11111111-2222-4333-8444-555555555555";
  const body =
    '# HELP polymorfa_analytics_enabled Analytics enablement.\n# TYPE polymorfa_analytics_enabled gauge\npolymorfa_analytics_enabled{scope="project"} 0\n# EOF\n';
  const server = await startTestServer(() => ({
    headers: {
      "content-type":
        "application/openmetrics-text; version=1.0.0; charset=utf-8",
      "x-request-id": "metrics-1",
    },
    body,
  }));
  servers.push(server);
  const client = new Client({
    credential: { type: "projectToken", value: PROJECT_TOKEN },
    projectId: id,
    baseUrl: server.url,
  });
  const response = await client.analytics.metrics({
    windowHours: 6,
    segments: true,
    format: "openmetrics",
    sessionId: id,
  });
  expect(response.data).toBe(body);
  expect(response.metadata.requestId).toBe("metrics-1");
  expect(server.requests[0]?.path).toContain(
    `/platform/projects/${id}/analytics/metrics?`,
  );
  expect(server.requests[0]?.path).toContain("segments=true");
  expect(server.requests[0]?.headers.accept).toBe(
    "application/openmetrics-text",
  );
  for (const params of [
    { windowHours: 0 },
    { windowHours: 169 },
    { windowHours: 1.5 },
    { sessionId: "phone" },
    { projectId: "22222222-2222-4333-8444-555555555555" },
  ])
    await expect(client.analytics.metrics(params)).rejects.toBeInstanceOf(
      PolymorfaValidationError,
    );
  expect(server.requests).toHaveLength(1);
});

it("rejects HTML success bodies and incomplete OpenMetrics framing", async () => {
  for (const [contentType, body] of [
    ["text/html", "<h1>Proxy failure</h1>"],
    ["application/openmetrics-text", "metric 1\n"],
  ]) {
    const server = await startTestServer(() => ({
      headers: { "content-type": contentType! },
      body: body!,
    }));
    servers.push(server);
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
    });
    await expect(
      client.analytics.metrics({ format: "openmetrics" }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  }
});
