import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  MessagingClient,
  PolymorfaAuthorizationError,
  PolymorfaConfigurationError,
  PolymorfaNotFoundError,
  PolymorfaServerError,
  type HistoryChat,
  type HistoryMessage,
  type HistoryPage,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";

const chat: HistoryChat = {
  conversation: { id: "739182640518203", phoneNumber: "+14155550123" },
  kind: "direct",
  lastActivityAt: "2026-09-18T10:00:00Z",
  lastMessage: {
    id: "739182640518204",
    whatsapp_id: "wamid.1",
    direction: "inbound",
    type: "text",
    timestamp: "2026-09-18T10:00:00Z",
  },
};

const message: HistoryMessage = {
  ...chat.lastMessage,
  conversation: chat.conversation,
  fromMe: false,
  text: "Hello",
  media: [],
};

function client(
  fetch: typeof globalThis.fetch,
  type: "apiKey" | "clientToken" = "apiKey",
) {
  return new MessagingClient({
    credential:
      type === "apiKey"
        ? { type, value: ORGANIZATION_API_KEY }
        : { type, value: `pmfa_ct_${"A".repeat(94)}` },
    baseUrl: "https://api.example.com",
    maxNetworkRetries: 0,
    fetch,
  });
}

function body<T>(data: T) {
  return Response.json(data, { headers: { "polymorfa-data-region": "eu" } });
}

describe("hosted message history", () => {
  it("types and forwards conversation filters and opaque cursors", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      body<HistoryPage<HistoryChat>>({
        success: true,
        data: [chat],
        hasMore: true,
        nextCursor: "next_cursor",
        previousCursor: null,
      }),
    );
    const result = await client(fetch).chats.list("support", {
      limit: 10,
      cursor: "page_1",
      kind: "direct",
      activeSince: "2026-09-18T00:00:00Z",
      activeBefore: "2026-09-19T00:00:00Z",
    });

    expectTypeOf(result.data.data[0]).toEqualTypeOf<HistoryChat | undefined>();
    expect(result.data.data).toEqual([chat]);
    expect(result.data.nextCursor).toBe("next_cursor");
    expect(result.metadata.headers["polymorfa-data-region"]).toBe("eu");
    const [url, init] = fetch.mock.calls[0]!;
    expect(init?.method).toBe("GET");
    const request = new URL(String(url));
    expect(request.pathname).toBe("/messaging/support/chats");
    expect(Object.fromEntries(request.searchParams)).toEqual({
      limit: "10",
      cursor: "page_1",
      kind: "direct",
      activeSince: "2026-09-18T00:00:00Z",
      activeBefore: "2026-09-19T00:00:00Z",
    });
  });

  it("encodes conversation references and returns one stored chat", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      body({ success: true, data: chat }),
    );
    const result = await client(fetch).chats.retrieve(
      "support",
      "+14155550123",
    );
    expect(result.data.data).toEqual(chat);
    expect(new URL(String(fetch.mock.calls[0]![0])).pathname).toBe(
      "/messaging/support/chats/%2B14155550123",
    );
  });

  it("preserves both message paging directions and filters", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      body<HistoryPage<HistoryMessage>>({
        success: true,
        data: [message],
        hasMore: true,
        nextCursor: "older",
        previousCursor: "newer",
      }),
    );
    const result = await client(fetch).chats.listMessages(
      "support",
      "+14155550123",
      {
        limit: 20,
        cursor: "page_2",
        order: "asc",
        since: "2026-09-17T00:00:00Z",
        until: "2026-09-19T00:00:00Z",
        direction: "inbound",
        types: "text,image",
      },
    );
    expect(result.data).toMatchObject({
      data: [message],
      nextCursor: "older",
      previousCursor: "newer",
    });
    const request = new URL(String(fetch.mock.calls[0]![0]));
    expect(request.pathname).toBe(
      "/messaging/support/chats/%2B14155550123/messages",
    );
    expect(Object.fromEntries(request.searchParams)).toEqual({
      limit: "20",
      cursor: "page_2",
      order: "asc",
      since: "2026-09-17T00:00:00Z",
      until: "2026-09-19T00:00:00Z",
      direction: "inbound",
      types: "text,image",
    });
  });

  it("reads a message by its opaque string ID", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      body({ success: true, data: message }),
    );
    const result = await client(fetch).chats.retrieveMessage(
      "support",
      "+14155550123",
      "739182640518204",
    );
    expect(result.data.data.id).toBe("739182640518204");
    expect(new URL(String(fetch.mock.calls[0]![0])).pathname).toBe(
      "/messaging/support/chats/%2B14155550123/messages/739182640518204",
    );
  });

  it("rejects client tokens locally on all history reads", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const chats = client(fetch, "clientToken").chats;
    expect(() => chats.list("support")).toThrow(PolymorfaConfigurationError);
    expect(() => chats.retrieve("support", "+14155550123")).toThrow(
      PolymorfaConfigurationError,
    );
    expect(() => chats.listMessages("support", "+14155550123")).toThrow(
      PolymorfaConfigurationError,
    );
    expect(() =>
      chats.retrieveMessage("support", "+14155550123", "739182640518204"),
    ).toThrow(PolymorfaConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [403, "permission_denied", PolymorfaAuthorizationError],
    [404, "hms_not_enabled", PolymorfaNotFoundError],
    [503, "service_unavailable", PolymorfaServerError],
  ])("keeps %i %s as a typed error", async (status, code, type) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        { error: { code, message: "History unavailable." } },
        { status },
      ),
    );
    const failure = await client(fetch)
      .chats.list("support")
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(type);
    expect(failure).toMatchObject({ status, code });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
