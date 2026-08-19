import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingClient,
  PrivacyResource,
  type ApiResponse,
  type DefaultDisappearingTimerRequest,
  type GetPrivacySettingsResponse,
  type PrivacySettingMutation,
  type PrivacySettingName,
  type PrivacySettingValueMap,
  type PrivacySettings,
  type SetDefaultDisappearingTimerResponse,
  type SetPrivacySettingResponse,
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

const settings: PrivacySettings = {
  groupAdd: "contacts",
  lastSeen: "none",
  status: "all",
  profile: "contact_blacklist",
  readReceipts: "all",
  online: "match_last_seen",
  callAdd: "known",
  messages: "contacts",
  defense: "on_standard",
  stickers: "contact_allowlist",
};

async function privacyServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer((request) => ({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_privacy",
    },
    body: request.path.endsWith("/disappearing/default")
      ? '{"success":true,"message":"updated"}'
      : JSON.stringify({ success: true, data: settings }),
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

describe("MessagingClient privacy", () => {
  it("exports the exact setting-specific value matrix", () => {
    expectTypeOf<PrivacySettingValueMap>().toEqualTypeOf<{
      readonly groupadd: "all" | "contacts" | "contact_blacklist" | "none";
      readonly last: "all" | "contacts" | "contact_blacklist" | "none";
      readonly status: "all" | "contacts" | "contact_blacklist" | "none";
      readonly profile: "all" | "contacts" | "contact_blacklist" | "none";
      readonly readreceipts: "all" | "none";
      readonly online: "all" | "match_last_seen";
      readonly calladd: "all" | "known";
      readonly messages: "all" | "contacts";
      readonly defense: "on_standard" | "off";
      readonly stickers: "contacts" | "contact_allowlist" | "none";
    }>();
    expectTypeOf<PrivacySettingName>().toEqualTypeOf<
      | "groupadd"
      | "last"
      | "status"
      | "profile"
      | "readreceipts"
      | "online"
      | "calladd"
      | "messages"
      | "defense"
      | "stickers"
    >();
    expectTypeOf<
      Extract<PrivacySettingMutation, { setting: "defense" }>
    >().toEqualTypeOf<{
      readonly setting: "defense";
      readonly value: "on_standard" | "off";
    }>();
    expectTypeOf<DefaultDisappearingTimerRequest>().toEqualTypeOf<{
      readonly durationSeconds: 0 | 86400 | 604800 | 7776000;
    }>();
    expectTypeOf<MessagingClient["privacy"]>().toEqualTypeOf<PrivacyResource>();
  });

  it("gets every privacy setting with metadata and an encoded session", async () => {
    const { client, requests } = await privacyServer();

    const result = await client.privacy.get("support/eu", {
      apiVersion: "next",
      headers: { "x-cli-command": "privacy view" },
    });

    expectTypeOf(result).toEqualTypeOf<
      ApiResponse<GetPrivacySettingsResponse>
    >();
    expect(result.data).toEqual({ success: true, data: settings });
    expect(result.metadata.requestId).toBe("req_privacy");
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /api/support%2Feu/privacy",
    ]);
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
    expect(requests[0]?.headers["x-cli-command"]).toBe("privacy view");
  });

  it("sets a discriminated privacy value and the account default timer", async () => {
    const { client, requests } = await privacyServer();
    const privacy = client.privacy;
    const options = { idempotencyKey: "privacy-change" } as const;

    const updated = await privacy.set(
      "support/eu",
      { setting: "defense", value: "off" },
      options,
    );
    const timer = await privacy.setDefaultDisappearingTimer(
      "support/eu",
      { durationSeconds: 0 },
      options,
    );

    expectTypeOf(updated).toEqualTypeOf<
      ApiResponse<SetPrivacySettingResponse>
    >();
    expectTypeOf(timer).toEqualTypeOf<
      ApiResponse<SetDefaultDisappearingTimerResponse>
    >();

    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      {
        method: "PUT",
        path: "/api/support%2Feu/privacy/defense",
        body: '{"value":"off"}',
      },
      {
        method: "PUT",
        path: "/api/support%2Feu/privacy/disappearing/default",
        body: '{"durationSeconds":0}',
      },
    ]);
    expect(requests.map(({ headers }) => headers["idempotency-key"])).toEqual([
      "privacy-change",
      "privacy-change",
    ]);
  });
});
