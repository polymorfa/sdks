import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  ChannelsResource,
  MessagingClient,
  type ApiResponse,
  type ChannelLiveUpdatesResponse,
  type CreateChannelResponse,
  type DeleteChannelResponse,
  type GetChannelResponse,
  type ListChannelMessageUpdatesResponse,
  type ListChannelMessagesResponse,
  type ListChannelsResponse,
  type MarkChannelMessageViewedResponse,
  type ReactToChannelMessageResponse,
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

async function channelsServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer((request) => ({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_channels",
    },
    body: request.path.endsWith("/live-updates")
      ? '{"success":true,"data":{"durationSeconds":300}}'
      : '{"success":true,"data":[]}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new MessagingClient({
      credential: {
        type: "apiKey",
        value: ORGANIZATION_API_KEY,
      },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("MessagingClient channels", () => {
  it("maps the complete Channels tag with exact query, body, and identifier shapes", async () => {
    const { client, requests } = await channelsServer();
    const channels = client.channels;
    const session = "support/eu";
    const channelId = "120363/7@newsletter";
    const mutationOptions = { idempotencyKey: "channel-action-1" };

    const listed = await channels.list(session);
    const created = await channels.create(
      session,
      {
        name: "Product updates",
        description: "New releases",
        picture: "https://cdn.example/channel.jpg",
      },
      mutationOptions,
    );
    const retrieved = await channels.retrieve(session, channelId);
    const deleted = await channels.delete(session, channelId, mutationOptions);
    const messages = await channels.listMessages(session, channelId, {
      count: 25,
      before: 91,
    });
    const updates = await channels.listMessageUpdates(session, channelId, {
      count: 10,
      since: 1_787_212_800,
      after: 92,
    });
    const viewed = await channels.markMessageViewed(
      session,
      channelId,
      93,
      mutationOptions,
    );
    const reacted = await channels.reactToMessage(
      session,
      channelId,
      94,
      { reaction: "🔥" },
      mutationOptions,
    );
    const liveUpdates = await channels.subscribeToLiveUpdates(
      session,
      channelId,
      mutationOptions,
    );
    await channels.follow(session, channelId, mutationOptions);
    await channels.unfollow(session, channelId, mutationOptions);
    await channels.mute(session, channelId, mutationOptions);
    await channels.unmute(session, channelId, mutationOptions);

    expectTypeOf<
      MessagingClient["channels"]
    >().toEqualTypeOf<ChannelsResource>();
    expectTypeOf(listed).toEqualTypeOf<ApiResponse<ListChannelsResponse>>();
    expectTypeOf(created).toEqualTypeOf<ApiResponse<CreateChannelResponse>>();
    expectTypeOf(retrieved).toEqualTypeOf<ApiResponse<GetChannelResponse>>();
    expectTypeOf(deleted).toEqualTypeOf<ApiResponse<DeleteChannelResponse>>();
    expectTypeOf(messages).toEqualTypeOf<
      ApiResponse<ListChannelMessagesResponse>
    >();
    expectTypeOf(updates).toEqualTypeOf<
      ApiResponse<ListChannelMessageUpdatesResponse>
    >();
    expectTypeOf(viewed).toEqualTypeOf<
      ApiResponse<MarkChannelMessageViewedResponse>
    >();
    expectTypeOf(reacted).toEqualTypeOf<
      ApiResponse<ReactToChannelMessageResponse>
    >();
    expectTypeOf(liveUpdates).toEqualTypeOf<
      ApiResponse<ChannelLiveUpdatesResponse>
    >();
    expect(liveUpdates.data).toEqual({
      success: true,
      data: { durationSeconds: 300 },
    });
    expect(liveUpdates.metadata.requestId).toBe("req_channels");

    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      { method: "GET", path: "/api/support%2Feu/channels", body: "" },
      {
        method: "POST",
        path: "/api/support%2Feu/channels",
        body: '{"name":"Product updates","description":"New releases","picture":"https://cdn.example/channel.jpg"}',
      },
      {
        method: "GET",
        path: "/api/support%2Feu/channels/120363%2F7%40newsletter",
        body: "",
      },
      {
        method: "DELETE",
        path: "/api/support%2Feu/channels/120363%2F7%40newsletter",
        body: "",
      },
      {
        method: "GET",
        path: "/api/support%2Feu/channels/120363%2F7%40newsletter/messages?count=25&before=91",
        body: "",
      },
      {
        method: "GET",
        path: "/api/support%2Feu/channels/120363%2F7%40newsletter/message-updates?count=10&since=1787212800&after=92",
        body: "",
      },
      {
        method: "POST",
        path: "/api/support%2Feu/channels/120363%2F7%40newsletter/messages/93/viewed",
        body: "",
      },
      {
        method: "POST",
        path: "/api/support%2Feu/channels/120363%2F7%40newsletter/messages/94/reaction",
        body: '{"reaction":"🔥"}',
      },
      {
        method: "POST",
        path: "/api/support%2Feu/channels/120363%2F7%40newsletter/live-updates",
        body: "",
      },
      {
        method: "POST",
        path: "/api/support%2Feu/channels/120363%2F7%40newsletter/follow",
        body: "",
      },
      {
        method: "POST",
        path: "/api/support%2Feu/channels/120363%2F7%40newsletter/unfollow",
        body: "",
      },
      {
        method: "POST",
        path: "/api/support%2Feu/channels/120363%2F7%40newsletter/mute",
        body: "",
      },
      {
        method: "POST",
        path: "/api/support%2Feu/channels/120363%2F7%40newsletter/unmute",
        body: "",
      },
    ]);
    expect(
      requests
        .filter(({ method }) => method !== "GET")
        .map(({ headers }) => headers["idempotency-key"]),
    ).toEqual(Array.from({ length: 9 }, () => "channel-action-1"));
  });
});
