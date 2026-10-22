using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
namespace Polymorfa.Sdk;

internal static class CampaignReplyFlowUnions
{
    internal static Type Resolve(Type type, JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty("kind", out var kind) || kind.ValueKind != JsonValueKind.String) throw new JsonException("Missing reply-flow kind.");
        return (type == typeof(CampaignReplyFlowSend), kind.GetString()) switch
        {
            (true, "text") => typeof(CampaignReplyText),
            (true, "buttons") => typeof(CampaignReplyButtons),
            (true, "list") => typeof(CampaignReplyList),
            (true, "flow_form") => typeof(CampaignReplyForm),
            (false, "choice") => typeof(CampaignReplyChoice),
            (false, "keyword") => typeof(CampaignReplyKeyword),
            (false, "flow_submission") => typeof(CampaignReplySubmission),
            _ => throw new JsonException("Unsupported reply-flow kind.")
        };
    }
    internal static void Write(Utf8JsonWriter writer, object value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        foreach (var property in value.GetType().GetProperties(BindingFlags.Instance | BindingFlags.Public))
        {
            var item = property.GetValue(value);
            if (item is null && property.GetCustomAttribute<CampaignOptionalAttribute>() is not null) continue;
            writer.WritePropertyName(JsonNamingPolicy.CamelCase.ConvertName(property.Name));
            JsonSerializer.Serialize(writer, item, property.PropertyType, options);
        }
        writer.WriteEndObject();
    }
}
public sealed class CampaignReplyFlowSendConverter : JsonConverter<CampaignReplyFlowSend>
{
    public override CampaignReplyFlowSend Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        return (CampaignReplyFlowSend)(doc.RootElement.Deserialize(CampaignReplyFlowUnions.Resolve(typeof(CampaignReplyFlowSend), doc.RootElement), options) ?? throw new JsonException());
    }
    public override void Write(Utf8JsonWriter writer, CampaignReplyFlowSend value, JsonSerializerOptions options) => CampaignReplyFlowUnions.Write(writer, value, options);
}
public sealed class CampaignReplyFlowMatchConverter : JsonConverter<CampaignReplyFlowMatch>
{
    public override CampaignReplyFlowMatch Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        return (CampaignReplyFlowMatch)(doc.RootElement.Deserialize(CampaignReplyFlowUnions.Resolve(typeof(CampaignReplyFlowMatch), doc.RootElement), options) ?? throw new JsonException());
    }
    public override void Write(Utf8JsonWriter writer, CampaignReplyFlowMatch value, JsonSerializerOptions options) => CampaignReplyFlowUnions.Write(writer, value, options);
}
