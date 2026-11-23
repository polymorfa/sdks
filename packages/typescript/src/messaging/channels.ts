import { HttpTransport } from "../transport/http.js";
import { withIdempotencyKey } from "../transport/idempotency.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  ChannelActionResponse,
  ChannelActionStatus,
  ChannelLiveUpdatesResponse,
  ChannelMessageUpdatesParams,
  ChannelMessagesParams,
  ChannelReactionRequest,
  CreateChannelRequest,
  CreateChannelResponse,
  DeleteChannelResponse,
  FollowChannelResponse,
  GetChannelResponse,
  ListChannelMessageUpdatesResponse,
  ListChannelMessagesResponse,
  ListChannelsResponse,
  MarkChannelMessageViewedResponse,
  MuteChannelResponse,
  ReactToChannelMessageResponse,
  UnfollowChannelResponse,
  UnmuteChannelResponse,
} from "./types.js";

export class ChannelsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListChannelsResponse>> {
    return this.transport.request({
      method: "GET",
      path: channelsPath(connection),
      ...options,
    });
  }

  create(
    connection: string,
    body: CreateChannelRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateChannelResponse>> {
    return this.transport.request({
      method: "POST",
      path: channelsPath(connection),
      body,
      ...options,
    });
  }

  retrieve(
    connection: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetChannelResponse>> {
    return this.transport.request({
      method: "GET",
      path: channelPath(connection, channelId),
      ...options,
    });
  }

  delete(
    connection: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeleteChannelResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: channelPath(connection, channelId),
      ...options,
    });
  }

  listMessages(
    connection: string,
    channelId: string,
    params: ChannelMessagesParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListChannelMessagesResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${channelPath(connection, channelId)}/messages`,
      query: { count: params.count, before: params.before },
      ...options,
    });
  }

  listMessageUpdates(
    connection: string,
    channelId: string,
    params: ChannelMessageUpdatesParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListChannelMessageUpdatesResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${channelPath(connection, channelId)}/message-updates`,
      query: {
        count: params.count,
        since: params.since,
        after: params.after,
      },
      ...options,
    });
  }

  markMessageViewed(
    connection: string,
    channelId: string,
    messageId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<MarkChannelMessageViewedResponse>> {
    return this.messageAction(
      connection,
      channelId,
      messageId,
      "viewed",
      undefined,
      options,
    );
  }

  reactToMessage(
    connection: string,
    channelId: string,
    messageId: string,
    body: ChannelReactionRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ReactToChannelMessageResponse>> {
    return this.messageAction(
      connection,
      channelId,
      messageId,
      "reaction",
      body,
      withIdempotencyKey(options),
    );
  }

  subscribeToLiveUpdates(
    connection: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ChannelLiveUpdatesResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${channelPath(connection, channelId)}/live-updates`,
      ...options,
    });
  }

  follow(
    connection: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FollowChannelResponse>> {
    return this.channelAction(connection, channelId, "follow", options);
  }

  unfollow(
    connection: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UnfollowChannelResponse>> {
    return this.channelAction(connection, channelId, "unfollow", options);
  }

  mute(
    connection: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<MuteChannelResponse>> {
    return this.channelAction(connection, channelId, "mute", options);
  }

  unmute(
    connection: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UnmuteChannelResponse>> {
    return this.channelAction(connection, channelId, "unmute", options);
  }

  private channelAction<Status extends ChannelActionStatus>(
    connection: string,
    channelId: string,
    action: "follow" | "unfollow" | "mute" | "unmute",
    options: RequestOptions,
  ): Promise<ApiResponse<ChannelActionResponse<Status>>> {
    return this.transport.request({
      method: "POST",
      path: `${channelPath(connection, channelId)}/${action}`,
      ...options,
    });
  }

  private messageAction<Status extends ChannelActionStatus>(
    connection: string,
    channelId: string,
    messageId: string,
    action: "viewed" | "reaction",
    body: ChannelReactionRequest | undefined,
    options: RequestOptions,
  ): Promise<ApiResponse<ChannelActionResponse<Status>>> {
    return this.transport.request({
      method: "POST",
      path: `${channelPath(connection, channelId)}/messages/${encodeURIComponent(messageId)}/${action}`,
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }
}

function channelsPath(connection: string): string {
  return `/messaging/${encodeURIComponent(connection)}/channels`;
}

function channelPath(connection: string, channelId: string): string {
  return `${channelsPath(connection)}/${encodeURIComponent(channelId)}`;
}
