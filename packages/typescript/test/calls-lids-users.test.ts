import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  CallsResource,
  LidsResource,
  MessagingClient,
  UsersResource,
  type ApiResponse,
  type GetUserSecurityCodeResponse,
  type RejectCallRequest,
  type RejectCallResponse,
  type ResolveLidParams,
  type ResolveLidResult,
  type ResolveLidsResponse,
  type UserSecurityCode,
} from "../src/index.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function compactSurfaceServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer((request) => ({
    status:
      request.path.includes("/calls/") &&
      request.headers.prefer === "respond-async"
        ? 202
        : 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_compact_surface",
      ...(request.path.includes("/security-code")
        ? { "cache-control": "private, no-store" }
        : {}),
    },
    body: request.path.includes("/calls/")
      ? request.headers.prefer === "respond-async"
        ? '{"success":true,"data":{"requestId":"cmd_call_42"}}'
        : '{"success":true,"data":{"status":"REJECTED"}}'
      : request.path.includes("/security-code")
        ? `{"success":true,"data":{"id":"100000011111111@lid","phoneNumber":"+15551234567","username":"support","numericCode":"${"1".repeat(60)}","qrCode":"ZGlzcGxheS1vbmx5"}}`
        : '{"success":true,"data":{"id":"100000011111111@lid","lid":"100000011111111@lid","phoneNumber":"+15551234567","username":"support","keyRequired":false}}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new MessagingClient({
      credential: { type: "apiKey", value: "pmfa_example" },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("MessagingClient compact Calls, LIDs, and Users surfaces", () => {
  it("exports the exact public resource and data contracts", () => {
    expectTypeOf<MessagingClient["calls"]>().toEqualTypeOf<CallsResource>();
    expectTypeOf<MessagingClient["lids"]>().toEqualTypeOf<LidsResource>();
    expectTypeOf<MessagingClient["users"]>().toEqualTypeOf<UsersResource>();
    expectTypeOf<RejectCallRequest>().toEqualTypeOf<{
      readonly from: string;
    }>();
    expectTypeOf<ResolveLidResult>().toEqualTypeOf<{
      readonly id?: string;
      readonly lid?: string;
      readonly phoneNumber?: string;
      readonly username?: string;
      readonly keyRequired?: boolean;
    }>();
    expectTypeOf<UserSecurityCode>().toEqualTypeOf<{
      readonly id: string;
      readonly phoneNumber?: string;
      readonly username?: string;
      readonly numericCode: string;
      readonly qrCode: string;
    }>();

    const validInputs: readonly ResolveLidParams[] = [
      { phoneNumber: "+15551234567" },
      { id: "100000011111111@lid" },
      { lid: "100000011111111@lid" },
      { username: "support" },
      { username: "support", usernameKey: "1234" },
    ];
    expect(validInputs).toHaveLength(5);
    // @ts-expect-error Resolution accepts exactly one identity form.
    const competingInputs: ResolveLidParams = {
      id: "100000011111111@lid",
      phoneNumber: "+15551234567",
    };
    void competingInputs;
  });

  it("rejects an incoming call with encoded identifiers and opt-in mutation retry safety", async () => {
    const { client, requests } = await compactSurfaceServer();
    const rejected = await client.calls.reject(
      "support/eu",
      "call/42",
      { from: "1555/7@s.whatsapp.net" },
      { idempotencyKey: "reject-call-42" },
    );
    const accepted = await client.calls.reject(
      "support/eu",
      "call/43",
      { from: "1555/7@s.whatsapp.net" },
      { headers: { Prefer: "respond-async" } },
    );

    expectTypeOf(rejected).toEqualTypeOf<ApiResponse<RejectCallResponse>>();

    expect(rejected).toMatchObject({
      data: { success: true, data: { status: "REJECTED" } },
      metadata: { requestId: "req_compact_surface", status: 200 },
    });
    expect(accepted).toMatchObject({
      data: { success: true, data: { requestId: "cmd_call_42" } },
      metadata: { requestId: "req_compact_surface", status: 202 },
    });
    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      {
        method: "POST",
        path: "/api/support%2Feu/calls/call%2F42/reject",
        body: '{"from":"1555/7@s.whatsapp.net"}',
      },
      {
        method: "POST",
        path: "/api/support%2Feu/calls/call%2F43/reject",
        body: '{"from":"1555/7@s.whatsapp.net"}',
      },
    ]);
    expect(requests[0]?.headers["idempotency-key"]).toBe("reject-call-42");
    expect(requests[1]?.headers.prefer).toBe("respond-async");
  });

  it("resolves each exact stable-identity input without mixing query forms", async () => {
    const { client, requests } = await compactSurfaceServer();
    const byPhone = await client.lids.resolve(
      "support/eu",
      { phoneNumber: "+15551234567" },
      { apiVersion: "next", headers: { "x-cli-command": "user resolve" } },
    );

    expectTypeOf(byPhone).toEqualTypeOf<ApiResponse<ResolveLidsResponse>>();
    await client.lids.resolve("support/eu", { id: "100000011111111@lid" });
    await client.lids.resolve("support/eu", { lid: "100000011111111@lid" });
    await client.lids.resolve("support/eu", {
      username: "support name",
      usernameKey: "1234",
    });

    expect(byPhone).toMatchObject({
      data: {
        success: true,
        data: {
          id: "100000011111111@lid",
          phoneNumber: "+15551234567",
        },
      },
      metadata: { requestId: "req_compact_surface" },
    });
    expect(requests.map(({ path }) => path)).toEqual([
      "/api/support%2Feu/lids/resolve?phoneNumber=%2B15551234567",
      "/api/support%2Feu/lids/resolve?id=100000011111111%40lid",
      "/api/support%2Feu/lids/resolve?lid=100000011111111%40lid",
      "/api/support%2Feu/lids/resolve?username=support+name&usernameKey=1234",
    ]);
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
    expect(requests[0]?.headers["x-cli-command"]).toBe("user resolve");
  });

  it("retrieves the display-only identity security code by an encoded stable user ID", async () => {
    const { client, requests } = await compactSurfaceServer();
    const result = await client.users.getSecurityCode(
      "support/eu",
      "100000011111111@lid",
      { timeoutMs: 5_000 },
    );

    expectTypeOf(result).toEqualTypeOf<
      ApiResponse<GetUserSecurityCodeResponse>
    >();

    expect(result).toMatchObject({
      data: {
        success: true,
        data: {
          id: "100000011111111@lid",
          numericCode: "1".repeat(60),
          qrCode: "ZGlzcGxheS1vbmx5",
        },
      },
      metadata: { requestId: "req_compact_surface" },
    });
    expect(result.metadata.headers["cache-control"]).toBe("private, no-store");
    expect(result.data.data).not.toHaveProperty("verificationQRCode");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "GET",
      path: "/api/support%2Feu/users/100000011111111%40lid/security-code",
      body: "",
    });
  });
});
