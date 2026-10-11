using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record SessionProjectContext(string? ProjectId = null);
public sealed record ListPlatformSessionsParameters(string? ProjectId = null);
public sealed record SessionBatchRequest(IReadOnlyList<string> SessionIds, string? ProjectId = null);
public sealed record SessionBatchStopResult(int Stopping);
public sealed record SessionBatchRemoveResult(int Removed);
public sealed record ConfirmNumberTierRequest(string QuoteId, string? ProjectId = null);
public sealed record HybridMerge(string AbsorbNumberId);
public sealed record HybridResolution(string Action, string? Transport = null, string? ExistingNumberTransport = null, string? NewNumberName = null);
public sealed record NumberTierQuoteRequest([property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? TierOverride, string? ProjectId = null, HybridResolution? HybridResolution = null, HybridMerge? HybridMerge = null);
public sealed record NumberHybridTransition(string Action, string SurvivingNumberId, string? Status = null, string? FailureReason = null, bool? MetaDisconnectRequired = null, long? EffectiveAtMs = null, string? KeepTransport = null, string? ExistingNumberTransport = null, string? NewNumberName = null, string? NewNumberId = null, string? AbsorbNumberId = null);
public sealed record NumberTierQuote(string Tier, string? TierOverride, decimal AmountCents, string PriceVersion, string Action, long EffectiveAtMs, string? ReplacesWindowId, NumberHybridTransition? HybridTransition = null);
public sealed record NumberTierChange(string Id, string Status, string? FailureReason, long ExpiresAtMs, NumberTierQuote Quote);
public sealed record SafeModeSettings(string Presence, string Typing, string Reads, string Pacing, int OnlineStart, int OnlineEnd);
public sealed record SafeModeOverride(string Presence, string Typing, string Reads, string Pacing);
public sealed record SafeModeApplied(string ObservedAt, string? Presence, string? Typing, string? Reads, string? Pacing);
public sealed record SessionSafeMode(string Session, string ProjectId, SafeModeSettings Project, SafeModeOverride Override, SafeModeSettings Effective, SafeModeApplied? Applied, bool Mismatch, bool Entitled, string? EntitlementReason);
public sealed record UpdateSessionSafeModeRequest(string? Presence = null, string? Typing = null, string? Reads = null, string? Pacing = null);
[JsonConverter(typeof(SessionCapabilityConverter))]
public abstract record SessionCapability(string Key, string? Source);
public sealed record FeatureCapability(string Key, string? Source, bool? Value) : SessionCapability(Key, Source);
public sealed record LimitCapability(string Key, string? Source, string Unit, long? Value) : SessionCapability(Key, Source);
public sealed record UnknownSessionCapability(string Key, string? Source, JsonElement Value) : SessionCapability(Key, Source);
public sealed record SessionCapabilities(string Session, string ProjectId, string Status, string? SyncedAt, string? CheckedAt, string? AccountType, IReadOnlyList<SessionCapability> Capabilities);
internal sealed class SessionCapabilityConverter : JsonConverter<SessionCapability>
{
    public override SessionCapability Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        using var document = JsonDocument.ParseValue(ref reader); var json = document.RootElement;
        var key = json.GetProperty("key").GetString()!; var source = json.GetProperty("source").GetString(); var value = json.GetProperty("value");
        return json.GetProperty("kind").GetString() switch
        {
            "feature" => new FeatureCapability(key, source, value.ValueKind == JsonValueKind.Null ? null : value.GetBoolean()),
            "limit" => new LimitCapability(key, source, json.GetProperty("unit").GetString()!, value.ValueKind == JsonValueKind.Null ? null : value.GetInt64()),
            _ => new UnknownSessionCapability(key, source, json.Clone())
        };
    }
    public override void Write(Utf8JsonWriter writer, SessionCapability value, JsonSerializerOptions options)
    {
        if (value is UnknownSessionCapability unknown) { unknown.Value.WriteTo(writer); return; }
        writer.WriteStartObject(); writer.WriteString("key", value.Key); writer.WriteString("source", value.Source);
        if (value is FeatureCapability feature) { writer.WriteString("kind", "feature"); writer.WriteNull("unit"); writer.WritePropertyName("value"); JsonSerializer.Serialize(writer, feature.Value, options); }
        if (value is LimitCapability limit) { writer.WriteString("kind", "limit"); writer.WriteString("unit", limit.Unit); writer.WritePropertyName("value"); JsonSerializer.Serialize(writer, limit.Value, options); }
        writer.WriteEndObject();
    }
}
public sealed class PlatformSessions : Resource
{
    internal PlatformSessions(HttpTransport http) : base(http) { }
    private static string Path(string id) => "/platform/sessions/" + E(id);
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<PlatformSession>>>> ListAsync(ListPlatformSessionsParameters? parameters = null, RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<PlatformSession>>>("/platform/sessions", options, parameters);
    public Task<ApiResponse<SuccessEnvelope<Session>>> RetrieveAsync(string id, RequestOptions? options = null) => Get<SuccessEnvelope<Session>>(Path(id), options);
    public Task<ApiResponse<SuccessEnvelope<Session>>> UpdateAsync(string id, UpdateSessionRequest body, RequestOptions? options = null) => Put<SuccessEnvelope<Session>>(Path(id), body, options);
    public Task<ApiResponse<DataEnvelope<SessionStartResult>>> StartAsync(string id, SessionProjectContext? body = null, RequestOptions? options = null) => Post<DataEnvelope<SessionStartResult>>(Path(id) + "/start", body ?? new(), options);
    public Task<ApiResponse<DataEnvelope<SessionStopResult>>> StopAsync(string id, SessionProjectContext? body = null, RequestOptions? options = null) => Post<DataEnvelope<SessionStopResult>>(Path(id) + "/stop", body ?? new(), options);
    public Task<ApiResponse<DataEnvelope<SessionBatchStopResult>>> StopManyAsync(SessionBatchRequest body, RequestOptions? options = null) => Post<DataEnvelope<SessionBatchStopResult>>("/platform/sessions/stop", body, options);
    public Task<ApiResponse<DataEnvelope<SessionRemoveResult>>> DeleteAsync(string id, RequestOptions? options = null) => Delete<DataEnvelope<SessionRemoveResult>>(Path(id), options);
    public Task<ApiResponse<DataEnvelope<SessionBatchRemoveResult>>> DeleteManyAsync(SessionBatchRequest body, RequestOptions? options = null) => Post<DataEnvelope<SessionBatchRemoveResult>>("/platform/sessions/delete", body, options);
    public Task<ApiResponse<DataEnvelope<NumberTierChange>>> QuoteTierChangeAsync(string id, NumberTierQuoteRequest body, RequestOptions? options = null)
    {
        if (body.HybridResolution is not null && body.HybridMerge is not null) throw new PolymorfaValidationException("Send hybridResolution or hybridMerge, not both.", "invalid_parameter");
        return Post<DataEnvelope<NumberTierChange>>(Path(id) + "/tier-quotes", body, options);
    }
    public Task<ApiResponse<DataEnvelope<NumberTierChange>>> RetrieveTierChangeAsync(string id, string quoteId, RequestOptions? options = null) => Get<DataEnvelope<NumberTierChange>>(Path(id) + "/tier-quotes/" + E(quoteId), options);
    public Task<ApiResponse<DataEnvelope<NumberTierChange>>> SetTierOverrideAsync(string id, ConfirmNumberTierRequest body, RequestOptions? options = null)
    {
        if (string.IsNullOrWhiteSpace(body.QuoteId)) throw new PolymorfaValidationException("Review a tier quote and supply its quoteId.", "invalid_parameter");
        return Patch<DataEnvelope<NumberTierChange>>(Path(id), body, options);
    }
    public Task<ApiResponse<DataEnvelope<SessionCapabilities>>> GetCapabilitiesAsync(string id, RequestOptions? options = null) => Get<DataEnvelope<SessionCapabilities>>(Path(id) + "/capabilities", options);
    public Task<ApiResponse<DataEnvelope<SessionSafeMode>>> GetSafeModeAsync(string id, RequestOptions? options = null) => Get<DataEnvelope<SessionSafeMode>>(Path(id) + "/safe-mode", options);
    public Task<ApiResponse<DataEnvelope<SessionSafeMode>>> UpdateSafeModeAsync(string id, UpdateSessionSafeModeRequest body, RequestOptions? options = null) => Put<DataEnvelope<SessionSafeMode>>(Path(id) + "/safe-mode", body, options);
}
