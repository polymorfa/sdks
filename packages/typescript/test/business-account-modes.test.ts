import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  MessagingClient,
  PolymorfaConfigurationError,
  PolymorfaValidationError,
  type TestingAccountModeRequest,
  type ContactEncryption,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";

function fixture(
  body: unknown,
  credential: "apiKey" | "clientToken" = "apiKey",
) {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      }),
  );
  const client = new MessagingClient({
    baseUrl: "https://api.example",
    fetch,
    credential:
      credential === "apiKey"
        ? { type: "apiKey", value: ORGANIZATION_API_KEY }
        : { type: "clientToken", value: "pmfa_ct_YnJvd3Nlcg" },
  });
  return { client, fetch };
}

it.each([
  "whatsapp_app",
  "business_app",
  "meta_cloud",
  "meta_coexistence",
] as const)(
  "sends the exact %s mode to the pinned operation",
  async (accountType) => {
    const body = {
      session: "test /a",
      accountType,
      primaryPlatform: accountType === "meta_cloud" ? null : "android",
      changed: true,
      unlinkedDevices: [3, 7],
    };
    const f = fixture(body);
    const result = await f.client.testing.setAccountMode("test /a", {
      accountType,
    });
    expect(result.data).toEqual(body);
    const [url, init] = f.fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.example/messaging/test%20%2Fa/phone/account-mode",
    );
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ accountType });
    const contract = JSON.parse(
      readFileSync(
        new URL(
          "../../../contracts/business-account-modes.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(
      contract.sources.messaging.paths[
        "/messaging/{session}/phone/account-mode"
      ].put.operationId,
    ).toBe("setTestingAccountMode");
  },
);

it("preserves an explicit phone platform and a completed no-op", async () => {
  const body = {
    session: "demo",
    accountType: "business_app",
    primaryPlatform: "ios",
    changed: false,
    unlinkedDevices: [],
  };
  const f = fixture(body);
  expect(
    (
      await f.client.testing.setAccountMode("demo", {
        accountType: "business_app",
        primaryPlatform: "ios",
      })
    ).data,
  ).toEqual(body);
  expect(JSON.parse(String(f.fetch.mock.calls[0]![1]?.body))).toEqual({
    accountType: "business_app",
    primaryPlatform: "ios",
  });
});

it.each([
  { accountType: "personal" },
  { accountType: "business" },
  { accountType: "future" },
  {},
  { accountType: "meta_cloud", primaryPlatform: "android" },
  { accountType: "business_app", primaryPlatform: null },
  { accountType: "business_app", primaryPlatform: "web" },
  { accountType: "business_app", extra: true },
])("rejects invalid mode %j before transport", (input) => {
  const f = fixture({});
  expect(() =>
    f.client.testing.setAccountMode("demo", input as TestingAccountModeRequest),
  ).toThrow(PolymorfaValidationError);
  expect(f.fetch).not.toHaveBeenCalled();
});

it("refuses a client token without sending a request", () => {
  const f = fixture({}, "clientToken");
  expect(() =>
    f.client.testing.setAccountMode("demo", { accountType: "business_app" }),
  ).toThrow(PolymorfaConfigurationError);
  expect(f.fetch).not.toHaveBeenCalled();
});

it("rejects malformed result types", async () => {
  const f = fixture({
    session: "demo",
    accountType: "business_app",
    primaryPlatform: "android",
    changed: "false",
    unlinkedDevices: [],
  });
  await expect(
    f.client.testing.setAccountMode("demo", { accountType: "business_app" }),
  ).rejects.toMatchObject({ code: "invalid_response" });
});

it.each([
  "end_to_end",
  "hybrid",
  "not_end_to_end",
] satisfies ContactEncryption[])(
  "preserves the optional encryption value %s",
  async (encryption) => {
    const f = fixture({ success: true, data: { id: "contact", encryption } });
    const response = await f.client.contacts.businessProfile("demo", "contact");
    expect(response.data.data.encryption).toBe(encryption);
  },
);

it("does not invent encryption when the runtime omitted it", async () => {
  const f = fixture({ success: true, data: { id: "contact" } });
  expect(
    (await f.client.contacts.businessProfile("demo", "contact")).data.data,
  ).not.toHaveProperty("encryption");
});

it("sends QuickLink testing mode and platform without dropping simulation fields", async () => {
  const f = fixture({
    success: true,
    data: {
      id: "ql",
      url: "https://example.test/ql",
      session: "demo",
      expiresAt: null,
    },
  });
  const configuration = {
    testing: {
      configuration: {
        accountType: "business_app" as const,
        primaryPlatform: "ios" as const,
        replyBehavior: "echo" as const,
      },
    },
  };
  await f.client.quickLinks.create({ configuration });
  expect(JSON.parse(String(f.fetch.mock.calls[0]![1]?.body))).toEqual({
    configuration,
  });
});
it("rejects legacy QuickLink modes and cloud phone platforms before I/O", async () => {
  for (const mode of [
    { accountType: "business" },
    { accountType: "meta_cloud", primaryPlatform: "ios" },
  ]) {
    const f = fixture({});
    expect(() =>
      f.client.quickLinks.create({
        configuration: { testing: { configuration: mode } },
      } as never),
    ).toThrow(PolymorfaValidationError);
    expect(f.fetch).not.toHaveBeenCalled();
  }
});

it.each(["", "x".repeat(257)])(
  "refuses an invalid session length before transport",
  (session) => {
    const f = fixture({});
    expect(() =>
      f.client.testing.setAccountMode(session, { accountType: "business_app" }),
    ).toThrow();
    expect(f.fetch).not.toHaveBeenCalled();
  },
);
