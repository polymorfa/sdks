namespace Polymorfa.Sdk;

public sealed record CustomerServiceWindow(string State, string? Reason, string? OpenedAt, string? ExpiresAt, string CheckedAt);
public sealed record MetaPricingParameters(string? Since = null, string? Until = null);
public sealed record MetaPricingGroup(string Category, string PricingModel, string? PricingType, bool? Billable, long Messages);
public sealed record MetaPricingSummary(string Source, string Since, string Until, long Messages, IReadOnlyList<MetaPricingGroup> Groups);
public sealed record CloudCredentialTokenHealth(string Status, string? ExpiresAt);
public sealed record CloudCredentialHealth(string Status, string? CheckedAt, string? NextCheckAt, CloudCredentialTokenHealth Token, IReadOnlyList<string> MissingPermissions, string PhoneRegistration, string WebhookSubscription, string? FailureCode);
public sealed record CloudReauthorization(string QuicklinkId, string Url, string Session)
{
    public override string ToString() => $"CloudReauthorization {{ QuicklinkId = {QuicklinkId}, Url = [REDACTED] }}";
}
public sealed partial class MessagingSessions
{
    public Task<ApiResponse<SuccessEnvelope<MetaPricingSummary>>> GetMetaPricingAsync(string session, MetaPricingParameters? parameters = null, RequestOptions? options = null)
    {
        http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<MetaPricingSummary>>(HttpMethod.Get, $"/messaging/{Uri.EscapeDataString(session)}/meta-pricing", null, options, Resource.Query(parameters));
    }
    public Task<ApiResponse<SuccessEnvelope<CloudCredentialHealth>>> GetCloudCredentialHealthAsync(string session, RequestOptions? options = null)
    {
        http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<CloudCredentialHealth>>(HttpMethod.Get, $"/messaging/{Uri.EscapeDataString(session)}/cloud-credentials", null, options);
    }
    public Task<ApiResponse<SuccessEnvelope<CloudReauthorization>>> ReauthorizeCloudCredentialsAsync(string session, RequestOptions? options = null)
    {
        http.Credential.RequireServer(); return http.RequestAsync<SuccessEnvelope<CloudReauthorization>>(HttpMethod.Post, $"/messaging/{Uri.EscapeDataString(session)}/cloud-credentials/reauthorize", null, (options ?? new()) with { MaxNetworkRetries = 0 });
    }
}
