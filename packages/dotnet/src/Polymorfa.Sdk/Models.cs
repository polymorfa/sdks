using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record DataEnvelope<T>([property: JsonRequired] T Data);
public sealed record SuccessEnvelope<T>(bool Success, T Data);
public sealed record SuccessResponse(bool Success, string? Message);
public sealed record OperationAccepted(bool Success, string Message, string OperationId);
public sealed record StatusResult(string Status);
public sealed record Session(string SessionId, string Name, string? ExternalId, string TenantId, string Type, bool TestMode, string Status, string? StatusReason, SessionConfigurationView? Configuration, NewChatCapping? NewChatCapping, string CreatedAt, string UpdatedAt);
public sealed record NewChatCapping(bool? Enabled, bool Pacing, string? Status, bool Capped, long? Limit, long? Used, long? Remaining, string? CycleStartsAt, string? ResetsAt, string ObservedAt);
public sealed record PlatformSession([property: JsonPropertyName("_id")] string Id, [property: JsonPropertyName("_creationTime")] long CreationTime, string ProjectId, string SessionId, string Name, string? Phone, string? Platform, bool IsBusiness, bool TestMode, string? TierOverride, string Status, long MessageCount, long? LastActiveAt, long? PaidUntil);
public sealed record SessionStartResult(bool Starting, string SessionId);
public sealed record SessionStopResult(bool Stopping, string SessionId);
public sealed record SessionRemoveResult(bool Removed, string SessionId);
public sealed record PairCodeRequest(string Phone);
public sealed record PairCode(string Code);
public sealed record QrCode(string? Qr, string? Event);
public sealed record WhatsAppAccount(string? Id, string? Bsuid, string? Username, string? PhoneNumber, string PushName, string? BusinessName, string? PhonePlatform, string? AccountType, string? ProfilePicUrl);

