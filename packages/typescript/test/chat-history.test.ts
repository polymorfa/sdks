import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingClient,
  PolymorfaAuthorizationError,
  PolymorfaNotFoundError,
  isKnownPolymorfaErrorCode,
  type ApiResponse,
  type GetStoredChatMessageResponse,
  type GetStoredChatResponse,
  type ListStoredChatMessagesResponse,
  type ListStoredChatsResponse,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("MessagingClient.chats retained history", () => {
  it("preserves list filters, opaque IDs, cursor fields, and the serving region", async () => {
    const summary = {
      id: "739182640518203",
      whatsapp_id: "wamid.abc",
      direction: "inbound",
      type: "text",
      timestamp: "2026-09-22T10:00:00.000Z",
    };
    const chat = {
      conversation: { id: "739182640518202", phoneNumber: "+15551234567" },
      kind: "direct",
      lastActivityAt: summary.timestamp,
      lastMessage: summary,
    };
    const message = {
      ...summary,
      conversation: chat.conversation,
      fromMe: false,
      text: "Hello",
      media: [],
    };
    const server = await startTestServer((_request, index) => ({
      headers: {
        "content-type": "application/json",
        "polymorfa-data-region": "eu-central-1",
      },
      body: JSON.stringify(
        index === 0
          ? {
              success: true,
              data: [chat],
              hasMore: true,
              nextCursor: "next",
              previousCursor: null,
            }
          : index === 1
            ? { success: true, data: chat }
            : index === 2
              ? {
                  success: true,
                  data: [message],
                  hasMore: false,
                  nextCursor: null,
                  previousCursor: "prior",
                }
              : { success: true, data: message },
      ),
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });

    const chats = await client.chats.list("number/one", {
      limit: 25,
      cursor: "opaque_1",
      kind: "direct",
      activeSince: "2026-09-01T00:00:00.000Z",
      activeBefore: "2026-09-23T00:00:00.000Z",
    });
    const retrievedChat = await client.chats.retrieve(
      "number/one",
      "+15551234567",
    );
    const messages = await client.chats.listMessages(
      "number/one",
      "+15551234567",
      {
        limit: 20,
        cursor: "opaque_2",
        order: "asc",
        since: "2026-09-01T00:00:00.000Z",
        until: "2026-09-23T00:00:00.000Z",
        direction: "inbound",
        types: "text,image",
      },
    );
    const retrievedMessage = await client.chats.retrieveMessage(
      "number/one",
      "+15551234567",
      "739182640518203",
    );

    expectTypeOf(chats).toEqualTypeOf<ApiResponse<ListStoredChatsResponse>>();
    expectTypeOf(retrievedChat).toEqualTypeOf<
      ApiResponse<GetStoredChatResponse>
    >();
    expectTypeOf(messages).toEqualTypeOf<
      ApiResponse<ListStoredChatMessagesResponse>
    >();
    expectTypeOf(retrievedMessage).toEqualTypeOf<
      ApiResponse<GetStoredChatMessageResponse>
    >();
    expect(chats.data.data[0]?.lastMessage.id).toBe("739182640518203");
    expect(chats.data.nextCursor).toBe("next");
    expect(messages.data.previousCursor).toBe("prior");
    expect(retrievedMessage.data.data.whatsapp_id).toBe("wamid.abc");
    expect(chats.metadata.headers["polymorfa-data-region"]).toBe(
      "eu-central-1",
    );
    expect(server.requests.map((request) => request.method)).toEqual([
      "GET",
      "GET",
      "GET",
      "GET",
    ]);
    expect(server.requests.map((request) => request.body)).toEqual([
      "",
      "",
      "",
      "",
    ]);
    const [list, get, listMessages, getMessage] = server.requests.map(
      (request) => new URL(request.path, server.url),
    );
    expect(list?.pathname).toBe("/messaging/number%2Fone/chats");
    expect(Object.fromEntries(list!.searchParams)).toEqual({
      limit: "25",
      cursor: "opaque_1",
      kind: "direct",
      activeSince: "2026-09-01T00:00:00.000Z",
      activeBefore: "2026-09-23T00:00:00.000Z",
    });
    expect(get?.pathname).toBe("/messaging/number%2Fone/chats/%2B15551234567");
    expect(listMessages?.pathname).toBe(
      "/messaging/number%2Fone/chats/%2B15551234567/messages",
    );
    expect(Object.fromEntries(listMessages!.searchParams)).toEqual({
      limit: "20",
      cursor: "opaque_2",
      order: "asc",
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-09-23T00:00:00.000Z",
      direction: "inbound",
      types: "text,image",
    });
    expect(getMessage?.pathname).toBe(
      "/messaging/number%2Fone/chats/%2B15551234567/messages/739182640518203",
    );
  });

  it("surfaces enrollment denial without treating it as empty history", async () => {
    const server = await startTestServer(() => ({
      status: 403,
      body: JSON.stringify({
        error: {
          code: "feature_not_enabled",
          message: "History is unavailable",
        },
      }),
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    await expect(client.chats.list("number")).rejects.toBeInstanceOf(
      PolymorfaAuthorizationError,
    );
  });

  it("recognizes an HMS-disabled response as a typed API error", async () => {
    const server = await startTestServer(() => ({
      status: 404,
      body: JSON.stringify({
        error: { code: "hms_not_enabled", message: "Hosted history is off" },
      }),
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    expect(isKnownPolymorfaErrorCode("hms_not_enabled")).toBe(true);
    await expect(client.chats.list("number")).rejects.toMatchObject({
      code: "hms_not_enabled",
      status: 404,
    });
    await expect(client.chats.list("number")).rejects.toBeInstanceOf(
      PolymorfaNotFoundError,
    );
  });
});
