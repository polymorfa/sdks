import { afterEach, describe, expect, it } from "vitest";
import { MessagingClient } from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function client(server: TestServer) {
  return new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
    maxNetworkRetries: 2,
  });
}

describe("Official groups (beta)", () => {
  it("rejects client tokens before any request", async () => {
    const server = await startTestServer(() => ({ body: "{}" }));
    servers.push(server);
    const groups = new MessagingClient({
      credential: { type: "clientToken", value: "pmfa_ct_browser" },
      baseUrl: server.url,
    }).officialGroups;
    expect(() => groups.list("support")).toThrow(
      /organization API key or project token/,
    );
    expect(() => groups.create("support", { subject: "Orders" })).toThrow(
      /organization API key/,
    );
    expect(server.requests).toHaveLength(0);
  });

  it("uses the documented paths, encodes identifiers and sends bodies as given", async () => {
    const server = await startTestServer(() => ({
      body: JSON.stringify({ success: true, data: {} }),
    }));
    servers.push(server);
    const groups = client(server).officialGroups;
    await groups.list("support/eu", { limit: 10, after: "QUZURVI" });
    await groups.create("support/eu", {
      subject: "Orders",
      joinApprovalRequired: true,
    });
    await groups.retrieve("support/eu", "739182640518203");
    await groups.update("support/eu", "739182640518203", { subject: "New" });
    await groups.delete("support/eu", "739182640518203");
    await groups.getInviteLink("support/eu", "739182640518203");
    await groups.resetInviteLink("support/eu", "739182640518203");
    await groups.removeParticipants("support/eu", "739182640518203", [
      "+15550001111",
    ]);
    await groups.listJoinRequests("support/eu", "739182640518203", {
      before: "B",
    });
    await groups.approveJoinRequests("support/eu", "739182640518203", ["MTY0"]);
    await groups.rejectJoinRequests("support/eu", "739182640518203", ["MTY1"]);
    await groups.pin("support/eu", "739182640518203", {
      operation: "pin",
      messageId: "1",
      expirationDays: 7,
    });
    const base = "/messaging/support%2Feu/official-groups";
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${base}?limit=10&after=QUZURVI`,
      `POST ${base}`,
      `GET ${base}/739182640518203`,
      `PATCH ${base}/739182640518203`,
      `DELETE ${base}/739182640518203`,
      `GET ${base}/739182640518203/invite-link`,
      `POST ${base}/739182640518203/invite-link/reset`,
      `POST ${base}/739182640518203/participants/remove`,
      `GET ${base}/739182640518203/join-requests?before=B`,
      `POST ${base}/739182640518203/join-requests/approve`,
      `POST ${base}/739182640518203/join-requests/reject`,
      `POST ${base}/739182640518203/pins`,
    ]);
    expect(JSON.parse(server.requests[1]!.body)).toEqual({
      subject: "Orders",
      joinApprovalRequired: true,
    });
    expect(JSON.parse(server.requests[7]!.body)).toEqual({
      participants: ["+15550001111"],
    });
    expect(JSON.parse(server.requests[9]!.body)).toEqual({
      joinRequestIds: ["MTY0"],
    });
    expect(JSON.parse(server.requests[11]!.body)).toEqual({
      operation: "pin",
      messageId: "1",
      expirationDays: 7,
    });
  });

  it("retries reads but sends every change once, passing the idempotency key", async () => {
    let calls = 0;
    const server = await startTestServer(() => {
      calls += 1;
      return {
        status: 503,
        body: JSON.stringify({
          error: { code: "service_unavailable", message: "unknown" },
        }),
      };
    });
    servers.push(server);
    const groups = client(server).officialGroups;
    const options = { idempotencyKey: "customer-key", maxNetworkRetries: 3 };
    for (const change of [
      () => groups.create("support", { subject: "Orders" }, options),
      () => groups.update("support", "1", { description: "d" }, options),
      () => groups.delete("support", "1", options),
      () => groups.resetInviteLink("support", "1", options),
      () =>
        groups.removeParticipants("support", "1", ["+15550001111"], options),
      () => groups.approveJoinRequests("support", "1", ["a"], options),
      () => groups.rejectJoinRequests("support", "1", ["a"], options),
      () =>
        groups.pin(
          "support",
          "1",
          { operation: "unpin", messageId: "1" },
          options,
        ),
    ]) {
      const before = server.requests.length;
      await expect(change()).rejects.toMatchObject({ status: 503 });
      expect(server.requests.length - before).toBe(1);
      expect(server.requests.at(-1)?.headers["idempotency-key"]).toBe(
        "customer-key",
      );
    }
    calls = 0;
    await expect(groups.list("support")).rejects.toMatchObject({ status: 503 });
    expect(calls).toBeGreaterThan(1);
  });

  it("surfaces the eligibility error code", async () => {
    const server = await startTestServer(() => ({
      status: 403,
      body: JSON.stringify({
        error: {
          type: "permission_error",
          code: "whatsapp_groups_ineligible",
          message: "Groups require an Official Business Account.",
        },
      }),
    }));
    servers.push(server);
    await expect(
      client(server).officialGroups.create("support", { subject: "Orders" }),
    ).rejects.toMatchObject({
      status: 403,
      code: "whatsapp_groups_ineligible",
    });
  });
});
