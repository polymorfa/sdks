using System.Text.Json;
using System.Text.RegularExpressions;
namespace Polymorfa.Sdk;

public sealed record CloudCatalogAttempt(string StartedAt, string? FinishedAt, string Outcome, int? MetaErrorCode = null);
public sealed record CloudCatalogSync(string CatalogId, string? SyncedAt, bool Stale, int ProductCount, CloudCatalogAttempt LastAttempt);
public sealed record CloudCatalogCacheProduct(string Id, string? RetailerId = null, string? Name = null, string? Description = null, string? Price = null, string? Currency = null, string? Availability = null, string? ReviewStatus = null, string? Visibility = null, string? ImageUrl = null, string? Url = null);
public sealed record CloudCatalogCacheList(IReadOnlyList<CloudCatalogSync> Catalogs);
public sealed record CloudCatalogProductPage(CloudCatalogSync Catalog, IReadOnlyList<CloudCatalogCacheProduct> Products, string? NextCursor = null);
public sealed record CatalogProductsParameters(int? Limit = null, string? Cursor = null);
/// <summary>Beta Number cache. Graph catalog resources are separate.</summary>
public sealed class Catalogs : Resource
{
    internal Catalogs(HttpTransport http) : base(http) { }
    private string Path(string session, string? catalogId = null)
    {
        Http.Credential.RequireServer();
        if (string.IsNullOrWhiteSpace(session) || catalogId is not null && !Regex.IsMatch(catalogId, @"\A[0-9]{1,32}\z")) throw new PolymorfaValidationException("Provide a Number ID and catalog ID of 1 to 32 digits.", "invalid_parameter");
        return "/messaging/" + E(session) + "/catalogs" + (catalogId is null ? "" : "/" + E(catalogId));
    }
    public Task<ApiResponse<SuccessEnvelope<CloudCatalogCacheList>>> ListAsync(string session, RequestOptions? options = null) => Get<SuccessEnvelope<CloudCatalogCacheList>>(Path(session), options);
    public Task<ApiResponse<SuccessEnvelope<CloudCatalogSync>>> RetrieveAsync(string session, string catalogId, RequestOptions? options = null) => Get<SuccessEnvelope<CloudCatalogSync>>(Path(session, catalogId), options);
    public Task<ApiResponse<SuccessEnvelope<CloudCatalogProductPage>>> ListProductsAsync(string session, string catalogId, CatalogProductsParameters? parameters = null, RequestOptions? options = null)
    {
        if (parameters?.Limit is < 1 or > 100 || parameters?.Cursor is string cursor && !Regex.IsMatch(cursor, @"\A[A-Za-z0-9_-]{1,256}\z")) throw new PolymorfaValidationException("Invalid catalog pagination.", "invalid_parameter");
        return Get<SuccessEnvelope<CloudCatalogProductPage>>(Path(session, catalogId) + "/products", options, parameters);
    }
    /// <summary>Submit once, allow the server's 50-second budget, preserve cooldown errors.</summary>
    public Task<ApiResponse<SuccessEnvelope<CloudCatalogSync>>> SyncAsync(string session, string catalogId, RequestOptions? options = null) => Http.RequestEmptyMutationAsync<SuccessEnvelope<CloudCatalogSync>>(HttpMethod.Post, Path(session, catalogId) + "/sync", (options ?? new()) with { MaxNetworkRetries = 0, Timeout = options?.Timeout ?? TimeSpan.FromSeconds(60) });
}
public sealed record MarketingOnboarding(string Status, string? MetaStatus);
public sealed record MarketingTerms(string Status, string? MetaStatus, string? Date);
public sealed record MarketingMessagesStatus(string WabaId, MarketingOnboarding Onboarding, MarketingTerms Terms, bool? CloudApiMarketingDisabled, string NextAction, string GuideUrl, string ObservedAt);
/// <summary>Incoming cart quantity covers the API positive safe-integer range through 9007199254740991.</summary>
public sealed record CloudOrderItem(string ProductRetailerId, long Quantity, double ItemPrice, string Currency);
public sealed record CloudOrder(string CatalogId, IReadOnlyList<CloudOrderItem> Items, string? Text = null);
public sealed record ContactPreviousIdentity(string? Id = null, string? Bsuid = null, string? ParentBsuid = null);
public sealed record ContactIdentityChange(string Reason, string MessageId, ContactPreviousIdentity? Previous = null);
public sealed record MarketingOnboardingUpdatedPayload(string Kind, string WabaId, string MetaEvent, string? OwnerBusinessId = null);
public sealed record ContactMarketingPreferencePayload(string WaId, string Preference, string Category, string? PhoneNumberId = null);
public static class CloudReadiness
{
    // QuickLink errorCode stays an open nullable string; these are not public errors.
    public static IReadOnlyList<string> FailureCodes { get; } = Array.AsReadOnly(new[] { "meta_credentials_invalid", "meta_phone_not_registered", "meta_webhook_not_subscribed", "meta_payment_method_missing", "meta_quality_flagged", "meta_readiness_unknown" });
}
public sealed record WebhookBatchingInput(bool Enabled, int? MaxEvents = null, int? WindowMs = null)
{
    internal void Validate(string? format)
    {
        if (MaxEvents is < 2 or > 100 || WindowMs is < 100 or > 1000 || Enabled && format == "meta") throw new PolymorfaValidationException("Invalid native webhook batching settings.", "invalid_parameter");
    }
}
public sealed record WebhookBatching(bool Enabled, int MaxEvents, int WindowMs);
public abstract record VerifiedWebhookDelivery;
public sealed record SingleWebhookDelivery(WebhookEvent Event) : VerifiedWebhookDelivery;
public sealed record WebhookEventBatch(string Object, int Version, string Id, IReadOnlyList<WebhookEvent> Events) : VerifiedWebhookDelivery;
public static partial class Webhooks
{
    /// <summary>Verify the original whole body once. Deduplicate batch and member IDs.</summary>
    public static VerifiedWebhookDelivery ConstructDelivery(ReadOnlySpan<byte> rawBody, string signature, string secret)
    {
        if (!VerifySignature(rawBody, signature, secret)) throw new WebhookSignatureException();
        return ParseVerifiedDelivery(rawBody);
    }
    public static VerifiedWebhookDelivery ParseVerifiedDelivery(ReadOnlySpan<byte> rawBody)
    {
        JsonDocument document;
        try { document = JsonDocument.Parse(rawBody.ToArray()); }
        catch (JsonException) { throw new PolymorfaValidationException("Invalid webhook JSON.", "invalid_webhook_json"); }
        using (document)
        {
            var value = document.RootElement;
            if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty("object", out var kind) || kind.ValueKind != JsonValueKind.String || kind.GetString() != "event_batch") return new SingleWebhookDelivery(ParseVerifiedEvent(rawBody));
            if (value.EnumerateObject().Count() != 4 || !value.TryGetProperty("version", out var version) || version.ValueKind != JsonValueKind.Number || !version.TryGetInt32(out var v) || v != 1 || !value.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String || !Guid.TryParseExact(id.GetString(), "D", out _) || !value.TryGetProperty("events", out var members) || members.ValueKind != JsonValueKind.Array || members.GetArrayLength() is < 1 or > 100) throw new PolymorfaValidationException("Invalid version 1 event batch.", "invalid_webhook_batch");
            var events = new List<WebhookEvent>();
            foreach (var member in members.EnumerateArray())
            {
                if (member.ValueKind != JsonValueKind.Object || member.TryGetProperty("object", out _)) throw new PolymorfaValidationException("Nested or invalid event batch.", "invalid_webhook_batch");
                events.Add(ParseVerifiedEvent(System.Text.Encoding.UTF8.GetBytes(member.GetRawText())));
            }
            return new WebhookEventBatch("event_batch", 1, id.GetString()!, events.AsReadOnly());
        }
    }
}
