import { afterEach, expect, it } from "vitest";
import { MessagingClient } from "../src/index.js";
import { TEAM_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
let server: TestServer;
afterEach(async () => {
  await server?.close();
});
it("uses all six current Testing routes and preserves an opaque account selector over native HTTP", async () => {
  const selector = "stable session/id";
  const encoded = "stable%20session%2Fid";
  const history = {
    messages: [
      {
        id: "message",
        senderPhone: "+15551234567",
        text: "Fixture",
        timestamp: 1,
        fromMe: false,
      },
    ],
  };
  const cases = [
    [
      "POST",
      "/messaging/projects/project/test-history-fixtures",
      history,
      { fixtureId: "fixture" },
    ],
    ["GET", "/messaging/test-events/fixtures", undefined, { fixtures: [] }],
    [
      "POST",
      `/messaging/${encoded}/test-events`,
      {
        event: "message.received",
        overrides: { text: "Fixture" },
        fromConnection: "sender",
      },
      {
        event: "message.received",
        connection: selector,
        delivery: "simulated",
        eventId: null,
        source: "runtime",
      },
    ],
    [
      "GET",
      `/messaging/${encoded}/phone`,
      undefined,
      {
        connection: selector,
        phone: "+15551234567",
        online: false,
        devices: [{ deviceId: 1 }],
      },
    ],
    [
      "POST",
      `/messaging/${encoded}/phone/messages`,
      { to: "+15551234568", text: "Fixture" },
      { connection: selector, to: "+15551234568", messageId: null },
    ],
    [
      "POST",
      `/messaging/${encoded}/phone/devices/1/unlink`,
      undefined,
      { connection: selector, deviceId: 1, unlinked: true },
    ],
  ] as const;
  server = await startTestServer((_request, index) => ({
    status: index === 4 ? 202 : 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "native-testing",
    },
    body: JSON.stringify(cases[index]![3]),
  }));
  const client = new MessagingClient({
    baseUrl: server.url,
    credential: { type: "apiKey", value: TEAM_API_KEY },
    maxNetworkRetries: 0,
  });
  await client.testing.createHistoryFixture("project", history);
  await client.testing.listEventFixtures();
  await client.testing.triggerEvent(selector, {
    event: "message.received",
    overrides: { text: "Fixture" },
    fromConnection: "sender",
  });
  await client.testing.getPhone(selector);
  await client.testing.sendPhoneMessage(selector, {
    to: "+15551234568",
    text: "Fixture",
  });
  await client.testing.unlinkPhoneDevice(selector, 1);
  expect(server.requests).toHaveLength(cases.length);
  for (const [index, request] of server.requests.entries()) {
    const [method, path, body] = cases[index]!;
    expect([request.method, request.path]).toEqual([method, path]);
    expect(request.body ? JSON.parse(request.body) : undefined).toEqual(body);
    expect(request.headers.authorization).toBe(`Bearer ${TEAM_API_KEY}`);
    expect(request.headers["polymorfa-version"]).toBe("2026-09-22");
  }
});
