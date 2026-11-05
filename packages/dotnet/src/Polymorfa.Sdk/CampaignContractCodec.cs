using System.Reflection;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
namespace Polymorfa.Sdk;

internal sealed record CampaignCapturedBody(byte[] Bytes);
internal static class CampaignContractCodec
{
    // New contract helpers capture their own compact UTF-8 bytes once. Legacy transport
    // callers retain HttpTransport.Json's established escaping policy.
    private static readonly JsonSerializerOptions WireJson = new(HttpTransport.Json) { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    internal static byte[] Encode(JsonElement value) => JsonSerializer.SerializeToUtf8Bytes(value, WireJson);
    internal static async Task<ApiResponse<T>> Request<T>(HttpTransport http, HttpMethod method, string path, object? body = null, RequestOptions? options = null, IReadOnlyList<KeyValuePair<string, string>>? query = null)
    {
        var captured = body is null ? null : new CampaignCapturedBody(Encode((JsonElement)body));
        var response = await http.RequestAsync<JsonElement>(method, path, captured, options, query).ConfigureAwait(false);
        try
        {
            if (response.Metadata.Status != 200 || response.Metadata.Headers.GetValueOrDefault("content-type")?.Split(';')[0].Trim() is not string mime || !mime.Equals("application/json", StringComparison.OrdinalIgnoreCase)) throw new JsonException();
            Validate(response.Data, typeof(T), false);
            return new(response.Data.Deserialize<T>(HttpTransport.Json) ?? throw new JsonException(), response.Metadata);
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException)
        {
            throw new PolymorfaServerException("Invalid API response structure.", "invalid_response", response.Metadata);
        }
    }
    internal static void Validate(JsonElement value, Type type, bool nullable)
    {
        var underlying = Nullable.GetUnderlyingType(type);
        if (underlying is not null)
        {
            type = underlying;
            nullable = true;
        }
        if (value.ValueKind == JsonValueKind.Null)
        {
            if (!nullable && type != typeof(AudienceProfileAttributeValue)) throw new JsonException();
            return;
        }
        if (type == typeof(JsonElement)) return;
        if (type == typeof(CampaignReplyFlowSend) || type == typeof(CampaignReplyFlowMatch)) type = CampaignReplyFlowUnions.Resolve(type, value);
        if (type == typeof(AudienceProfileAttributeValue))
        {
            AudienceProfileAttributeValue.From(value);
            return;
        }
        if (type == typeof(CampaignVariableValue))
        {
            CampaignVariableValue.From(value);
            return;
        }
        if (type == typeof(string))
        {
            if (value.ValueKind != JsonValueKind.String) throw new JsonException();
            return;
        }
        if (type == typeof(bool))
        {
            if (value.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) throw new JsonException();
            return;
        }
        if (type == typeof(long) || type == typeof(int))
        {
            if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out var number) || Math.Abs((double)number) > 9007199254740991 || type == typeof(int) && !value.TryGetInt32(out _)) throw new JsonException();
            return;
        }
        if (type.IsEnum)
        {
            if (value.ValueKind != JsonValueKind.String) throw new JsonException();
            JsonSerializer.Deserialize(value.GetRawText(), type, HttpTransport.Json);
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
            var name = property.GetCustomAttribute<JsonPropertyNameAttribute>()?.Name ?? JsonNamingPolicy.CamelCase.ConvertName(property.Name);
            if (!value.TryGetProperty(name, out var item))
            {
                if (property.GetCustomAttribute<CampaignOptionalAttribute>() is not null) continue;
                throw new JsonException();
            }
            var optional = property.GetCustomAttribute<CampaignOptionalAttribute>() is not null;
            var envelopeData = name == "data" && type.IsGenericType && (type.GetGenericTypeDefinition() == typeof(DataEnvelope<>) || type.GetGenericTypeDefinition() == typeof(SuccessEnvelope<>));
            Validate(item, property.PropertyType, !optional && !envelopeData && context.Create(property).ReadState == NullabilityState.Nullable);
            if (property.GetCustomAttribute<CampaignLiteralAttribute>() is { } literal && (item.ValueKind != JsonValueKind.String || !literal.Values.Contains(item.GetString()))) throw new JsonException();
        }
        if (type == typeof(CampaignReplyKeyword) && value.GetProperty("value").GetString()!.Length > 64) throw new JsonException();
        if (type == typeof(CampaignReplyFlowDefinition) && CampaignContractValidation.SemanticBytes(value.GetProperty("nodes")) > 24 * 1024) throw new JsonException();
        if (type == typeof(StopConfirmationSettings) && value.GetProperty("textRevision").GetInt32() != 1) throw new JsonException();
        if (type == typeof(CampaignLaunchApproval) && value.GetProperty("reasons").EnumerateArray().Any(reason => reason.GetString() is not ("audience_threshold" or "agent_request"))) throw new JsonException();
        if (type == typeof(DeleteAudienceProfileResult) && !value.GetProperty("deleted").GetBoolean()) throw new JsonException();
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(SuccessEnvelope<>) && !value.GetProperty("success").GetBoolean()) throw new JsonException();
    }
}
