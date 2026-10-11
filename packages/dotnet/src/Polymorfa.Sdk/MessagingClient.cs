using System.Text.Json;

namespace Polymorfa.Sdk;

public sealed class MessagingClient : IDisposable
{
    private readonly HttpTransport http;
    public MessagingSessions Sessions { get; }
    public Messages Messages { get; }
    public QuickLinks QuickLinks { get; }
    public MessagingWebhooks Webhooks { get; }
    public Calls Calls { get; }
    public Business Business { get; }
    public Contacts Contacts { get; }
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
    public MessagingClient(Credential credential, ClientOptions? options = null)
    {
        http = new(credential, options ?? new()); Sessions = new(http); Messages = new(http); QuickLinks = new(http); Webhooks = new(http); Calls = new(http); Business = new(http); Contacts = new(http); Groups = new(http); Chats = new(http); Labels = new(http); Presence = new(http); Profile = new(http); Privacy = new(http); ClientTokens = new(http); Identities = new(http); Users = new(http); Media = new(http);
    }
    public Task<ApiResponse<T>> RawAsync<T>(HttpMethod method, string path, JsonElement? body = null, RequestOptions? options = null, IReadOnlyList<KeyValuePair<string, string>>? query = null) => http.RequestAsync<T>(method, path, body, options, query);
    public void Dispose() => http.Dispose();
}
public sealed class MessagingSessions
{
    private readonly HttpTransport http;
    internal MessagingSessions(HttpTransport http) => this.http = http;
    private static string Path(string session) => $"/platform/sessions/{Uri.EscapeDataString(session)}";
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<PlatformSession>>>> ListAsync(RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<DataEnvelope<IReadOnlyList<PlatformSession>>>(HttpMethod.Get, "/platform/sessions", null, options); }
    public Task<ApiResponse<SuccessEnvelope<Session>>> RetrieveAsync(string session, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<Session>>(HttpMethod.Get, Path(session), null, options); }
    public Task<ApiResponse<SuccessEnvelope<Session>>> UpdateAsync(string session, UpdateSessionRequest body, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<Session>>(HttpMethod.Put, Path(session), body, options); }
    public Task<ApiResponse<DataEnvelope<SessionRemoveResult>>> DeleteAsync(string session, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<DataEnvelope<SessionRemoveResult>>(HttpMethod.Delete, Path(session), null, options); }
    public Task<ApiResponse<DataEnvelope<SessionStartResult>>> StartAsync(string session, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<DataEnvelope<SessionStartResult>>(HttpMethod.Post, Path(session) + "/start", null, options); }
    public Task<ApiResponse<DataEnvelope<SessionStopResult>>> StopAsync(string session, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<DataEnvelope<SessionStopResult>>(HttpMethod.Post, Path(session) + "/stop", null, options); }
    public Task<ApiResponse<OperationAccepted>> RestartAsync(string session, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<OperationAccepted>(HttpMethod.Post, Path(session) + "/restart", null, options); }
    public Task<ApiResponse<OperationAccepted>> LogoutAsync(string session, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<OperationAccepted>(HttpMethod.Post, Path(session) + "/logout", null, options); }
    public Task<ApiResponse<SuccessEnvelope<WhatsAppAccount>>> AccountAsync(string session, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<WhatsAppAccount>>(HttpMethod.Get, Path(session) + "/me", null, options); }
    public Task<ApiResponse<SuccessEnvelope<QrCode>>> QrAsync(string session, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<QrCode>>(HttpMethod.Get, $"/messaging/{Uri.EscapeDataString(session)}/pair/qr", null, options, [new("format", "json")]);
    public Task<ApiResponse<SuccessEnvelope<PairCode>>> RequestPairingCodeAsync(string session, PairCodeRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<PairCode>>(HttpMethod.Post, $"/messaging/{Uri.EscapeDataString(session)}/pair/code", body, options);
}
public sealed class Messages
{
    private readonly HttpTransport http;
    internal Messages(HttpTransport http) => this.http = http;
    private static string Path(string session, string action) => $"/messaging/{Uri.EscapeDataString(session)}/messages/{action}";
    public Task<ApiResponse<SuccessEnvelope<MessageResponse>>> SendAsync(string session, SendMessageRequest body, RequestOptions? options = null)
    {
        if (body.Conversation.Id is null && body.Conversation.PhoneNumber is null && body.Conversation.Bsuid is null && body.Conversation.Username is null) throw new PolymorfaValidationException("A conversation identifier is required.", "invalid_parameter");
        return http.RequestAsync<SuccessEnvelope<MessageResponse>>(HttpMethod.Post, Path(session, "send"), body, (options ?? new()).WithIdempotency());
    }
    public Task<ApiResponse<SuccessEnvelope<StatusResult>>> MarkSeenAsync(string session, SeenRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<StatusResult>>(HttpMethod.Post, Path(session, "seen"), body, options);
    public Task<ApiResponse<SuccessEnvelope<StatusResult>>> SetTypingAsync(string session, TypingRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<StatusResult>>(HttpMethod.Post, Path(session, "typing"), body, options);
    public Task<ApiResponse<SuccessEnvelope<MessageReceipt>>> ReactAsync(string session, ReactRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<MessageReceipt>>(HttpMethod.Post, Path(session, "react"), body, (options ?? new()).WithIdempotency());
    public Task<ApiResponse<SuccessEnvelope<StatusResult>>> StarAsync(string session, StarRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<StatusResult>>(HttpMethod.Post, Path(session, "star"), body, options);
    public Task<ApiResponse<SuccessEnvelope<MessageOperation>>> OperationStatusAsync(string session, string operationId, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<MessageOperation>>(HttpMethod.Get, $"/messaging/{Uri.EscapeDataString(session)}/operations/{Uri.EscapeDataString(operationId)}", null, options); }
}
public sealed class QuickLinks
{
    private readonly HttpTransport http;
    internal QuickLinks(HttpTransport http) => this.http = http;
    public Task<ApiResponse<SuccessEnvelope<QuickLink>>> CreateAsync(CreateQuickLinkRequest? body = null, RequestOptions? options = null)
    {
        http.Credential.RequireServer(); body ??= new();
        if (body.Purpose == "add_connection" && string.IsNullOrWhiteSpace(body.Session)) throw new PolymorfaValidationException("An add_connection link requires session.", "invalid_parameter");
        if (body.BillingControls is { } billing && (billing.Priority < 0 || billing.Priority > 1_000_000 || billing.LimitCredits < 0 || billing.LimitCredits > 1_000_000 || billing.LimitCredits is decimal limit && decimal.Round(limit, 6) != limit || body.Purpose == "add_connection")) throw new PolymorfaValidationException("Invalid billingControls.", "invalid_parameter");
        return http.RequestAsync<SuccessEnvelope<QuickLink>>(HttpMethod.Post, "/messaging/quicklinks", body, options);
    }
    public Task<ApiResponse<SuccessEnvelope<QuickLinkStatus>>> RetrieveAsync(string id, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<QuickLinkStatus>>(HttpMethod.Get, $"/messaging/quicklinks/{Uri.EscapeDataString(id)}", null, options); }
    public Task<ApiResponse<SuccessResponse>> CancelAsync(string id, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<SuccessResponse>(HttpMethod.Delete, $"/messaging/quicklinks/{Uri.EscapeDataString(id)}", null, options); }
    public Task<ApiResponse<SuccessEnvelope<HybridQuickLinkAvailability>>> AvailabilityAsync(string projectId, string session, RequestOptions? options = null) { http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<HybridQuickLinkAvailability>>(HttpMethod.Get, "/messaging/quicklinks/availability", null, options, [new("projectId", projectId), new("session", session)]); }
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
