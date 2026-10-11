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
    private static string Path(string session) => $"/messaging/{E(session)}/channels";
    private static string Path(string session, string channel) => Path(session) + "/" + E(channel);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<Channel>>>> ListAsync(string session, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<Channel>>>(Path(session), options);
    public Task<ApiResponse<SuccessEnvelope<CommandResult<Channel>>>> CreateAsync(string session, CreateChannelRequest body, RequestOptions? options = null) => Post<SuccessEnvelope<CommandResult<Channel>>>(Path(session), body, options);
    public Task<ApiResponse<SuccessEnvelope<Channel>>> RetrieveAsync(string session, string channelId, RequestOptions? options = null) => Get<SuccessEnvelope<Channel>>(Path(session, channelId), options);
    public Task<ApiResponse<SuccessEnvelope<CommandResult<StatusResult>>>> DeleteAsync(string session, string channelId, RequestOptions? options = null) => Delete<SuccessEnvelope<CommandResult<StatusResult>>>(Path(session, channelId), options);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<ChannelMessage>>>> ListMessagesAsync(string session, string channelId, ChannelMessagesParameters? parameters = null, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<ChannelMessage>>>(Path(session, channelId) + "/messages", options, parameters);
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<ChannelMessage>>>> ListMessageUpdatesAsync(string session, string channelId, ChannelMessageUpdatesParameters? parameters = null, RequestOptions? options = null) => Get<SuccessEnvelope<IReadOnlyList<ChannelMessage>>>(Path(session, channelId) + "/message-updates", options, parameters);
    public Task<ApiResponse<CommandResponse<StatusResult>>> MarkMessageViewedAsync(string session, string channelId, string messageId, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(session, channelId) + "/messages/" + E(messageId) + "/viewed", null, options);
    public Task<ApiResponse<CommandResponse<StatusResult>>> ReactToMessageAsync(string session, string channelId, string messageId, ChannelReactionRequest body, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(session, channelId) + "/messages/" + E(messageId) + "/reaction", body, (options ?? new()).WithIdempotency());
    public Task<ApiResponse<SuccessEnvelope<CommandResult<ChannelLiveUpdates>>>> SubscribeToLiveUpdatesAsync(string session, string channelId, RequestOptions? options = null) => Post<SuccessEnvelope<CommandResult<ChannelLiveUpdates>>>(Path(session, channelId) + "/live-updates", null, options);
    public Task<ApiResponse<CommandResponse<StatusResult>>> FollowAsync(string session, string channelId, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(session, channelId) + "/follow", null, options);
    public Task<ApiResponse<CommandResponse<StatusResult>>> UnfollowAsync(string session, string channelId, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(session, channelId) + "/unfollow", null, options);
    public Task<ApiResponse<CommandResponse<StatusResult>>> MuteAsync(string session, string channelId, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(session, channelId) + "/mute", null, options);
    public Task<ApiResponse<CommandResponse<StatusResult>>> UnmuteAsync(string session, string channelId, RequestOptions? options = null) => Post<CommandResponse<StatusResult>>(Path(session, channelId) + "/unmute", null, options);
}
public sealed record BusinessQuickReplyMutation(string Shortcut, string Message, IReadOnlyList<string>? Keywords = null, int? Count = null);
public record BusinessQuickReply(string Id, string Shortcut, string Message, IReadOnlyList<string>? Keywords = null, int? Count = null);
public sealed record BusinessQuickReplyObserved(string Id, string Shortcut, string Message, IReadOnlyList<string> AssociatedLabelIds, string ObservedAt, IReadOnlyList<string>? Keywords = null, int? Count = null) : BusinessQuickReply(Id, Shortcut, Message, Keywords, Count);
public sealed record BusinessQuickReplyCollection(string Policy, string Status, IReadOnlyList<BusinessQuickReplyObserved> QuickReplies, string? UnknownReason = null, string? ObservedAt = null);
public sealed record DeletedBusinessQuickReply(string Id, string Status);
public sealed class QuickReplies : Resource
{
    internal QuickReplies(HttpTransport http) : base(http) { }
    private static string Path(string session) => $"/messaging/{E(session)}/business/quick-replies";
    public Task<ApiResponse<SuccessEnvelope<BusinessQuickReplyCollection>>> ListAsync(string session, RequestOptions? options = null) => Get<SuccessEnvelope<BusinessQuickReplyCollection>>(Path(session), options);
    public Task<ApiResponse<SuccessEnvelope<BusinessQuickReply>>> CreateAsync(string session, BusinessQuickReplyMutation body, RequestOptions? options = null) => Post<SuccessEnvelope<BusinessQuickReply>>(Path(session), body, options);
    public Task<ApiResponse<SuccessEnvelope<BusinessQuickReply>>> ReplaceAsync(string session, string quickReplyId, BusinessQuickReplyMutation body, RequestOptions? options = null) => Put<SuccessEnvelope<BusinessQuickReply>>(Path(session) + "/" + E(quickReplyId), body, options);
    public Task<ApiResponse<SuccessEnvelope<DeletedBusinessQuickReply>>> DeleteAsync(string session, string quickReplyId, RequestOptions? options = null) => Delete<SuccessEnvelope<DeletedBusinessQuickReply>>(Path(session) + "/" + E(quickReplyId), options);
}
