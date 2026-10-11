using System.Text.RegularExpressions;

namespace Polymorfa.Sdk;

public sealed record PlaceCallRequest(string? Session = null, string? To = null, IReadOnlyList<string>? Participants = null, string? GroupId = null, bool? Video = null, bool? Exclusive = null, string? Participant = null);
public sealed record PlacedCall(string CallId, string Session, bool Video);
public sealed record AcceptCallRequest(bool? Exclusive = null, bool? Video = null, string? Participant = null);
public sealed record AcceptedCall(bool Answered, string AnsweredBy, bool Exclusive);
public sealed record RejectCallRequest(string? Participant = null);
public sealed record LeaveCallRequest(string ConnectionId, string? Participant = null);
public sealed record AddCallParticipantRequest(string To);
public sealed record CallParticipant(string Id, bool AudioMuted, bool Video, string State, string? PhoneNumber = null, string? Bsuid = null, string? Username = null, bool? HandRaised = null);
public sealed record CreateCallLinkRequest(string Session, bool? Video = null);
public sealed record PreviewCallLinkRequest(string Session, string Token, bool? Video = null);
public sealed record CreatedCallLink(string Session, string Token, string Url, bool Video);
public sealed record PreviewedCallLink(string Session, bool Video, ConversationReference CreatorConversationIdentity, bool ApprovalRequired, bool IsAdmin);
public sealed record CallReactionRequest(string ConnectionId, string Emoji, string? Participant = null);
public sealed record CallHandRequest(string ConnectionId, bool Raised, string? Participant = null);
public sealed record CheckCallRequest(string Session, string To);
public sealed record CallPermissionLimit(string Period, long MaxAllowed, long Used, string? ResetsAt);
public sealed record CallPermissionAction(bool Allowed, IReadOnlyList<CallPermissionLimit> Limits);
public sealed record CallPermissionActions(CallPermissionAction? RequestPermission, CallPermissionAction? StartCall);
public record CallPermissionState(string Status, string? ExpiresAt, string? Source, string? UpdatedAt, string? CheckedAt, bool Fresh, CallPermissionActions? Actions);
public sealed record CallPermission(string Status, string? ExpiresAt, string? Source, string? UpdatedAt, string? CheckedAt, bool Fresh, CallPermissionActions? Actions, ConversationReference Conversation) : CallPermissionState(Status, ExpiresAt, Source, UpdatedAt, CheckedAt, Fresh, Actions);
public sealed record CallCheck(bool Allowed, string? Refusal, CallPermissionState? Permission);
public sealed record SessionCallSettings(bool CallsEnabled, bool ConferenceMode, string InboundRoute, string? SipTrunkId, bool SipClaim, bool HostCloudApiCalls, long Revision, string? UpdatedAt);
public sealed record UpdateCallSettingsRequest(bool? CallsEnabled = null, bool? ConferenceMode = null, string? InboundRoute = null, [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> SipTrunkId = default, bool? SipClaim = null, bool? HostCloudApiCalls = null, long? ExpectedRevision = null);
public sealed record CallReportClient(string Sdk, string Version, string Platform);
public sealed record CallQuality(int? RttMs = null, int? JitterMs = null, int? PacketsLost = null, int? PacketsReceived = null, int? Reconnects = null, string? AudioCodec = null, string? VideoCodec = null, string? CandidateType = null);
public sealed record CallReportError(string Code);
public sealed record CallReportRequest(string Kind, string ConnectionId, CallReportClient Client, string? Participant = null, CallQuality? Quality = null, CallReportError? Error = null);

public sealed class Calls
{
    private readonly HttpTransport http;
    internal Calls(HttpTransport http) => this.http = http;
    private static string Path(string id) => $"/messaging/voip/calls/{Uri.EscapeDataString(id)}";
    private static void NonEmpty(string? value, string name) { if (string.IsNullOrWhiteSpace(value)) throw new PolymorfaValidationException($"{name} is required.", "invalid_parameter"); }
    private void Participant(string? value)
    {
        if (value is null) return;
        if (http.Credential.Kind == CredentialKind.ClientToken || !Regex.IsMatch(value, "^[A-Za-z0-9._:@-]{1,128}$")) throw new PolymorfaValidationException("Invalid server participant.", "invalid_parameter");
    }
    private static void Connection(string value) { if (!Regex.IsMatch(value, "^[A-Za-z0-9_-]{8,64}$")) throw new PolymorfaValidationException("Invalid connectionId.", "invalid_parameter"); }
    private void Link(string session, RequestOptions? options)
    {
        http.Credential.RequireServer(); NonEmpty(session, "session");
        if (session.Length > 128 || options?.IdempotencyKey is not null || options?.Headers?.Keys.Any(key => key.Equals("idempotency-key", StringComparison.OrdinalIgnoreCase)) == true) throw new PolymorfaValidationException("Call links require a session and do not support idempotency keys.", "invalid_parameter");
    }
    public Task<ApiResponse<SuccessEnvelope<CreatedCallLink>>> CreateCallLinkAsync(CreateCallLinkRequest body, RequestOptions? options = null)
    {
        Link(body.Session, options); return http.RequestAsync<SuccessEnvelope<CreatedCallLink>>(HttpMethod.Post, "/messaging/voip/call-links", body, (options ?? new()) with { MaxNetworkRetries = 0 });
    }
    public Task<ApiResponse<SuccessEnvelope<PreviewedCallLink>>> PreviewCallLinkAsync(PreviewCallLinkRequest body, RequestOptions? options = null)
    {
        Link(body.Session, options); if (!Regex.IsMatch(body.Token, "^[A-Za-z0-9_-]{1,256}$")) throw new PolymorfaValidationException("Invalid call-link token.", "invalid_parameter");
        return http.RequestAsync<SuccessEnvelope<PreviewedCallLink>>(HttpMethod.Post, "/messaging/voip/call-links/preview", body, (options ?? new()) with { MaxNetworkRetries = 0 });
    }
    public Task<ApiResponse<SuccessEnvelope<PlacedCall>>> PlaceAsync(PlaceCallRequest body, RequestOptions? options = null)
    {
        if (http.Credential.Kind != CredentialKind.ClientToken) NonEmpty(body.Session, "session");
        var count = (body.To is not null ? 1 : 0) + (body.Participants is not null ? 1 : 0) + (body.GroupId is not null ? 1 : 0);
        if (count != 1 || body.To is not null && string.IsNullOrWhiteSpace(body.To) || body.GroupId is not null && string.IsNullOrWhiteSpace(body.GroupId) || body.Participants is { } people && (people.Count is < 2 or > 31 || people.Any(string.IsNullOrWhiteSpace) || people.Distinct().Count() != people.Count)) throw new PolymorfaValidationException("Provide one valid to, participants, or groupId target.", "invalid_parameter");
        Participant(body.Participant); return http.RequestAsync<SuccessEnvelope<PlacedCall>>(HttpMethod.Post, "/messaging/voip/calls", body, options);
    }
    public Task<ApiResponse<SuccessEnvelope<AcceptedCall>>> AcceptAsync(string callId, AcceptCallRequest? body = null, RequestOptions? options = null) { body ??= new(); Participant(body.Participant); return http.RequestAsync<SuccessEnvelope<AcceptedCall>>(HttpMethod.Post, Path(callId) + "/accept", body, options); }
    public Task<ApiResponse<SuccessResponse>> RejectAsync(string callId, RejectCallRequest? body = null, RequestOptions? options = null) { Participant(body?.Participant); return http.RequestAsync<SuccessResponse>(HttpMethod.Post, Path(callId) + "/reject", body?.Participant is null ? null : body, options); }
    public Task<ApiResponse<SuccessResponse>> LeaveAsync(string callId, LeaveCallRequest body, RequestOptions? options = null) { Connection(body.ConnectionId); Participant(body.Participant); return http.RequestAsync<SuccessResponse>(HttpMethod.Post, Path(callId) + "/leave", body, options); }
    public Task<ApiResponse<SuccessResponse>> EndAsync(string callId, RequestOptions? options = null) => http.RequestAsync<SuccessResponse>(HttpMethod.Delete, Path(callId), null, options);
    public Task<ApiResponse<SuccessEnvelope<CallParticipant>>> AddParticipantAsync(string callId, AddCallParticipantRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessEnvelope<CallParticipant>>(HttpMethod.Post, Path(callId) + "/participants", body, options);
    public Task<ApiResponse<SuccessResponse>> RingParticipantAsync(string callId, AddCallParticipantRequest body, RequestOptions? options = null) => http.RequestAsync<SuccessResponse>(HttpMethod.Post, Path(callId) + "/participants/ring", body, options);
    public Task<ApiResponse<SuccessResponse>> SendReactionAsync(string callId, CallReactionRequest body, RequestOptions? options = null)
    {
        Participant(body.Participant); Connection(body.ConnectionId); if (!(new[] { "", "👍", "❤️", "😂", "😮", "😢", "🙏" }).Contains(body.Emoji)) throw new PolymorfaValidationException("Invalid call reaction.", "invalid_parameter");
        return http.RequestAsync<SuccessResponse>(HttpMethod.Post, Path(callId) + "/reaction", body, (options ?? new()) with { MaxNetworkRetries = 0 });
    }
    public Task<ApiResponse<SuccessResponse>> SetHandRaisedAsync(string callId, CallHandRequest body, RequestOptions? options = null) { Participant(body.Participant); Connection(body.ConnectionId); return http.RequestAsync<SuccessResponse>(HttpMethod.Post, Path(callId) + "/hand", body, (options ?? new()) with { MaxNetworkRetries = 0 }); }
    public Task<ApiResponse<SuccessEnvelope<CallPermission>>> RetrieveCallPermissionAsync(string session, string to, RequestOptions? options = null) { http.Credential.RequireServer(); NonEmpty(session, "session"); NonEmpty(to, "to"); return http.RequestAsync<SuccessEnvelope<CallPermission>>(HttpMethod.Get, $"/messaging/{Uri.EscapeDataString(session)}/call-permissions/{Uri.EscapeDataString(to)}", null, options); }
    public Task<ApiResponse<SuccessEnvelope<CallCheck>>> CheckAsync(CheckCallRequest body, RequestOptions? options = null) { http.Credential.RequireServer(); NonEmpty(body.Session, "session"); NonEmpty(body.To, "to"); return http.RequestAsync<SuccessEnvelope<CallCheck>>(HttpMethod.Post, "/messaging/voip/calls/check", body, options); }
    public Task<ApiResponse<SuccessEnvelope<SessionCallSettings>>> RetrieveCallSettingsAsync(string session, RequestOptions? options = null) { http.Credential.RequireServer(); NonEmpty(session, "session"); return http.RequestAsync<SuccessEnvelope<SessionCallSettings>>(HttpMethod.Get, $"/platform/sessions/{Uri.EscapeDataString(session)}/call-settings", null, options); }
    public Task<ApiResponse<SuccessEnvelope<SessionCallSettings>>> UpdateCallSettingsAsync(string session, UpdateCallSettingsRequest body, RequestOptions? options = null)
    {
        http.Credential.RequireServer(); NonEmpty(session, "session");
        if (body.CallsEnabled is null && body.ConferenceMode is null && body.InboundRoute is null && !body.SipTrunkId.IsSpecified && body.SipClaim is null && body.HostCloudApiCalls is null || body.ExpectedRevision < 0 || body.InboundRoute is not null && body.InboundRoute is not ("clients" or "sip_trunk")) throw new PolymorfaValidationException("Invalid call settings update.", "invalid_parameter");
        return http.RequestAsync<SuccessEnvelope<SessionCallSettings>>(HttpMethod.Put, $"/platform/sessions/{Uri.EscapeDataString(session)}/call-settings", body, options);
    }
    public Task<ApiResponse<SuccessResponse>> ReportAsync(string callId, CallReportRequest body, RequestOptions? options = null)
    {
        Participant(body.Participant); Connection(body.ConnectionId);
        if (!Regex.IsMatch(body.Client.Sdk, "^[a-z0-9@/._-]{1,32}$") || !Regex.IsMatch(body.Client.Version, "^[0-9]{1,6}\\.[0-9]{1,6}\\.[0-9]{1,6}(?:[-+][0-9A-Za-z.+-]{1,24})?$") || body.Client.Platform is not ("browser" or "node" or "other")) throw new PolymorfaValidationException("Invalid call report client.", "invalid_parameter");
        if (body.Kind == "quality" && body.Quality is { } quality && body.Error is null)
        {
            if (quality == new CallQuality() || quality.RttMs is < 0 or > 60000 || quality.JitterMs is < 0 or > 60000 || quality.PacketsLost < 0 || quality.PacketsReceived < 0 || quality.Reconnects is < 0 or > 1000 || quality.AudioCodec is not null && !Regex.IsMatch(quality.AudioCodec, "^[A-Za-z0-9/.-]{1,32}$") || quality.VideoCodec is not null && !Regex.IsMatch(quality.VideoCodec, "^[A-Za-z0-9/.-]{1,32}$") || quality.CandidateType is not null && quality.CandidateType is not ("host" or "srflx" or "prflx" or "relay")) throw new PolymorfaValidationException("Invalid call quality report.", "invalid_parameter");
        }
        else if (body.Kind != "error" || body.Quality is not null || body.Error?.Code is not ("media_permission_denied" or "device_not_found" or "device_in_use" or "ice_failed" or "negotiation_failed" or "media_timeout" or "reconnect_exhausted" or "token_refresh_failed" or "unsupported_browser" or "other")) throw new PolymorfaValidationException("Invalid call error report.", "invalid_parameter");
        return http.RequestAsync<SuccessResponse>(HttpMethod.Post, Path(callId) + "/reports", body, options);
    }
}
