import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  HistoryPage,
  MessagingClient,
  type HistoryMessage,
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

const message = (id: string): HistoryMessage => ({
  id,
  whatsapp_id: `WA-${id}`,
  conversation: { id: "739182640518203" },
  direction: "inbound",
  fromMe: false,
  type: "text",
  timestamp: "2026-09-18T10:00:00.000Z",
  text: `m${id}`,
});

async function historyServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer((request) => {
    const url = new URL(request.path, "http://x");
    const cursor = url.searchParams.get("cursor");
    let body: unknown;
    if (url.pathname.endsWith("/chats")) {
      body = {
        success: true,
        data: [
          {
            conversation: { id: "1" },
            kind: "direct",
            lastActivityAt: "2026-09-18T10:00:00.000Z",
            lastMessage: {
              id: "2",
              whatsapp_id: "WA",
              direction: "inbound",
              type: "text",
              timestamp: "2026-09-18T10:00:00.000Z",
            },
          },
        ],
        hasMore: false,
        nextCursor: null,
        previousCursor: null,
      };
    } else if (url.pathname.endsWith("/messages")) {
      body =
        cursor === null
          ? {
              success: true,
              data: [message("1"), message("2")],
              hasMore: true,
              nextCursor: "page2",
              previousCursor: null,
            }
          : cursor === "page2"
            ? {
                success: true,
                data: [message("3")],
                hasMore: false,
                nextCursor: null,
                previousCursor: "back1",
              }
            : {
                success: true,
                data: [message("1"), message("2")],
                hasMore: true,
                nextCursor: "page2",
                previousCursor: null,
              };
    } else {
      body = { success: true, data: message("9") };
    }
    return {
      status: 200,
      headers: {
        "content-type": "application/json",
        "polymorfa-data-region": "ch",
      },
      body: JSON.stringify(body),
    };
  });
  servers.push(server);
  return {
    requests: server.requests,
    client: new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("MessagingClient message history", () => {
  it("lists conversations with filters and exposes the data region", async () => {
    const { client, requests } = await historyServer();
    const page = await client.chats.list("support line", {
      limit: 20,
      kind: "group",
      activeSince: new Date("2026-09-01T00:00:00Z"),
    });
    expect(page).toBeInstanceOf(HistoryPage);
    expect(page.items[0]?.kind).toBe("direct");
    expect(page.hasMore).toBe(false);
    expect(page.dataRegion).toBe("ch");
    const url = new URL(requests[0]!.path, "http://x");
    expect(url.pathname).toBe("/messaging/support%20line/chats");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "20",
      kind: "group",
      activeSince: "2026-09-01T00:00:00.000Z",
    });
  });

  it("auto-paginates messages forward and walks back with previousPage", async () => {
    const { client, requests } = await historyServer();
    const first = await client.messages.list("primary", "+15550001111", {
      limit: 2,
      order: "desc",
      direction: "inbound",
      types: ["text", "image"],
      since: "2026-09-01T00:00:00Z",
    });
    const ids: string[] = [];
    for await (const item of first) ids.push(item.id);
    expect(ids).toEqual(["1", "2", "3"]);
    const url = new URL(requests[0]!.path, "http://x");
    expect(url.pathname).toBe(
      "/messaging/primary/chats/%2B15550001111/messages",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "2",
      order: "desc",
      direction: "inbound",
      types: "text,image",
      since: "2026-09-01T00:00:00Z",
    });
    expect(
      new URL(requests[1]!.path, "http://x").searchParams.get("cursor"),
    ).toBe("page2");

    const second = await first.nextPage();
    expect(second?.hasPrevious).toBe(true);
    const back = await second!.previousPage();
    expect(back?.items.map((m) => m.id)).toEqual(["1", "2"]);
    expect(
      new URL(requests.at(-1)!.path, "http://x").searchParams.get("cursor"),
    ).toBe("back1");
    expect(first.hasPrevious).toBe(false);
    expect(await first.previousPage()).toBeNull();
  });

  it("gets one conversation and one message", async () => {
    const { client, requests } = await historyServer();
    await client.chats.get("primary", "739182640518203");
    const got = await client.messages.get(
      "primary",
      "739182640518203",
      "739182640518977",
    );
    expect(got.data.data.id).toBe("9");
    expect(requests.map((r) => r.path)).toEqual([
      "/messaging/primary/chats/739182640518203",
      "/messaging/primary/chats/739182640518203/messages/739182640518977",
    ]);
  });
});
