using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record Organization(string Id, string ExternalId, string Name, string? Slug, string Email, string? Timezone, long CreditBalanceCents, long LowBalanceThresholdCents, string? BillingEmail, string? Status, string? Plan, string? PlanStatus, bool IsActive, long CreatedAt, long UpdatedAt);
public sealed record OrganizationMember([property: JsonPropertyName("_id")] string Id, [property: JsonPropertyName("_creationTime")] long CreationTime, string OrgId, string UserId, string Email, string? Name, string Role, string Status, long? InvitedAt, long? JoinedAt);
public sealed record ApiKey([property: JsonPropertyName("_id")] string RecordId, [property: JsonPropertyName("_creationTime")] long CreationTime, string Id, string KeyId, string Start, string Last4, string OrgId, string Label, long Scopes, string Source, long ExpiresAt, bool IsActive, long? LastUsed = null);
public sealed record ApiKeyDeactivation(bool Ok, string KeyId);
public sealed record ProjectToken(string Id, string Start, string Last4, string? Label, long Scopes, long? ExpiresAt, long CreatedAt, long? LastUsedAt, long? RevokedAt);
public sealed record AuditLog(string Id, string ActorEmail, string? ActorUserId, string? ActorRole, string Action, string Resource, string? ProjectId, string? ProjectName, string? Ip, string? UserAgent, long? Duration, string? Source, string? Description, string Result, JsonElement Metadata, long CreatedAt);
public sealed record ListAuditLogsParameters(string? Action = null, string? Resource = null, int? Limit = null);
public sealed record SessionBan(string Id, string SessionName, int? BanCode, string? BanReason, long? BanExpiresAt, long OccurredAt, string Status);
public sealed record SecurityIncident(string Id, string KeyId, string TokenType, string Source, string? Url, string? Ref, string Resolution, long DetectedAt, long? AcknowledgedAt, string? AcknowledgedBy, long CreatedAt);
public sealed record SecurityIncidentAcknowledgement(bool Acknowledged);
public sealed record MintClientTokenRequest(string EphemeralId, string? Session = null, string? Customer = null, IReadOnlyList<string>? Allow = null, int? TtlSeconds = null);
public sealed record ClientTokenValue(string Token, string ExpiresAt) { public override string ToString() => $"ClientTokenValue(redacted, expiresAt={ExpiresAt})"; }
public sealed record ClientRules(string RecipientMode, string AllowedActions, int RateLimit, int MaxDaily, string AllowedOrigins, int ConversationTtlSeconds, int MaxConcurrency, int MaxSetupsPerMinute, string AllowedNumber, bool Enabled);
public sealed record SetClientRulesRequest(string RecipientMode, bool Enabled, string? AllowedActions = null, int? RateLimit = null, int? MaxDaily = null, string? AllowedOrigins = null, int? ConversationTtlSeconds = null, int? MaxConcurrency = null, int? MaxSetupsPerMinute = null, string? AllowedNumber = null);
public sealed record ResolveIdentityParameters(string? PhoneNumber = null, string? Id = null, string? Username = null, string? UsernameKey = null);
public sealed record ResolveIdentityResult(string? Id = null, string? Bsuid = null, string? PhoneNumber = null, string? Username = null, bool? KeyRequired = null);
public sealed record UserSecurityCode(string Id, string NumericCode, string QrCode, string? PhoneNumber = null, string? Username = null);

