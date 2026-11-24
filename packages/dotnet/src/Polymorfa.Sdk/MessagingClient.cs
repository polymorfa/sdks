using System.Text.Json;

namespace Polymorfa.Sdk;

public sealed class MessagingClient : IDisposable
{
    private readonly HttpTransport http;
    public Passkeys Passkeys { get; }
    public MessagingConnections Connections { get; }
    public Messages Messages { get; }
    public QuickLinks QuickLinks { get; }
    public MessagingWebhooks Webhooks { get; }
    public Calls Calls { get; }
    public CloudOnboarding CloudOnboarding { get; }
    public Testing Testing { get; }
    public ObservationPolicies ObservationPolicies { get; }
    public HybridLink HybridLink { get; }
    public CloudGraph CloudGraph { get; }
    public MessagingCampaigns Campaigns { get; }
    public Templates Templates { get; }
    public CloudTemplates CloudTemplates { get; }
    public Business Business { get; }
    public Channels Channels { get; }
    public QuickReplies QuickReplies { get; }
    public MessagingBanSafe BanSafe { get; }
    public Contacts Contacts { get; }
    public OfficialGroups OfficialGroups { get; }
    public Catalogs Catalogs { get; }
    public Groups Groups { get; }
    public Chats Chats { get; }
    public Labels Labels { get; }
    public Presence Presence { get; }
    public Profile Profile { get; }
    public Privacy Privacy { get; }
    public ClientTokens ClientTokens { get; }
    public Identities Identities { get; }
    public Users Users { get; }
    public MessagingMedia Media { get; }
    public WhatsAppMediaResource WhatsAppMedia { get; }
    public HistorySyncResource HistorySync { get; }
    public MessagingClient(Credential credential, ClientOptions? options = null)
    {
        if (credential.Kind != CredentialKind.ClientToken) credential.RequireServer();
        http = new(credential, options ?? new()); Passkeys = new(http); Connections = new(http); Messages = new(http); QuickLinks = new(http); Webhooks = new(http); Calls = new(http); CloudOnboarding = new(http); Testing = new(http); ObservationPolicies = new(http); HybridLink = new(http); Templates = new(http); Campaigns = new(http); CloudGraph = new(http); CloudTemplates = new(http); Business = new(http); Channels = new(http); QuickReplies = new(http); BanSafe = new(http); Contacts = new(http); OfficialGroups = new(http); Catalogs = new(http); Groups = new(http); Chats = new(http); Labels = new(http); Presence = new(http); Profile = new(http); Privacy = new(http); ClientTokens = new(http); Identities = new(http); Users = new(http); Media = new(http); WhatsAppMedia = new(http); HistorySync = new(http);
    }
    public Task<RawCursorPage<T>> PaginateRawAsync<T>(RawRequest request, RawPageDecoder<T> decode, string cursorParameter = "cursor") => RawCursorPage<T>.LoadAsync(http, request, decode, cursorParameter);
    public Task<ApiResponse<T>> RawAsync<T>(HttpMethod method, string path, JsonElement? body = null, RequestOptions? options = null, IReadOnlyList<KeyValuePair<string, string>>? query = null) => http.RequestAsync<T>(method, path, body, options, query);
    public void Dispose() => http.Dispose();
}
public sealed partial class MessagingConnections
{
    private readonly HttpTransport http;
    internal MessagingConnections(HttpTransport http) => this.http = http;
    private static string Path(string connection) => $"/platform/connections/{Uri.EscapeDataString(connection)}";
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<PlatformConnection>>>> ListAsync(RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<DataEnvelope<IReadOnlyList<PlatformConnection>>>(HttpMethod.Get, "/platform/connections", null, options); }
    public Task<ApiResponse<SuccessEnvelope<Connection>>> RetrieveAsync(string connection, RequestOptions? options = null) { http.Credential.RequireServer(); return ExistingContractCodec.Request<SuccessEnvelope<Connection>>(http, HttpMethod.Get, Path(connection), options: options); }
    public Task<ApiResponse<SuccessEnvelope<Connection>>> UpdateAsync(string connection, UpdateConnectionRequest body, RequestOptions? options = null) { http.Credential.RequireServer(); var captured = ConfigurationContract.Capture(body, body.Configuration, out var intent); return ExistingContractCodec.Request<SuccessEnvelope<Connection>>(http, HttpMethod.Put, Path(connection), captured, ExistingContractCodec.Options(options, intent)); }
    public Task<ApiResponse<DataEnvelope<ConnectionRemoveResult>>> DeleteAsync(string connection, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<DataEnvelope<ConnectionRemoveResult>>(HttpMethod.Delete, Path(connection), null, options); }
    public Task<ApiResponse<DataEnvelope<ConnectionStartResult>>> StartAsync(string connection, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<DataEnvelope<ConnectionStartResult>>(HttpMethod.Post, Path(connection) + "/start", null, options); }
    public Task<ApiResponse<DataEnvelope<ConnectionStopResult>>> StopAsync(string connection, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<DataEnvelope<ConnectionStopResult>>(HttpMethod.Post, Path(connection) + "/stop", null, options); }
    public Task<ApiResponse<OperationAccepted>> RestartAsync(string connection, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<OperationAccepted>(HttpMethod.Post, Path(connection) + "/restart", null, options); }
    public Task<ApiResponse<OperationAccepted>> LogoutAsync(string connection, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<OperationAccepted>(HttpMethod.Post, Path(connection) + "/logout", null, options); }
    public Task<ApiResponse<SuccessEnvelope<WhatsAppAccount>>> AccountAsync(string connection, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<WhatsAppAccount>>(HttpMethod.Get, Path(connection) + "/me", null, options); }
    public Task<ApiResponse<SuccessEnvelope<QrCode>>> QrAsync(string connection, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<QrCode>>(HttpMethod.Get, $"/messaging/{Uri.EscapeDataString(connection)}/pair/qr", null, options, [new("format", "json")]);
    public Task<ApiResponse<SuccessEnvelope<PairCode>>> RequestPairingCodeAsync(string connection, PairCodeRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<PairCode>>(HttpMethod.Post, $"/messaging/{Uri.EscapeDataString(connection)}/pair/code", body, options);
}
public sealed class Messages
{
    private readonly HttpTransport http;
    internal Messages(HttpTransport http) => this.http = http;
    private static string Path(string connection, string action) => $"/messaging/{Uri.EscapeDataString(connection)}/messages/{action}";
    public Task<ApiResponse<SuccessEnvelope<MessageResponse>>> SendAsync(string connection, SendMessageRequest body, RequestOptions? options = null)
    {
        InteractiveMessages.Validate(body.Content);
        if (body.Conversation.Id is null && body.Conversation.PhoneNumber is null && body.Conversation.Bsuid is null && body.Conversation.Username is null) throw new PolymorfaValidationException("A conversation identifier is required.", "invalid_parameter");
        var descriptor = body.Content switch { DescriptorImageContent c => (c.Image, WhatsAppUploadMediaType.Image), DescriptorVideoContent c => (c.Video, WhatsAppUploadMediaType.Video), DescriptorFileContent c => (c.File, WhatsAppUploadMediaType.Document), DescriptorVoiceContent c => (c.Voice, c.Voice.Ptt == true ? WhatsAppUploadMediaType.Ptt : WhatsAppUploadMediaType.Audio), StickerContent c => (c.Sticker, WhatsAppUploadMediaType.Sticker), _ => ((WhatsAppMediaSendDescriptor?)null, default(WhatsAppUploadMediaType)) };
        if (body.Content is StickerContent { Sticker: null }) throw new PolymorfaConfigurationException("A sticker descriptor is required.");
        if (descriptor.Item1 is { } media) { media.Validate(descriptor.Item2); options = WhatsAppMediaResource.Version(options); }
        return http.RequestAsync<SuccessEnvelope<MessageResponse>>(HttpMethod.Post, Path(connection, "send"), body, (options ?? new()).WithIdempotency());
    }
    public Task<ApiResponse<SuccessEnvelope<StatusResult>>> MarkSeenAsync(string connection, SeenRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<StatusResult>>(HttpMethod.Post, Path(connection, "seen"), body, options);
    public Task<ApiResponse<SuccessEnvelope<StatusResult>>> SetTypingAsync(string connection, TypingRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<StatusResult>>(HttpMethod.Post, Path(connection, "typing"), body, options);
    public Task<ApiResponse<SuccessEnvelope<MessageReceipt>>> ReactAsync(string connection, ReactRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<MessageReceipt>>(HttpMethod.Post, Path(connection, "react"), body, (options ?? new()).WithIdempotency());
    public Task<ApiResponse<SuccessEnvelope<StatusResult>>> StarAsync(string connection, StarRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<StatusResult>>(HttpMethod.Post, Path(connection, "star"), body, options);
    public Task<ApiResponse<SuccessEnvelope<MessageOperation>>> OperationStatusAsync(string connection, string operationId, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<MessageOperation>>(HttpMethod.Get, $"/messaging/{Uri.EscapeDataString(connection)}/operations/{Uri.EscapeDataString(operationId)}", null, options); }
}
public sealed class QuickLinks
{
    private readonly HttpTransport http;
    internal QuickLinks(HttpTransport http) => this.http = http;
    public Task<ApiResponse<SuccessEnvelope<QuickLink>>> CreateAsync(CreateQuickLinkRequest? body = null, RequestOptions? options = null)
    {
        http.Credential.RequireServer(); body ??= new();
        if (body.Purpose == "add_method" && string.IsNullOrWhiteSpace(body.Connection)) throw new PolymorfaValidationException("An add_method link requires connection.", "invalid_parameter");
        if (body.BillingControls is { } billing && (billing.Priority < 0 || billing.Priority > 1_000_000 || billing.LimitCredits < 0 || billing.LimitCredits > 1_000_000 || billing.LimitCredits is decimal limit && decimal.Round(limit, 6) != limit || body.Purpose == "add_method" || body.Configuration?.Testing is not null)) throw new PolymorfaValidationException("Invalid billingControls.", "invalid_parameter");
        var captured = ConfigurationContract.QuickLink(body, out var intent);
        return http.RequestAsync<SuccessEnvelope<QuickLink>>(HttpMethod.Post, "/messaging/quicklinks", new CampaignCapturedBody(CampaignContractCodec.Encode(captured)), ExistingContractCodec.Options(options, intent));
    }
    public Task<ApiResponse<SuccessEnvelope<QuickLinkStatus>>> RetrieveAsync(string id, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<QuickLinkStatus>>(HttpMethod.Get, $"/messaging/quicklinks/{Uri.EscapeDataString(id)}", null, options); }
    public Task<ApiResponse<SuccessResponse>> CancelAsync(string id, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<SuccessResponse>(HttpMethod.Delete, $"/messaging/quicklinks/{Uri.EscapeDataString(id)}", null, options); }
    public Task<ApiResponse<SuccessEnvelope<HybridQuickLinkAvailability>>> AvailabilityAsync(string projectId, string connection, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<HybridQuickLinkAvailability>>(HttpMethod.Get, "/messaging/quicklinks/availability", null, options, [new("projectId", projectId), new("connection", connection)]); }
}
public sealed class MessagingWebhooks
{
    private readonly HttpTransport http;
    internal MessagingWebhooks(HttpTransport http) => this.http = http;
    public Task<ApiResponse<SuccessEnvelope<IReadOnlyList<Webhook>>>> ListAsync(RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<IReadOnlyList<Webhook>>>(HttpMethod.Get, "/messaging/webhooks", null, options);
    public Task<ApiResponse<SuccessEnvelope<Webhook>>> CreateAsync(CreateWebhookRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<Webhook>>(HttpMethod.Post, "/messaging/webhooks", body, options);
    public Task<ApiResponse<SuccessEnvelope<Webhook>>> RetrieveAsync(string id, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<Webhook>>(HttpMethod.Get, $"/messaging/webhooks/{Uri.EscapeDataString(id)}", null, options);
    public Task<ApiResponse<SuccessEnvelope<Webhook>>> UpdateAsync(string id, UpdateWebhookRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<Webhook>>(HttpMethod.Put, $"/messaging/webhooks/{Uri.EscapeDataString(id)}", body, options);
    public Task<ApiResponse<SuccessResponse>> DeleteAsync(string id, RequestOptions? options = null) => http.RequestAsync<SuccessResponse>(HttpMethod.Delete, $"/messaging/webhooks/{Uri.EscapeDataString(id)}", null, options);
}
