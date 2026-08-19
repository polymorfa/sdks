import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingClient,
  QuickRepliesResource,
  type ApiResponse,
  type BusinessQuickReply,
  type BusinessQuickReplyCollection,
  type BusinessQuickReplyMutation,
  type BusinessQuickReplyObserved,
  type CreateBusinessQuickReplyResponse,
  type DeleteBusinessQuickReplyResponse,
  type ListBusinessQuickRepliesResponse,
  type ReplaceBusinessQuickReplyResponse,
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

const quickReply: BusinessQuickReply = {
  id: "1700000000",
  shortcut: "hours",
  message: "We are open until 18:00.",
  keywords: ["open", "hours"],
  count: 7,
};

async function quickRepliesServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer((request) => ({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_quick_replies",
    },
    body: JSON.stringify({
      success: true,
      data:
        request.method === "GET"
          ? {
              policy: "cache",
              status: "fresh",
              observedAt: "2026-08-19T20:00:00.000Z",
              quickReplies: [
                {
                  ...quickReply,
                  associatedLabelIds: ["label-1"],
                  observedAt: "2026-08-19T20:00:00.000Z",
                },
              ],
            }
          : request.method === "DELETE"
            ? { id: quickReply.id, status: "DELETED" }
            : quickReply,
    }),
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

describe("MessagingClient quick replies", () => {
  it("exports the exact mutation, reply, and observation collection shapes", () => {
    expectTypeOf<BusinessQuickReplyMutation>().toEqualTypeOf<{
      readonly shortcut: string;
      readonly message: string;
      readonly keywords?: readonly string[];
      readonly count?: number;
    }>();
    expectTypeOf<BusinessQuickReply>().toEqualTypeOf<{
      readonly id: string;
      readonly shortcut: string;
      readonly message: string;
      readonly keywords?: readonly string[];
      readonly count?: number;
    }>();
    expectTypeOf<BusinessQuickReplyObserved>().toEqualTypeOf<{
      readonly id: string;
      readonly shortcut: string;
      readonly message: string;
      readonly keywords?: readonly string[];
      readonly count?: number;
      readonly associatedLabelIds: readonly string[];
      readonly observedAt: string;
    }>();
    expectTypeOf<BusinessQuickReplyCollection>().toEqualTypeOf<{
      readonly policy: "off" | "events" | "cache";
      readonly status: "disabled" | "unknown" | "partial" | "fresh";
      readonly unknownReason?:
        "observation_disabled" | "not_retained" | "not_observed";
      readonly observedAt?: string;
      readonly quickReplies: readonly BusinessQuickReplyObserved[];
    }>();
    expectTypeOf<
      MessagingClient["quickReplies"]
    >().toEqualTypeOf<QuickRepliesResource>();
  });

  it("lists the bounded observation projection with metadata and an encoded session", async () => {
    const { client, requests } = await quickRepliesServer();

    const listed = await client.quickReplies.list("support/eu", {
      apiVersion: "next",
      headers: { "x-client-context": "cli" },
    });

    expectTypeOf(listed).toEqualTypeOf<
      ApiResponse<ListBusinessQuickRepliesResponse>
    >();
    expect(listed.data.data).toMatchObject({
      policy: "cache",
      status: "fresh",
      quickReplies: [
        {
          id: "1700000000",
          associatedLabelIds: ["label-1"],
        },
      ],
    });
    expect(listed.metadata.requestId).toBe("req_quick_replies");
    expect(requests[0]).toMatchObject({
      method: "GET",
      path: "/api/support%2Feu/business/quick-replies",
    });
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
    expect(requests[0]?.headers["x-client-context"]).toBe("cli");
  });

  it("maps create, full replacement, and delete with encoded IDs and idempotency", async () => {
    const { client, requests } = await quickRepliesServer();
    const options = { idempotencyKey: "quick-reply-change" } as const;
    const body = {
      shortcut: "hours",
      message: "We are open until 18:00.",
      keywords: ["open", "hours"],
      count: 7,
    } as const;

    const created = await client.quickReplies.create(
      "support/eu",
      { shortcut: "hours", message: body.message },
      options,
    );
    const replaced = await client.quickReplies.replace(
      "support/eu",
      "1700/000000",
      body,
      options,
    );
    const deleted = await client.quickReplies.delete(
      "support/eu",
      "1700/000000",
      options,
    );

    expectTypeOf(created).toEqualTypeOf<
      ApiResponse<CreateBusinessQuickReplyResponse>
    >();
    expectTypeOf(replaced).toEqualTypeOf<
      ApiResponse<ReplaceBusinessQuickReplyResponse>
    >();
    expectTypeOf(deleted).toEqualTypeOf<
      ApiResponse<DeleteBusinessQuickReplyResponse>
    >();
    expect(
      requests.map(({ method, path, body: requestBody }) => ({
        method,
        path,
        body: requestBody,
      })),
    ).toEqual([
      {
        method: "POST",
        path: "/api/support%2Feu/business/quick-replies",
        body: '{"shortcut":"hours","message":"We are open until 18:00."}',
      },
      {
        method: "PUT",
        path: "/api/support%2Feu/business/quick-replies/1700%2F000000",
        body: '{"shortcut":"hours","message":"We are open until 18:00.","keywords":["open","hours"],"count":7}',
      },
      {
        method: "DELETE",
        path: "/api/support%2Feu/business/quick-replies/1700%2F000000",
        body: "",
      },
    ]);
    expect(requests.map(({ headers }) => headers["idempotency-key"])).toEqual([
      "quick-reply-change",
      "quick-reply-change",
      "quick-reply-change",
    ]);
  });
});
