using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record Contact(string Id, string Name, string PushName, string? Bsuid = null, string? PhoneNumber = null, string? BusinessName = null, string? ProfileUrl = null, string? Username = null);
public sealed record CheckContactResult(bool Exists, string? Bsuid = null, string? PhoneNumber = null, string? Id = null, string? Username = null);
public sealed record ContactBlocklist(string Hash, IReadOnlyList<ConversationReference> Contacts);
public sealed record ContactDevice(string Id, int Device, string? Bsuid = null, string? PhoneNumber = null, string? Username = null);
public sealed record ContactUserInfo(string Id, string Status, string PictureId, string VerifiedName, IReadOnlyList<ContactDevice> Devices, string? Bsuid = null, string? PhoneNumber = null, string? Username = null);
public sealed record ContactPicture(string Url);
public sealed record BusinessProfileCategory(string Id, string Name);
public sealed record BusinessProfileHours(string DayOfWeek, string Mode, string OpenTime, string CloseTime);
public sealed record BusinessProfile(string Id, string Address, string Email, string Description, IReadOnlyList<string> Websites, string CoverPhotoId, IReadOnlyList<BusinessProfileCategory> Categories, IReadOnlyDictionary<string, string> Options, string HoursTimeZone, IReadOnlyList<BusinessProfileHours> Hours, string? Bsuid = null, string? PhoneNumber = null, string? Username = null);
public sealed record ProfileData(string Name, string Status, string? ProfilePicUrl = null, string? PhonePlatform = null, string? AccountType = null);
public sealed record SetProfileNameRequest(string Name);
public sealed record SetProfileStatusRequest(string Status);
public sealed record PictureRequest(string? Url = null, string? Base64 = null);
public sealed record PrivacySettings(string GroupAdd, string LastSeen, string Status, string Profile, string ReadReceipts, string Online, string CallAdd, string Messages, string Defense, string Stickers);
public sealed record PrivacySettingRequest(string Setting, string Value);
public sealed record DisappearingTimerRequest(long DurationSeconds);
public sealed record EditMessageRequest(string Text, string? Transport = null);
public sealed record GroupParticipant(string Id, bool IsAdmin, bool IsSuperAdmin, string? Bsuid = null, string? PhoneNumber = null, string? Username = null);
public sealed record Group(string Id, string Name, string Description, long CreatedAt, IReadOnlyList<GroupParticipant> Participants, string OwnerId);
public sealed record GroupInviteInfo(string Id, string Subject, long CreatedAt, int Size, IReadOnlyList<GroupParticipant> Participants, string CreatorId);
public sealed record GroupInviteCode(string Code);
public sealed record CreateGroupRequest(string Name, IReadOnlyList<string> Participants);
public sealed record GroupFieldRequest(string Value);
public sealed record GroupParticipantsRequest(IReadOnlyList<string> Participants);
public sealed record JoinGroupRequest(string Code);
public sealed record GroupAdminOnlyRequest(bool AdminsOnly);
public sealed record GroupMemberAddRequest(string Mode);
public sealed record GroupJoinApprovalRequest(bool Required);
public sealed record GroupCapability(string Key, string Kind, string? Unit, bool? Value, string? Source);
public sealed record GroupCapabilities(string Status, string? SyncedAt, string? CheckedAt, IReadOnlyList<GroupCapability> Capabilities);
public sealed record Label(string Id, string Name, int Color, int? OrderIndex = null, int? ChatCount = null, string? ObservedAt = null);
public sealed record LabelCollection(string Policy, string Status, IReadOnlyList<Label> Labels, string? UnknownReason = null, string? ObservedAt = null, string? ExpiresAt = null);
[JsonConverter(typeof(LabelReadDataConverter))]
public sealed record LabelReadData(IReadOnlyList<Label> Labels, LabelCollection? Observation = null);
internal sealed class LabelReadDataConverter : JsonConverter<LabelReadData>
{
    public override LabelReadData Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var document = JsonDocument.ParseValue(ref reader);
        if (document.RootElement.ValueKind == JsonValueKind.Array) return new(document.RootElement.Deserialize<IReadOnlyList<Label>>(options)!);
        var observation = document.RootElement.Deserialize<LabelCollection>(options) ?? throw new JsonException("Invalid label collection.");
        return new(observation.Labels, observation);
    }
    public override void Write(Utf8JsonWriter writer, LabelReadData value, JsonSerializerOptions options) { if (value.Observation is null) JsonSerializer.Serialize(writer, value.Labels, options); else JsonSerializer.Serialize(writer, value.Observation, options); }
}
public sealed record ListLabelsParameters(bool? IncludeObservation = null);
public sealed record CreateLabelRequest(string Name, int? Color = null);
public sealed record UpdateLabelRequest(string? Name = null, int? Color = null);
public sealed record ReplaceChatLabelsRequest(IReadOnlyList<string> Labels);
public sealed record SetPresenceRequest(string Presence);
public sealed record PresenceData(bool Authoritative, string? Desired = null, string? DesiredAt = null, string? LastSent = null, string? LastSentAt = null);
public sealed record PresenceChatState(string Sender, string State, string ObservedAt, bool Stale, string? Media = null);
public sealed record ChatPresenceData(string Policy, string Status, bool Stale, string TypingPolicy, string TypingStatus, string? UnknownReason = null, bool? Available = null, string? LastSeen = null, string? ObservedAt = null, string? SubscriptionExpiresAt = null, string? TypingUnknownReason = null, PresenceChatState? ChatState = null);
public sealed record PresenceSubscription(string Status, string ExpiresAt);
public sealed record AsyncCommandData(string? Status = null, string? RequestId = null);
public sealed record AsyncCommandResponse(bool Success, AsyncCommandData? Data = null, string? Message = null);
public sealed record HistoryMessageSummary(string Id, [property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, string Direction, string Type, string Timestamp, [property: JsonPropertyName("whatsapp_id")] string? WhatsAppId = null);
public sealed record HistoryChat(ConversationReference Conversation, string Kind, string LastActivityAt, HistoryMessageSummary LastMessage);
public sealed record HistoryConversation(string Id, string? PhoneNumber = null, string? Bsuid = null, string? Username = null, ConversationReference? Sender = null);
public sealed record HistoryMedia(string Id, string MimeType, long FileLength, string Url);
public sealed record HistoryMediaRetrieval(string State, string? Reason = null);
public sealed record HistoryPollOption(string Name, string Hash);
public sealed record HistoryMessage(string Id, [property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, string Direction, string Type, string Timestamp, HistoryConversation Conversation, bool FromMe, string? PushName = null, string? Text = null, string? Caption = null, string? MimeType = null, string? Filename = null, bool? Ptt = null, double? Latitude = null, double? Longitude = null, string? DisplayName = null, string? Title = null, string? Reaction = null, string? ReactionTo = null, bool? Edited = null, bool? Unavailable = null, string? UnavailableReason = null, IReadOnlyList<HistoryPollOption>? PollOptions = null, IReadOnlyList<HistoryMedia>? Media = null, HistoryMediaRetrieval? MediaRetrieval = null, [property: JsonPropertyName("whatsapp_id")] string? WhatsAppId = null);
public sealed record HistoryPage<T>(bool Success, IReadOnlyList<T> Data, bool HasMore, string? NextCursor, string? PreviousCursor);
public sealed record ListHistoryChatsParameters(int? Limit = null, string? Cursor = null, string? Kind = null, string? ActiveSince = null, string? ActiveBefore = null);
public sealed record ListHistoryMessagesParameters(int? Limit = null, string? Cursor = null, string? Order = null, string? Since = null, string? Until = null, string? Direction = null, string? Types = null);
