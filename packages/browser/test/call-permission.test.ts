import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import type { CallPermissionRequestMessageContent } from "../../typescript/src/index.js";
import {
  startTestServer,
  type TestServer,
} from "../../typescript/test/support/http-server.js";
import {
  BrowserHttpError,
  BrowserMessagingClient,
  type BrowserMessageContent,
  type BrowserMessageKind,
} from "../src/index.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const content = {
  callPermissionRequest: { body: "May we call you about order 1522?" },
} satisfies BrowserMessageContent;

describe("browser call permission messages", () => {
  it("uses the same required body as the server message contract", () => {
    expectTypeOf<
      Extract<
        BrowserMessageContent,
        { readonly callPermissionRequest: unknown }
      >["callPermissionRequest"]
    >().toEqualTypeOf<CallPermissionRequestMessageContent>();
    expectTypeOf<"call_permission_request">().toExtend<BrowserMessageKind>();
    const missingBody: BrowserMessageContent = {
      // @ts-expect-error A permission request must explain why you want to call.
      callPermissionRequest: {},
    };
    const invalidBody: BrowserMessageContent = {
      // @ts-expect-error The permission request body is text.
      callPermissionRequest: { body: 123 },
    };
    // @ts-expect-error A message cannot combine permission and text content.
    const mixed: BrowserMessageContent = { ...content, text: "Hello" };
    expect([missingBody, invalidBody, mixed]).toHaveLength(3);
  });

  it("sends through the session-bound message route with a client token", async () => {
    const response = {
      success: true,
      data: {
        id: "739182640518203",
        whatsapp_id: "wamid.fixture",
        conversation: { id: "739182640518204" },
        timestamp: "2026-09-22T12:00:00Z",
        status: "sent",
        type: "call_permission_request",
        content,
      },
    };
    const server = await startTestServer(() => ({
      body: JSON.stringify(response),
    }));
    servers.push(server);
    const client = new BrowserMessagingClient({
      session: "support",
      getClientToken: async () => "pmfa_ct_fixture",
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    const body = { conversation: { phoneNumber: "+15551234567" }, content };

    const result = await client.messages.send(body, {
      idempotencyKey: "permission-request-1",
    });

    expect(result.data).toEqual(response);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatchObject({
      method: "POST",
      path: "/messaging/support/messages/send",
      headers: {
        authorization: "Bearer pmfa_ct_fixture",
        "idempotency-key": "permission-request-1",
      },
    });
    expect(JSON.parse(server.requests[0]!.body)).toEqual(body);
  });

  it.each([
    { status: 409, code: "unsupported_for_connection", category: "conflict" },
    {
      status: 429,
      code: "call_permission_request_limited",
      category: "rate_limit",
    },
  ])(
    "preserves $code from the trusted API",
    async ({ status, code, category }) => {
      const server = await startTestServer(() => ({
        status,
        headers: {
          "content-type": "application/json",
          "retry-after": "3600",
          "polymorfa-ratelimit-reason": "call_permission_request",
        },
        body: JSON.stringify({
          error: { code, message: "The call permission request was refused." },
        }),
      }));
      servers.push(server);
      const client = new BrowserMessagingClient({
        session: "support",
        getClientToken: async () => "pmfa_ct_fixture",
        baseUrl: server.url,
        maxNetworkRetries: 0,
      });

      const error: unknown = await client.messages
        .send({ conversation: { phoneNumber: "+15551234567" }, content })
        .catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(BrowserHttpError);
      expect(error).toMatchObject({
        status,
        code,
        category,
        metadata: {
          attempts: 1,
          headers: {
            "retry-after": "3600",
            "polymorfa-ratelimit-reason": "call_permission_request",
          },
        },
      });
      expect(server.requests).toHaveLength(1);
    },
  );
});
