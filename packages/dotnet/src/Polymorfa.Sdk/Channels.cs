using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record Channel(string? Id = null, string? Name = null, string? Description = null, string? ProfileUrl = null, long? Followers = null, bool? Muted = null, bool? Preview = null);
public sealed record CreateChannelRequest(string Name, string? Description = null, string? Picture = null);
public sealed record ChannelMessage(long Position, string Id, [property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, ConversationReference Conversation, string Type, string Timestamp, long Views, IReadOnlyDictionary<string, long> ReactionCounts, string? Text = null, [property: JsonPropertyName("whatsapp_id")] string? WhatsAppId = null);
public sealed record ChannelMessagesParameters(int? Count = null, long? Before = null);
public sealed record ChannelMessageUpdatesParameters(int? Count = null, long? Since = null, long? After = null);
public sealed record ChannelReactionRequest(string Reaction);
public sealed record ChannelLiveUpdates(int DurationSeconds);
public sealed record CommandResponse<T>(bool Success, CommandResult<T>? Data = null, string? Message = null);
public sealed class Channels : Resource
{
    internal Channels(HttpTransport http) : base(http) { }
    private static string Path(string connection) => $"/messaging/{E(connection)}/channels";
    private static string Path(string connection, string channel) => Path(connection) + "/" + E(channel);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<Channel>>>> ListAsync(string connection, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<Channel>>>(Path(connection), options);
    public Task<ApiResponse<SuccessEnvelope<CommandResult<Channel>>>> CreateAsync(string connection, CreateChannelRequest body, RequestOptions? options = null) => Post<SuccessEnvelope<CommandResult<Channel>>>(Path(connection), body, options);
    public Task<ApiResponse<SuccessEnvelope<Channel>>> RetrieveAsync(string connection, string channelId, RequestOptions? options = null) => Get<SuccessEnvelope<Channel>>(Path(connection, channelId), options);
    public Task<ApiResponse<SuccessEnvelope<CommandResult<StatusResult>>>> DeleteAsync(string connection, string channelId, RequestOptions? options = null) => Delete<SuccessEnvelope<CommandResult<StatusResult>>>(Path(connection, channelId), options);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<ChannelMessage>>>> ListMessagesAsync(string connection, string channelId, ChannelMessagesParameters? parameters = null, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<ChannelMessage>>>(Path(connection, channelId) + "/messages", options, parameters);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<ChannelMessage>>>> ListMessageUpdatesAsync(string connection, string channelId, ChannelMessageUpdatesParameters? parameters = null, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<ChannelMessage>>>(Path(connection, channelId) + "/message-updates", options, parameters);
    public Task<ApiResponse<CommandResponse<StatusResult>>> MarkMessageViewedAsync(string connection, string channelId, string messageId, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(connection, channelId) + "/messages/" + E(messageId) + "/viewed", null, options);
    public Task<ApiResponse<CommandResponse<StatusResult>>> ReactToMessageAsync(string connection, string channelId, string messageId, ChannelReactionRequest body, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(connection, channelId) + "/messages/" + E(messageId) + "/reaction", body, (options ?? new()).WithIdempotency());
    public Task<ApiResponse<SuccessEnvelope<CommandResult<ChannelLiveUpdates>>>> SubscribeToLiveUpdatesAsync(string connection, string channelId, RequestOptions? options = null) => Post<SuccessEnvelope<CommandResult<ChannelLiveUpdates>>>(Path(connection, channelId) + "/live-updates", null, options);
    public Task<ApiResponse<CommandResponse<StatusResult>>> FollowAsync(string connection, string channelId, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(connection, channelId) + "/follow", null, options);
    public Task<ApiResponse<CommandResponse<StatusResult>>> UnfollowAsync(string connection, string channelId, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(connection, channelId) + "/unfollow", null, options);
    public Task<ApiResponse<CommandResponse<StatusResult>>> MuteAsync(string connection, string channelId, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(connection, channelId) + "/mute", null, options);
    public Task<ApiResponse<CommandResponse<StatusResult>>> UnmuteAsync(string connection, string channelId, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(connection, channelId) + "/unmute", null, options);
}
public sealed record BusinessQuickReplyMutation(string Shortcut, string Message, IReadOnlyList<string>? Keywords = null, int? Count = null);
public record BusinessQuickReply(string Id, string Shortcut, string Message, IReadOnlyList<string>? Keywords = null, int? Count = null);
public sealed record BusinessQuickReplyObserved(string Id, string Shortcut, string Message, IReadOnlyList<string> AssociatedLabelIds, string ObservedAt, IReadOnlyList<string>? Keywords = null, int? Count = null) : BusinessQuickReply(Id, Shortcut, Message, Keywords, Count);
public sealed record BusinessQuickReplyCollection(string Policy, string Status, IReadOnlyList<BusinessQuickReplyObserved> QuickReplies, string? UnknownReason = null, string? ObservedAt = null);
public sealed record DeletedBusinessQuickReply(string Id, string Status);
public sealed class QuickReplies : Resource
{
    internal QuickReplies(HttpTransport http) : base(http) { }
    private static string Path(string connection) => $"/messaging/{E(connection)}/business/quick-replies";
    public Task<ApiResponse<SuccessEnvelope<BusinessQuickReplyCollection>>> ListAsync(string connection, RequestOptions? options = null) => Get<SuccessEnvelope<BusinessQuickReplyCollection>>(Path(connection), options);
    public Task<ApiResponse<SuccessEnvelope<BusinessQuickReply>>> CreateAsync(string connection, BusinessQuickReplyMutation body, RequestOptions? options = null) => Post<SuccessEnvelope<BusinessQuickReply>>(Path(connection), body, options);
    public Task<ApiResponse<SuccessEnvelope<BusinessQuickReply>>> ReplaceAsync(string connection, string quickReplyId, BusinessQuickReplyMutation body, RequestOptions? options = null) => Put<SuccessEnvelope<BusinessQuickReply>>(Path(connection) + "/" + E(quickReplyId), body, options);
    public Task<ApiResponse<SuccessEnvelope<DeletedBusinessQuickReply>>> DeleteAsync(string connection, string quickReplyId, RequestOptions? options = null) => Delete<SuccessEnvelope<DeletedBusinessQuickReply>>(Path(connection) + "/" + E(quickReplyId), options);
}
