import { afterEach, describe, it, expect, expectTypeOf } from "vitest";
import {
  MessagingClient,
  type GroupCapabilities,
  type SessionCapabilitiesUpdatedPayload,
  isEvent,
  type WebhookEvent,
} from "../src/index.js";
import { PROJECT_TOKEN } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
describe("group capabilities", () => {
  it("encodes identifiers and preserves unknown group values", async () => {
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
    const server = await startTestServer(() => ({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ success: true, data }),
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    const response = await client.groups.getCapabilities(
      "support/a",
      "9007199254740993",
    );
    expect(response.data.data).toEqual(data);
    expectTypeOf(response.data.data).toEqualTypeOf<GroupCapabilities>();
    expect(server.requests[0]).toMatchObject({
      method: "GET",
      path: "/messaging/support%2Fa/groups/9007199254740993/capabilities",
    });
  });
  it("narrows capability changes to the canonical number view", () => {
    const event = {
      event: "session.capabilities_updated",
      payload: {
        session: "support",
        projectId: "00000000-0000-4000-8000-000000000001",
        status: "unknown",
        syncedAt: null,
        checkedAt: null,
        accountType: null,
        capabilities: [],
        changedKeys: ["polls.endTime"],
      },
    } as WebhookEvent;
    expect(isEvent(event, "session.capabilities_updated")).toBe(true);
    if (isEvent(event, "session.capabilities_updated"))
      expectTypeOf(
        event.payload,
      ).toEqualTypeOf<SessionCapabilitiesUpdatedPayload>();
  });
});