public sealed record ConversationReference(string? Id = null, string? PhoneNumber = null, string? Bsuid = null, string? Username = null);
public sealed record QuotedMessage(string Id, string? Type = null, string? Text = null);
public sealed record SendMessageRequest(ConversationReference Conversation, MessageContent Content, string? Transport = null, bool? IsForwarded = null, IReadOnlyList<string>? Mentions = null, QuotedMessage? QuotedMessage = null);
public abstract record MessageContent;
public sealed record TextContent(string Text) : MessageContent;
public sealed record ImageContent(MediaContent Image) : MessageContent;
public sealed record VideoContent(MediaContent Video) : MessageContent;
public sealed record FileContent(FileMediaContent File) : MessageContent;
public sealed record VoiceContent(VoiceMediaContent Voice) : MessageContent;
public sealed record PollContent(PollMessage Poll) : MessageContent;
public sealed record LocationContent(LocationMessage Location) : MessageContent;
public sealed record ContactContent(ContactMessage Contact) : MessageContent;
public sealed record MediaContent(string? Url = null, string? Base64 = null, string? MimeType = null, string? Caption = null);
public sealed record FileMediaContent(string? Url = null, string? Base64 = null, string? MimeType = null, string? Caption = null, string? Filename = null);
public sealed record VoiceMediaContent(string? Url = null, string? Base64 = null, string? MimeType = null, string? Caption = null, bool? Ptt = null);
public sealed record PollMessage(string Title, IReadOnlyList<string> Options, bool? MultiSelect = null);
public sealed record LocationMessage(double Lat, double Long, string? Address = null);
public sealed record ContactMessage(string Vcard);
public sealed record WhatsAppMessageIds([property: JsonPropertyName("linked_devices")] string? LinkedDevices, [property: JsonPropertyName("official_api")] string? OfficialApi);
public sealed record MessageReceipt(string Id, [property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, ConversationReference Conversation, string Timestamp, string Status, string? Transport = null, string? RoutingReason = null);
public sealed record MessageResponse(string Id, [property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, ConversationReference Conversation, string Timestamp, string Status, string Type, MessageContent? Content = null, string? MediaId = null, string? Transport = null, string? RoutingReason = null);
public sealed record SeenRequest(ConversationReference Conversation, string Id);
public sealed record TypingRequest(ConversationReference Conversation, string State, string? Id = null);
public sealed record ReactRequest(ConversationReference Conversation, string Id, string Reaction, string? Transport = null);
public sealed record StarRequest(ConversationReference Conversation, string Id, bool Star);
public sealed record MessageOperation(string OperationId, string Status, string? Transport, string? RejectionCode, MessageOperationReceipt? Receipt);
public sealed record MessageOperationReceipt([property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, string Timestamp);

public sealed record CreateQuickLinkRequest(string? Purpose = null, string? Session = null, string? ProjectId = null, string? CustomerId = null, string? ExternalId = null, string? ConnectionGoal = null, string? AddConnection = null, QuickLinkConfiguration? Configuration = null, BillingControls? BillingControls = null);
public sealed record BillingControls(decimal? LimitCredits, int Priority);
public sealed record QuickLinkConfiguration(string? ConnectionPreference = null, string? ConnectionEnforcement = null, IReadOnlyList<string>? Methods = null, string? DefaultMethod = null, string? PrefillPhone = null, bool? AllowPhoneChange = null, QuickLinkHistorySync? HistorySync = null);
public sealed record QuickLinkHistorySync(string? Consent = null, string? Mode = null, bool? RequestFull = null);
public sealed record QuickLink(string Purpose, string ConnectionGoal, string? AddConnection, string Id, string Url, string Session, string? ExpiresAt);
public sealed record QuickLinkStatus(string Purpose, string ConnectionGoal, string? AddConnection, string? HybridPhase, string Id, string Status, string Session, string? ExpiresAt, string? OpenedAt, string? ConnectedAt, string? Phone, string? ErrorCode, JsonElement? Onboarding);
public sealed record HybridQuickLinkAvailability(bool Allowed, string? AddConnection, IReadOnlyList<ConnectionStatus> Connections, string? ResumeQuickLinkId);
public sealed record ConnectionStatus(string Kind, string Status, bool Enabled);

public sealed record WebhookRetryConfig(int Attempts, int DelaySeconds, string Policy);
public sealed record WebhookHeader(string Name, string Value);
public sealed record Webhook(string Id, string TenantId, string? Session, string Url, IReadOnlyList<string> Events, WebhookRetryConfig Retries, IReadOnlyList<WebhookHeader> Headers, bool Enabled, string? Format, string CreatedAt);
public sealed record CreateWebhookRequest(string Url, string? Session = null, IReadOnlyList<string>? Events = null, string? HmacKey = null, WebhookRetryConfig? Retries = null, IReadOnlyList<WebhookHeader>? Headers = null, string? Format = null);
public sealed record UpdateWebhookRequest(string? Url = null, IReadOnlyList<string>? Events = null, string? HmacKey = null, WebhookRetryConfig? Retries = null, IReadOnlyList<WebhookHeader>? Headers = null, bool? Enabled = null, string? Format = null);

public sealed record ProjectIcon(string Type, string Value, string? Color = null, string? StorageId = null);
public sealed record CreateProjectRequest(string Name, ProjectIcon? Icon = null, string? DefaultTier = null);
public sealed record CreatedProject(string Id, string OrgId, string Name, string Slug, ProjectIcon Icon, string DefaultTier, bool IsActive, string Stage);
public sealed record ProjectWithStats([property: JsonPropertyName("_id")] string Id, [property: JsonPropertyName("_creationTime")] long CreationTime, string OrgId, string Name, string Slug, ProjectIcon Icon, string DefaultTier, bool IsActive, string Stage, long ActiveSessions, long TotalSessions, long TotalMessages, long? LastActivity, string? IconUrl);
public sealed record ProductionBusiness(string Name, string Website, string SupportEmail);
public sealed record ProductionEnrollmentRequest(ProductionBusiness Business);
public sealed record ProductionEnrollmentResult(string Id, string OrgId, string Name, string Slug, string Stage, string OperationId, string EnrollmentStatus, string BillingMode);
public sealed record ProductionEnrollmentCommandResult(string OperationId, string Action, bool Accepted);

public sealed record EventRecord(string Id, string OrganizationId, string? ProjectId, string Type, string Source, string Environment, string CreatedAt, string PayloadAvailability, EncodedEventPayload? Payload, string? ReplayableUntil, string MetadataExpiresAt);
public sealed record EncodedEventPayload(string Encoding, string Data, string ContentType = "application/json");
public sealed record EventStreamAcknowledgement(string Cursor, long Sequence);
public sealed record EventStreamAcknowledgementReceipt(string StreamId, string AcknowledgedCursor, long Sequence, bool Replayed);
public sealed record CursorEnvelope<T>(IReadOnlyList<T> Data, CursorInfo? Page);
public sealed record CursorInfo(string? NextCursor);

internal sealed class MessageContentConverter : JsonConverter<MessageContent>
{
    public override MessageContent Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var document = JsonDocument.ParseValue(ref reader);
        var root = document.RootElement;
        if (root.TryGetProperty("text", out _)) return root.Deserialize<TextContent>(options)!;
        if (root.TryGetProperty("image", out _)) return root.Deserialize<ImageContent>(options)!;
        if (root.TryGetProperty("video", out _)) return root.Deserialize<VideoContent>(options)!;
        if (root.TryGetProperty("file", out _)) return root.Deserialize<FileContent>(options)!;
        if (root.TryGetProperty("voice", out _)) return root.Deserialize<VoiceContent>(options)!;
        if (root.TryGetProperty("poll", out _)) return root.Deserialize<PollContent>(options)!;
        if (root.TryGetProperty("location", out _)) return root.Deserialize<LocationContent>(options)!;
        if (root.TryGetProperty("contact", out _)) return root.Deserialize<ContactContent>(options)!;
        if (root.TryGetProperty("requestPhoneNumber", out _)) return root.Deserialize<PhoneNumberRequestContent>(options)!;
        if (root.TryGetProperty("product", out _)) return root.Deserialize<ProductContent>(options)!;
        if (root.TryGetProperty("productList", out _)) return root.Deserialize<ProductListContent>(options)!;
        if (root.TryGetProperty("order", out _)) return root.Deserialize<OrderContent>(options)!;
        if (root.TryGetProperty("list", out _)) return root.Deserialize<ListContent>(options)!;
        if (root.TryGetProperty("buttons", out _)) return root.Deserialize<ButtonsContent>(options)!;
        if (root.TryGetProperty("addressMessage", out _)) return root.Deserialize<AddressContent>(options)!;
        if (root.TryGetProperty("flow", out _)) return root.Deserialize<FlowContent>(options)!;
        if (root.TryGetProperty("callPermissionRequest", out _)) return root.Deserialize<CallPermissionRequestContent>(options)!;
        if (root.TryGetProperty("orderDetails", out _)) return root.Deserialize<OrderDetailsContent>(options)!;
        if (root.TryGetProperty("orderStatus", out _)) return root.Deserialize<OrderStatusContent>(options)!;
        if (root.TryGetProperty("template", out _)) return root.Deserialize<TemplateContent>(options)!;
        return new UnknownMessageContent(root.Clone());
    }
    public override void Write(Utf8JsonWriter writer, MessageContent value, JsonSerializerOptions options) { if (value is UnknownMessageContent unknown) unknown.Value.WriteTo(writer); else JsonSerializer.Serialize(writer, value, value.GetType(), options); }
}
