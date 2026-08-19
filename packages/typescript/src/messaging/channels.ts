import { HttpTransport } from "../transport/http.js";
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
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListChannelsResponse>> {
    return this.transport.request({
      method: "GET",
      path: channelsPath(session),
      ...options,
    });
  }

  create(
    session: string,
    body: CreateChannelRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateChannelResponse>> {
    return this.transport.request({
      method: "POST",
      path: channelsPath(session),
      body,
      ...options,
    });
  }

  retrieve(
    session: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetChannelResponse>> {
    return this.transport.request({
      method: "GET",
      path: channelPath(session, channelId),
      ...options,
    });
  }

  delete(
    session: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeleteChannelResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: channelPath(session, channelId),
      ...options,
    });
  }

  listMessages(
    session: string,
    channelId: string,
    params: ChannelMessagesParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListChannelMessagesResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${channelPath(session, channelId)}/messages`,
      query: { count: params.count, before: params.before },
      ...options,
    });
  }

  listMessageUpdates(
    session: string,
    channelId: string,
    params: ChannelMessageUpdatesParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListChannelMessageUpdatesResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${channelPath(session, channelId)}/message-updates`,
      query: {
        count: params.count,
        since: params.since,
        after: params.after,
      },
      ...options,
    });
  }

  markMessageViewed(
    session: string,
    channelId: string,
    serverId: number,
    options: RequestOptions = {},
  ): Promise<ApiResponse<MarkChannelMessageViewedResponse>> {
    return this.messageAction(
      session,
      channelId,
      serverId,
      "viewed",
      undefined,
      options,
    );
  }

  reactToMessage(
    session: string,
    channelId: string,
    serverId: number,
    body: ChannelReactionRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ReactToChannelMessageResponse>> {
    return this.messageAction(
      session,
      channelId,
      serverId,
      "reaction",
      body,
      options,
    );
  }

  subscribeToLiveUpdates(
    session: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ChannelLiveUpdatesResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${channelPath(session, channelId)}/live-updates`,
      ...options,
    });
  }

  follow(
    session: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FollowChannelResponse>> {
    return this.channelAction(session, channelId, "follow", options);
  }

  unfollow(
    session: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UnfollowChannelResponse>> {
    return this.channelAction(session, channelId, "unfollow", options);
  }

  mute(
    session: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<MuteChannelResponse>> {
    return this.channelAction(session, channelId, "mute", options);
  }

  unmute(
    session: string,
    channelId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UnmuteChannelResponse>> {
    return this.channelAction(session, channelId, "unmute", options);
  }

  private channelAction<Status extends ChannelActionStatus>(
    session: string,
    channelId: string,
    action: "follow" | "unfollow" | "mute" | "unmute",
    options: RequestOptions,
  ): Promise<ApiResponse<ChannelActionResponse<Status>>> {
    return this.transport.request({
      method: "POST",
      path: `${channelPath(session, channelId)}/${action}`,
      ...options,
    });
  }

  private messageAction<Status extends ChannelActionStatus>(
    session: string,
    channelId: string,
    serverId: number,
    action: "viewed" | "reaction",
    body: ChannelReactionRequest | undefined,
    options: RequestOptions,
  ): Promise<ApiResponse<ChannelActionResponse<Status>>> {
    return this.transport.request({
      method: "POST",
      path: `${channelPath(session, channelId)}/messages/${encodeURIComponent(String(serverId))}/${action}`,
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }
}

function channelsPath(session: string): string {
  return `/api/${encodeURIComponent(session)}/channels`;
}

function channelPath(session: string, channelId: string): string {
  return `${channelsPath(session)}/${encodeURIComponent(channelId)}`;
}
