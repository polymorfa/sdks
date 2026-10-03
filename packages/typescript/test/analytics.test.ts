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