public sealed class Organizations : Resource
{
    internal Organizations(HttpTransport http) : base(http) { }
    public Task<ApiResponse<DataEnvelope<Organization>>> RetrieveAsync(RequestOptions? options = null) => Get<DataEnvelope<Organization>>("/platform/team", options);
}
public sealed class Members : Resource
{
    internal Members(HttpTransport http) : base(http) { }
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<OrganizationMember>>>> ListAsync(RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<OrganizationMember>>>("/platform/members", options);
}
public sealed class ApiKeys : Resource
{
    internal ApiKeys(HttpTransport http) : base(http) { }
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<ApiKey>>>> ListAsync(RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<ApiKey>>>("/platform/keys", options);
    public Task<ApiResponse<DataEnvelope<ApiKeyDeactivation>>> DeactivateAsync(string id, RequestOptions? options = null) => Delete<DataEnvelope<ApiKeyDeactivation>>("/platform/keys/" + E(id), options);
}
public sealed class ProjectTokens : Resource
{
    internal ProjectTokens(HttpTransport http) : base(http) { }
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<ProjectToken>>>> ListAsync(string projectId, RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<ProjectToken>>>("/platform/tokens", options, new { projectId });
}
public sealed class AuditLogs : Resource
{
    internal AuditLogs(HttpTransport http) : base(http) { }
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<AuditLog>>>> ListAsync(ListAuditLogsParameters? parameters = null, RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<AuditLog>>>("/platform/audit", options, parameters);
}
public sealed class SecurityIncidents : Resource
{
    internal SecurityIncidents(HttpTransport http) : base(http) { }
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<SecurityIncident>>>> ListAsync(RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<SecurityIncident>>>("/platform/incidents", options);
    public Task<ApiResponse<DataEnvelope<SecurityIncidentAcknowledgement>>> AcknowledgeAsync(string id, RequestOptions? options = null) => Post<DataEnvelope<SecurityIncidentAcknowledgement>>("/platform/incidents/" + E(id) + "/acknowledge", null, options);
}
public sealed class SessionBans : Resource
{
    internal SessionBans(HttpTransport http) : base(http) { }
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<SessionBan>>>> ListAsync(RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<SessionBan>>>("/platform/bans", options);
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<SessionBan>>>> ListActiveAsync(RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<SessionBan>>>("/platform/bans/active", options);
}
public sealed class ClientTokens : Resource
{
    internal ClientTokens(HttpTransport http) : base(http) { }
    private static string Path(string session) => $"/platform/sessions/{E(session)}/client-rules";
    public Task<ApiResponse<SuccessEnvelope<ClientTokenValue>>> MintAsync(MintClientTokenRequest body, RequestOptions? options = null)
    {
        Http.Credential.RequireServer();
        if (string.IsNullOrEmpty(body.Session) == string.IsNullOrEmpty(body.Customer) || body.Allow is not null && string.IsNullOrEmpty(body.Customer)) throw new PolymorfaConfigurationException("Specify exactly one session or customer. allow requires a customer target.");
        return Post<SuccessEnvelope<ClientTokenValue>>("/platform/client-tokens", body, options);
    }
    public Task<ApiResponse<SuccessEnvelope<ClientRules>>> RetrieveRulesAsync(string session, RequestOptions? options = null) { Http.Credential.RequireServer(); return Get<SuccessEnvelope<ClientRules>>(Path(session), options); }
    public Task<ApiResponse<SuccessResponse>> UpdateRulesAsync(string session, SetClientRulesRequest body, RequestOptions? options = null) { Http.Credential.RequireServer(); return Put<SuccessResponse>(Path(session), body, options); }
    public Task<ApiResponse<SuccessResponse>> DeleteRulesAsync(string session, RequestOptions? options = null) { Http.Credential.RequireServer(); return Delete<SuccessResponse>(Path(session), options); }
}
public sealed class Identities : Resource
{
    internal Identities(HttpTransport http) : base(http) { }
    public Task<ApiResponse<SuccessEnvelope<ResolveIdentityResult>>> ResolveAsync(string session, ResolveIdentityParameters parameters, RequestOptions? options = null) => Get<SuccessEnvelope<ResolveIdentityResult>>($"/messaging/{E(session)}/identities/resolve", options, parameters);
}
public sealed class Users : Resource
{
    internal Users(HttpTransport http) : base(http) { }
    public Task<ApiResponse<SuccessEnvelope<UserSecurityCode>>> GetSecurityCodeAsync(string session, string user, RequestOptions? options = null) => Get<SuccessEnvelope<UserSecurityCode>>($"/messaging/{E(session)}/users/{E(user)}/security-code", options);
}
