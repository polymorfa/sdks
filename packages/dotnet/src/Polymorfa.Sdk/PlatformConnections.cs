using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record ConnectionProjectContext(string? ProjectId = null);
public sealed record ListPlatformConnectionsParameters(string? ProjectId = null);
public sealed record ConnectionBatchRequest(IReadOnlyList<string> ConnectionIds, string? ProjectId = null);
public sealed record ConnectionBatchStopResult(int Stopping);
public sealed record ConnectionBatchRemoveResult(int Removed);
public sealed record ConfirmConnectionTierRequest(string QuoteId, string? ProjectId = null);
public sealed record HybridMerge(string AbsorbConnectionId);
public sealed record HybridResolution(string Action, string? Transport = null, string? ExistingConnectionTransport = null, string? NewConnectionName = null);
public sealed record ConnectionTierQuoteRequest([property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? TierOverride, string? ProjectId = null, HybridResolution? HybridResolution = null, HybridMerge? HybridMerge = null);
public sealed record ConnectionHybridTransition(string Action, string SurvivingConnectionId, string? Status = null, string? FailureReason = null, bool? MetaDisconnectRequired = null, long? EffectiveAtMs = null, string? KeepTransport = null, string? ExistingConnectionTransport = null, string? NewConnectionName = null, string? NewConnectionId = null, string? AbsorbConnectionId = null);
public sealed record ConnectionTierQuote(string Tier, string? TierOverride, decimal AmountCents, string PriceVersion, string Action, long EffectiveAtMs, string? ReplacesWindowId, ConnectionHybridTransition? HybridTransition = null);
public sealed record ConnectionTierChange(string Id, string Status, string? FailureReason, long ExpiresAtMs, ConnectionTierQuote Quote);
public sealed record SafeModeSettings(string Presence, string Typing, string Reads, string Pacing, int OnlineStart, int OnlineEnd);
public sealed record SafeModeOverride(string Presence, string Typing, string Reads, string Pacing);
public sealed record SafeModeApplied(string ObservedAt, string? Presence, string? Typing, string? Reads, string? Pacing);
public sealed record ConnectionSafeMode(string Connection, string ProjectId, SafeModeSettings Project, SafeModeOverride Override, SafeModeSettings Effective, SafeModeApplied? Applied, bool Mismatch, bool Entitled, string? EntitlementReason);
public sealed record UpdateConnectionSafeModeRequest(string? Presence = null, string? Typing = null, string? Reads = null, string? Pacing = null);
[JsonConverter(typeof(ConnectionCapabilityConverter))]
public abstract record ConnectionCapability(string Key, string? Source);
public sealed record FeatureCapability(string Key, string? Source, bool? Value) : ConnectionCapability(Key, Source);
public sealed record LimitCapability(string Key, string? Source, string Unit, long? Value) : ConnectionCapability(Key, Source);
public sealed record UnknownConnectionCapability(string Key, string? Source, JsonElement Value) : ConnectionCapability(Key, Source);
public sealed record ConnectionCapabilities(string Connection, string ProjectId, string Status, string? SyncedAt, string? CheckedAt, string? AccountType, IReadOnlyList<ConnectionCapability> Capabilities);
internal sealed class ConnectionCapabilityConverter : JsonConverter<ConnectionCapability>
{
    public override ConnectionCapability Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        using var document = JsonDocument.ParseValue(ref reader); var json = document.RootElement;
        var key = json.GetProperty("key").GetString()!; var source = json.GetProperty("source").GetString(); var value = json.GetProperty("value");
        return json.GetProperty("kind").GetString() switch
        {
            "feature" => new FeatureCapability(key, source, value.ValueKind == JsonValueKind.Null ? null : value.GetBoolean()),
            "limit" => new LimitCapability(key, source, json.GetProperty("unit").GetString()!, value.ValueKind == JsonValueKind.Null ? null : value.GetInt64()),
            _ => new UnknownConnectionCapability(key, source, json.Clone())
        };
    }
    public override void Write(Utf8JsonWriter writer, ConnectionCapability value, JsonSerializerOptions options)
    {
        if (value is UnknownConnectionCapability unknown) { unknown.Value.WriteTo(writer); return; }
        writer.WriteStartObject(); writer.WriteString("key", value.Key); writer.WriteString("source", value.Source);
        if (value is FeatureCapability feature) { writer.WriteString("kind", "feature"); writer.WriteNull("unit"); writer.WritePropertyName("value"); JsonSerializer.Serialize(writer, feature.Value, options); }
        if (value is LimitCapability limit) { writer.WriteString("kind", "limit"); writer.WriteString("unit", limit.Unit); writer.WritePropertyName("value"); JsonSerializer.Serialize(writer, limit.Value, options); }
        writer.WriteEndObject();
    }
}
public sealed class PlatformConnections : Resource
{
    internal PlatformConnections(HttpTransport http) : base(http) { }
    private static string Path(string id) => "/platform/connections/" + E(id);
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<PlatformConnection>>>> ListAsync(ListPlatformConnectionsParameters? parameters = null, RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<PlatformConnection>>>("/platform/connections", options, parameters);
    public Task<ApiResponse<SuccessEnvelope<Connection>>> RetrieveAsync(string id, RequestOptions? options = null) => ExistingContractCodec.Request<SuccessEnvelope<Connection>>(Http, HttpMethod.Get, Path(id), options: options);
    public Task<ApiResponse<SuccessEnvelope<Connection>>> UpdateAsync(string id, UpdateConnectionRequest body, RequestOptions? options = null)
    {
        var captured = ConfigurationContract.Capture(body, body.Configuration, out var intent);
        return ExistingContractCodec.Request<SuccessEnvelope<Connection>>(Http, HttpMethod.Put, Path(id), captured, ExistingContractCodec.Options(options, intent));
    }
    public Task<ApiResponse<DataEnvelope<ConnectionStartResult>>> StartAsync(string id, ConnectionProjectContext? body = null, RequestOptions? options = null) => Post<DataEnvelope<ConnectionStartResult>>(Path(id) + "/start", body ?? new(), options);
    public Task<ApiResponse<DataEnvelope<ConnectionStopResult>>> StopAsync(string id, ConnectionProjectContext? body = null, RequestOptions? options = null) => Post<DataEnvelope<ConnectionStopResult>>(Path(id) + "/stop", body ?? new(), options);
    public Task<ApiResponse<DataEnvelope<ConnectionBatchStopResult>>> StopManyAsync(ConnectionBatchRequest body, RequestOptions? options = null) => Post<DataEnvelope<ConnectionBatchStopResult>>("/platform/connections/stop", body, options);
    public Task<ApiResponse<DataEnvelope<ConnectionRemoveResult>>> DeleteAsync(string id, RequestOptions? options = null) => Delete<DataEnvelope<ConnectionRemoveResult>>(Path(id), options);
    public Task<ApiResponse<DataEnvelope<ConnectionBatchRemoveResult>>> DeleteManyAsync(ConnectionBatchRequest body, RequestOptions? options = null) => Post<DataEnvelope<ConnectionBatchRemoveResult>>("/platform/connections/delete", body, options);
    public Task<ApiResponse<DataEnvelope<ConnectionTierChange>>> QuoteTierChangeAsync(string id, ConnectionTierQuoteRequest body, RequestOptions? options = null)
    {
        if (body.HybridResolution is not null && body.HybridMerge is not null) throw new PolymorfaValidationException("Send hybridResolution or hybridMerge, not both.", "invalid_parameter");
        return Post<DataEnvelope<ConnectionTierChange>>(Path(id) + "/tier-quotes", body, options);
    }
    public Task<ApiResponse<DataEnvelope<ConnectionTierChange>>> RetrieveTierChangeAsync(string id, string quoteId, RequestOptions? options = null) => Get<DataEnvelope<ConnectionTierChange>>(Path(id) + "/tier-quotes/" + E(quoteId), options);
    public Task<ApiResponse<DataEnvelope<ConnectionTierChange>>> SetTierOverrideAsync(string id, ConfirmConnectionTierRequest body, RequestOptions? options = null)
    {
        if (string.IsNullOrWhiteSpace(body.QuoteId)) throw new PolymorfaValidationException("Review a tier quote and supply its quoteId.", "invalid_parameter");
        return Patch<DataEnvelope<ConnectionTierChange>>(Path(id), body, options);
    }
    public Task<ApiResponse<DataEnvelope<ConnectionCapabilities>>> GetCapabilitiesAsync(string id, RequestOptions? options = null) => Get<DataEnvelope<ConnectionCapabilities>>(Path(id) + "/capabilities", options);
    public Task<ApiResponse<DataEnvelope<ConnectionSafeMode>>> GetSafeModeAsync(string id, RequestOptions? options = null) => Get<DataEnvelope<ConnectionSafeMode>>(Path(id) + "/safe-mode", options);
    public Task<ApiResponse<DataEnvelope<ConnectionSafeMode>>> UpdateSafeModeAsync(string id, UpdateConnectionSafeModeRequest body, RequestOptions? options = null) => Put<DataEnvelope<ConnectionSafeMode>>(Path(id) + "/safe-mode", body, options);
}
