using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

// Existing endpoints have distinct envelopes and optional fields. Keep their
// policy separate from the stricter, non-null supplement data contract.
internal static class ExistingContractCodec
{
    internal static RequestOptions Options(RequestOptions? options, bool intent = false)
    {
        if (options?.ApiVersion is { Length: 0 }) throw new PolymorfaConfigurationException("Invalid apiVersion.");
        return (options ?? new()) with { ApiVersion = options?.ApiVersion ?? (intent ? WhatsAppMediaResource.CustomerOwnedApiVersion : null) };
    }
    internal static CampaignCapturedBody Capture(object body) => new(CampaignContractCodec.Encode(CampaignContractValidation.Capture(body)));
    internal static async Task<ApiResponse<T>> Request<T>(HttpTransport http, HttpMethod method, string path, object? body = null, RequestOptions? options = null, IReadOnlyList<KeyValuePair<string, string>>? query = null, bool nullableData = false, int status = 200, bool platformRecipients = false)
    {
        var response = await http.RequestAsync<JsonElement>(method, path, body, Options(options), query).ConfigureAwait(false);
        return Decode<T>(response, nullableData, status, platformRecipients);
    }
    internal static ApiResponse<T> Decode<T>(ApiResponse<JsonElement> response, bool nullableData = false, int status = 200, bool platformRecipients = false)
    {
        try
        {
            CheckMetadata(response.Metadata, status);
            Validate(response.Data, typeof(T), false, nullableData);
            if (platformRecipients)
                foreach (var row in response.Data.GetProperty("data").EnumerateArray())
                    if (row.GetProperty("nextMessageAt") is { ValueKind: JsonValueKind.Number } next && next.GetDouble() != Math.Truncate(next.GetDouble())) throw new JsonException();
            return new(response.Data.Deserialize<T>(HttpTransport.Json) ?? throw new JsonException(), response.Metadata);
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException or FormatException or OverflowException)
        {
            throw new PolymorfaServerException("Invalid API response structure.", "invalid_response", response.Metadata);
        }
    }
    internal static void CheckMetadata(ResponseMetadata metadata, int status = 200)
    {
        if (metadata.Status != status || !string.Equals(metadata.Headers.GetValueOrDefault("content-type")?.Split(';')[0].Trim(), "application/json", StringComparison.OrdinalIgnoreCase)) throw new JsonException();
    }
    private static bool Optional(Type type, string name)
    {
        if (typeof(Campaign).IsAssignableFrom(type)) return (name is "composerBlueprint" or "messages" or "audienceRef" or "senderConfig" or "complianceConfig" or "variants" or "variantStrategy" or "messageVariations" or "variableMapping" or "frequencyCap" or "drip" or "enrollmentOpen" or "pauseReason" or "segmentId" or "segmentSnapshot") || name == "operationId" && type == typeof(CampaignStopOperation);
        if (typeof(CampaignAnalytics).IsAssignableFrom(type)) return name is "frequencyCap" or "drip";
        if (type == typeof(AudienceSegmentGroup)) return name == "negate";
        if (type == typeof(CampaignFollowUp)) return name is "delaySeconds" or "expirySeconds";
        if (type == typeof(CampaignVariableBinding)) return name is "source" or "fallback";
        if (type == typeof(CampaignVariantStrategy)) return name == "testSlicePercent";
        if (type == typeof(Session)) return name is "externalId" or "statusReason" or "signalMode" or "configuration" or "newChatCapping";
        if (type == typeof(HistorySyncPolicy)) return name == "delivery";
        if (type == typeof(ConfigurationSources)) return name == "historySync.delivery";
        if (type == typeof(SessionConfigurationView)) return name is "historyConsent" or "application";
        if (type == typeof(SessionConfigurationOverrides)) return true;
        if (type == typeof(HistorySyncOverride) || type == typeof(ObservationOverride) || type == typeof(HmsConfiguration)) return true;
        if (typeof(WhatsAppMetrics).IsAssignableFrom(type)) return name is "recipientActivity" or "responseQueue";
        if (type == typeof(WhatsAppConversationGroup)) return name is "recipientCountry" or "recipientDeviceCount";
        return false;
    }
    private static bool OptionalNull(Type type, string name) => typeof(Campaign).IsAssignableFrom(type) || typeof(CampaignAnalytics).IsAssignableFrom(type) && name == "drip" || typeof(WhatsAppMetrics).IsAssignableFrom(type) && name == "responseQueue" || type == typeof(Session) && name is "externalId" or "statusReason" or "configuration" or "newChatCapping";
    private static void Validate(JsonElement value, Type type, bool nullable, bool nullableData = false)
    {
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(PatchValue<>)) type = type.GetGenericArguments()[0];
        type = Nullable.GetUnderlyingType(type) ?? type;
        if (value.ValueKind == JsonValueKind.Null) { if (!nullable) throw new JsonException(); return; }
        if (type == typeof(JsonElement)) return;
        if (type == typeof(CampaignExperimentOutcome))
        {
            type = value.GetProperty("state").GetString() switch { "promoted" => typeof(CampaignPromoted), "inconclusive" => typeof(CampaignInconclusive), _ => throw new JsonException() };
        }
        if (type == typeof(CampaignFollowUpMessage)) type = value.GetProperty("type").GetString() switch { "text" => typeof(CampaignFollowUpText), "template" => typeof(CampaignFollowUpTemplate), _ => throw new JsonException() };
        if (type == typeof(string)) { if (value.ValueKind != JsonValueKind.String) throw new JsonException(); return; }
        if (type == typeof(bool)) { if (value.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) throw new JsonException(); return; }
        if (type == typeof(long) || type == typeof(int)) { if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out _) || type == typeof(int) && !value.TryGetInt32(out _)) throw new JsonException(); return; }
        if (type == typeof(double) || type == typeof(decimal)) { if (value.ValueKind != JsonValueKind.Number || !value.TryGetDouble(out var number) || !double.IsFinite(number)) throw new JsonException(); return; }
        if (type.IsEnum) { if (value.ValueKind != JsonValueKind.String) throw new JsonException(); var parsed = JsonSerializer.Deserialize(value.GetRawText(), type, HttpTransport.Json); if (JsonSerializer.SerializeToElement(parsed, type, HttpTransport.Json).GetString() != value.GetString()) throw new JsonException(); return; }
        if (type == typeof(CampaignVariableMapping))
        {
            if (value.ValueKind != JsonValueKind.Object) throw new JsonException();
            foreach (var entry in value.EnumerateObject()) Validate(entry.Value, typeof(CampaignVariableBinding), false);
            return;
        }
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(IReadOnlyList<>))
        {
            if (value.ValueKind != JsonValueKind.Array) throw new JsonException();
            foreach (var item in value.EnumerateArray()) Validate(item, type.GetGenericArguments()[0], false);
            return;
        }
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(IReadOnlyDictionary<,>))
        {
            if (value.ValueKind != JsonValueKind.Object) throw new JsonException();
            foreach (var item in value.EnumerateObject()) Validate(item.Value, type.GetGenericArguments()[1], false);
            return;
        }
        if (value.ValueKind != JsonValueKind.Object) throw new JsonException();
        var context = new NullabilityInfoContext();
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            if (property.GetCustomAttribute<JsonExtensionDataAttribute>() is not null) continue;
            var name = property.GetCustomAttribute<JsonPropertyNameAttribute>()?.Name ?? JsonNamingPolicy.CamelCase.ConvertName(property.Name);
            var optional = Optional(type, name);
            if (!value.TryGetProperty(name, out var item)) { if (!optional) throw new JsonException(); continue; }
            var envelope = name == "data" && type.IsGenericType && (type.GetGenericTypeDefinition() == typeof(DataEnvelope<>) || type.GetGenericTypeDefinition() == typeof(SuccessEnvelope<>));
            var allowsNull = envelope ? nullableData : (context.Create(property).ReadState == NullabilityState.Nullable || Nullable.GetUnderlyingType(property.PropertyType) is not null) && (!optional || OptionalNull(type, name));
            Validate(item, property.PropertyType, allowsNull);
            if (item.ValueKind == JsonValueKind.Number && (name.EndsWith("Count", StringComparison.Ordinal) || name is "messagesSent" or "attempts" || type == typeof(CampaignFollowUpReport) && name != "nextDueAt") && item.GetDouble() < 0) throw new JsonException();
        }
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(SuccessEnvelope<>) && !value.GetProperty("success").GetBoolean()) throw new JsonException();
        if (type == typeof(CampaignBlueprint) && value.GetProperty("version").GetInt32() != 2) throw new JsonException();
        if (type == typeof(UnlinkTestingPhoneDeviceResponse) && !value.GetProperty("unlinked").GetBoolean()) throw new JsonException();
        if (type == typeof(GroupCapabilities) && value.GetProperty("status").GetString() is not ("synced" or "unknown")) throw new JsonException();
        if (type == typeof(GroupCapability) && (value.GetProperty("kind").GetString() != "feature" || value.GetProperty("unit").ValueKind != JsonValueKind.Null || value.GetProperty("source") is { ValueKind: not JsonValueKind.Null } source && source.GetString() is not ("server" or "client_default"))) throw new JsonException();
    }
}
