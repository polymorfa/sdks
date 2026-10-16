using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
namespace Polymorfa.Sdk;

internal static class CampaignContractValidation
{
    private static readonly UTF8Encoding Utf8 = new(false, true);
    internal static void Invalid(string field) => throw new PolymorfaConfigurationException("Invalid campaign contract field: " + field + ".");
    internal static JsonElement Capture(object? input)
    {
        if (input is null) throw new PolymorfaConfigurationException("A request body is required.");
        try
        {
            return JsonSerializer.SerializeToElement(input, input.GetType(), InputJson);
        }
        catch (JsonException)
        {
            throw new PolymorfaConfigurationException("Invalid campaign contract input.");
        }
    }
    private static readonly JsonSerializerOptions InputJson = CreateInputJson();
    private static JsonSerializerOptions CreateInputJson()
    {
        var options = new JsonSerializerOptions(HttpTransport.Json);
        options.Converters.Insert(0, new InputStringConverter());
        return options;
    }
    // Refuse malformed UTF-16 during the single capture enumeration, before
    // System.Text.Json could replace it. Dictionary keys use the same check.
    private sealed class InputStringConverter : JsonConverter<string>
    {
        public override string Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) => reader.GetString()!;
        public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
        {
            Unicode(value);
            writer.WriteStringValue(value);
        }
        public override void WriteAsPropertyName(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
        {
            Unicode(value);
            writer.WritePropertyName(value);
        }
    }
    internal static void Unicode(string? value)
    {
        if (value is null) return;
        try
        {
            Utf8.GetByteCount(value);
        }
        catch (EncoderFallbackException)
        {
            Invalid("text");
        }
    }
    internal static string ScalarText(string value)
    {
        Unicode(value);
        return value;
    }
    internal static string Uuid(string? value, string field)
    {
        if (value is null || !Regex.IsMatch(value, "\\A[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\z", RegexOptions.CultureInvariant)) Invalid(field);
        return value!;
    }
    internal static string Phone(string? value)
    {
        if (value is null || !Regex.IsMatch(value, "\\A\\+[1-9][0-9]{6,14}\\z", RegexOptions.CultureInvariant)) Invalid("phone");
        return value!;
    }
    internal static string String(JsonElement value, string field, int minimum = 1, int maximum = int.MaxValue, bool bytes = false)
    {
        if (value.ValueKind != JsonValueKind.String) Invalid(field);
        var text = value.GetString()!;
        int count;
        try
        {
            count = bytes ? Utf8.GetByteCount(text) : text.Length;
        }
        catch (EncoderFallbackException)
        {
            Invalid(field);
            throw;
        }
        if (count < minimum || count > maximum) Invalid(field);
        return text;
    }
    internal static long Integer(JsonElement value, string field, long minimum = 0, long maximum = 9007199254740991)
    {
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out var number) || number < minimum || number > maximum) Invalid(field);
        return value.GetInt64();
    }
    internal static void Integer(long number, string field, long minimum = 0, long maximum = 9007199254740991)
    {
        if (number < minimum || number > maximum) Invalid(field);
    }
    internal static void Fields(JsonElement value, string[] allowed, string[] required, string field = "body")
    {
        if (value.ValueKind != JsonValueKind.Object) Invalid(field);
        if (value.EnumerateObject().Any(p => !allowed.Contains(p.Name)) || required.Any(name => !value.TryGetProperty(name, out _))) Invalid(field);
    }
    private static bool Has(JsonElement value, string name) => value.TryGetProperty(name, out _);
    private static void One(JsonElement value, string[] allowed, string field)
    {
        if (value.ValueKind != JsonValueKind.String || !allowed.Contains(value.GetString())) Invalid(field);
    }
    internal static string Trim(string value) => value.Trim('\u0009', '\u000a', '\u000b', '\u000c', '\u000d', '\u0020', '\u00a0', '\u1680', '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff');
    private static bool Control(string value, bool unicode = false) => value.Any(c => unicode ? char.GetUnicodeCategory(c) == UnicodeCategory.Control : c < 32 || c == 127);
    private static void Text(JsonElement value, string field, int maximum, bool multiline = false)
    {
        var text = String(value, field, 1, maximum, true);
        if (multiline && Trim(text).Length == 0 || Control(multiline ? text.Replace("\n", "").Replace("\r", "").Replace("\t", "") : text, true)) Invalid(field);
    }
    private static void Id(JsonElement value, string field)
    {
        if (!Regex.IsMatch(String(value, field), "\\A[A-Za-z0-9][A-Za-z0-9._:-]{0,63}\\z", RegexOptions.CultureInvariant)) Invalid(field);
    }
    internal static JsonElement Profile(PutAudienceProfileRequest input)
    {
        var body = Capture(input);
        Fields(body, ["tags", "attributes", "expectedRevision", "provenance", "consent"], ["tags", "attributes"]);
        if (Has(body, "expectedRevision")) Integer(body.GetProperty("expectedRevision"), "expectedRevision", 1);
        var tags = body.GetProperty("tags");
        if (tags.ValueKind != JsonValueKind.Array || tags.GetArrayLength() > 20) Invalid("tags");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var raw in tags.EnumerateArray())
        {
            var tag = String(raw, "tags", 1, 48, true);
            if (Control(tag) || !seen.Add(tag)) Invalid("tags");
        }
        var attrs = body.GetProperty("attributes");
        if (attrs.ValueKind != JsonValueKind.Object || attrs.EnumerateObject().Count() > 20 || SemanticBytes(attrs) > 8192) Invalid("attributes");
        foreach (var attr in attrs.EnumerateObject())
        {
            if (!Regex.IsMatch(attr.Name, "\\A[A-Za-z_][A-Za-z0-9_]{0,47}\\z", RegexOptions.CultureInvariant)) Invalid("attributes");
            var value = attr.Value;
            if (value.ValueKind == JsonValueKind.String)
            {
                if (String(value, "attributes", 0, 256, true).Contains('\0')) Invalid("attributes");
            }
            else if (value.ValueKind == JsonValueKind.Number)
            {
                if (!value.TryGetDouble(out var number) || !double.IsFinite(number)) Invalid("attributes");
            }
            else if (value.ValueKind is not (JsonValueKind.True or JsonValueKind.False or JsonValueKind.Null)) Invalid("attributes");
        }
        foreach (var name in new[] { "provenance", "consent" })
        {
            if (Has(body, name))
            {
                var item = body.GetProperty(name);
                var names = name == "consent" ? new[] { "source", "reference", "purpose", "allowed", "assertedAt" } : new[] { "source", "reference" };
                Fields(item, names, names, name);
                One(item.GetProperty("source"), ["api", "csv", "form"], name);
                if (Control(String(item.GetProperty("reference"), name, 1, 128, true))) Invalid(name);
                if (name == "consent")
                {
                    One(item.GetProperty("purpose"), ["campaigns"], name);
                    if (item.GetProperty("allowed").ValueKind is not (JsonValueKind.True or JsonValueKind.False)) Invalid(name);
                    Integer(item.GetProperty("assertedAt"), name, 0, 8640000000000000);
                }
            }
        }
        return body;
    }
    internal static IReadOnlyList<KeyValuePair<string, string>> Page(ListAudienceProfilesParameters? input)
    {
        if (input?.Cursor is { } cursor) Uuid(cursor, "cursor");
        if (input?.Limit is { } limit) Integer(limit, "limit", 1, 100);
        return Resource.Query(input).ToArray();
    }
    internal static JsonElement Import(CreateAudienceProfileImportRequest input)
    {
        var body = Capture(input);
        Fields(body, ["replayKey", "csvBase64", "mapping"], ["replayKey", "csvBase64"]);
        if (!Regex.IsMatch(String(body.GetProperty("replayKey"), "replayKey"), "\\A[A-Za-z0-9._:-]{1,128}\\z", RegexOptions.CultureInvariant)) Invalid("replayKey");
        var encoded = String(body.GetProperty("csvBase64"), "csvBase64", 1, 13981016);
        if (encoded.Length % 4 != 0 || !Regex.IsMatch(encoded, "\\A[A-Za-z0-9+/]+={0,2}\\z", RegexOptions.CultureInvariant)) Invalid("csvBase64");
        try
        {
            var csv = Convert.FromBase64String(encoded);
            if (csv.Length > 10 * 1024 * 1024 || Convert.ToBase64String(csv) != encoded || Utf8.GetString(csv).Contains('\0')) Invalid("csvBase64");
        }
        catch (FormatException)
        {
            Invalid("csvBase64");
        }
        catch (DecoderFallbackException)
        {
            Invalid("csvBase64");
        }
        if (Has(body, "mapping"))
        {
            var mapping = body.GetProperty("mapping");
            Fields(mapping, ["phone", "tags", "attributes", "expectedRevision", "provenanceReference", "consentAllowed", "consentAssertedAt", "consentReference"], ["phone", "tags", "attributes"], "mapping");
            var headers = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in mapping.EnumerateObject())
            {
                var text = String(property.Value, "mapping", 1, 64, true);
                if (Trim(text) != text || Control(text, true) || !headers.Add(text)) Invalid("mapping");
            }
        }
        if (CampaignContractCodec.Encode(body).Length > 14 * 1024 * 1024) Invalid("body");
        return body;
    }
    internal static JsonElement ReplyFlow(object input, bool project = false)
    {
        var body = Capture(input);
        Fields(body, project ? ["projectId", "name", "definition", "flowKey", "revision"] : ["name", "definition", "flowKey", "revision"], project ? ["projectId", "name", "definition"] : ["name", "definition"]);
        String(body.GetProperty("name"), "name", 1, 128, true);
        if (project) Uuid(String(body.GetProperty("projectId"), "projectId"), "projectId");
        if (Has(body, "flowKey")) Uuid(String(body.GetProperty("flowKey"), "flowKey"), "flowKey");
        if (Has(body, "revision")) Integer(body.GetProperty("revision"), "revision", 1, 1000000);
        var definition = body.GetProperty("definition");
        Fields(definition, ["entryNodeId", "nodes"], ["entryNodeId", "nodes"], "definition");
        Id(definition.GetProperty("entryNodeId"), "entryNodeId");
        var nodes = definition.GetProperty("nodes");
        if (nodes.ValueKind != JsonValueKind.Array || nodes.GetArrayLength() < 2 || nodes.GetArrayLength() > 12) Invalid("nodes");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var node in nodes.EnumerateArray())
        {
            Fields(node, ["id", "send", "edges"], ["id", "edges"], "node");
            Id(node.GetProperty("id"), "node.id");
            if (!ids.Add(node.GetProperty("id").GetString()!)) Invalid("node.id");
            if (Has(node, "send")) Send(node.GetProperty("send"));
            var edges = node.GetProperty("edges");
            if (edges.ValueKind != JsonValueKind.Array || edges.GetArrayLength() > 3) Invalid("edges");
            foreach (var edge in edges.EnumerateArray())
            {
                Fields(edge, ["match", "to"], ["match", "to"], "edge");
                Id(edge.GetProperty("to"), "edge.to");
                var match = edge.GetProperty("match");
                if (match.ValueKind != JsonValueKind.Object || !Has(match, "kind")) Invalid("match");
                var kind = String(match.GetProperty("kind"), "match.kind");
                switch (kind)
                {
                    case "choice":
                        Fields(match, ["kind", "replyKind", "id"], ["kind", "replyKind", "id"], "match");
                        One(match.GetProperty("replyKind"), ["button", "list"], "replyKind");
                        Id(match.GetProperty("id"), "match.id");
                        break;
                    case "keyword":
                        Fields(match, ["kind", "value"], ["kind", "value"], "match");
                        Text(match.GetProperty("value"), "match.value", 64);
                        break;
                    case "flow_submission":
                        Fields(match, ["kind"], ["kind"], "match");
                        break;
                    default:
                        Invalid("match.kind");
                        break;
                }
            }
        }
        if (SemanticBytes(nodes, true) > 24 * 1024) Invalid("nodes");
        return body;
    }
    private static void Send(JsonElement send)
    {
        if (send.ValueKind != JsonValueKind.Object || !Has(send, "kind")) Invalid("send");
        var kind = String(send.GetProperty("kind"), "send.kind");
        if (kind == "text")
        {
            Fields(send, ["kind", "text"], ["kind", "text"], "send");
            Text(send.GetProperty("text"), "text", 4096, true);
            return;
        }
        var extras = kind switch { "buttons" => new[] { "buttons" }, "list" => ["buttonText", "rows"], "flow_form" => ["flowId", "buttonText", "screen"], _ => throw new PolymorfaConfigurationException("Unsupported reply-flow send.") };
        Fields(send, new[] { "kind", "body", "footer" }.Concat(extras).ToArray(), new[] { "kind", "body" }.Concat(extras).ToArray(), "send");
        Text(send.GetProperty("body"), "body", 1024, true);
        if (Has(send, "footer")) Text(send.GetProperty("footer"), "footer", 60);
        if (kind != "buttons") Text(send.GetProperty("buttonText"), "buttonText", 20);
        if (kind == "flow_form")
        {
            Uuid(String(send.GetProperty("flowId"), "flowId"), "flowId");
            if (!Regex.IsMatch(String(send.GetProperty("screen"), "screen"), "\\A[A-Za-z0-9_]{1,64}\\z", RegexOptions.CultureInvariant)) Invalid("screen");
            return;
        }
        var key = kind == "buttons" ? "buttons" : "rows";
        var choices = send.GetProperty(key);
        if (choices.ValueKind != JsonValueKind.Array || choices.GetArrayLength() < 1 || choices.GetArrayLength() > (kind == "buttons" ? 3 : 10)) Invalid(key);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in choices.EnumerateArray())
        {
            Fields(item, kind == "buttons" ? ["id", "text"] : ["id", "title", "description"], kind == "buttons" ? ["id", "text"] : ["id", "title"], key);
            Id(item.GetProperty("id"), "choice.id");
            if (!ids.Add(item.GetProperty("id").GetString()!)) Invalid("choice.id");
            Text(item.GetProperty(kind == "buttons" ? "text" : "title"), key, kind == "buttons" ? 20 : 24);
            if (Has(item, "description")) Text(item.GetProperty("description"), "description", 72);
        }
    }
    internal static JsonElement TestSend(object input, bool project = false)
    {
        var body = Capture(input);
        Fields(body, project ? ["projectId", "sessionId", "to", "sampleRecipientId", "variables"] : ["sessionId", "to", "sampleRecipientId", "variables"], project ? ["projectId", "sessionId", "to"] : ["sessionId", "to"]);
        Uuid(String(body.GetProperty("sessionId"), "sessionId"), "sessionId");
        String(body.GetProperty("to"), "to", 1, 32);
        if (project) Uuid(String(body.GetProperty("projectId"), "projectId"), "projectId");
        if (Has(body, "sampleRecipientId")) Uuid(String(body.GetProperty("sampleRecipientId"), "sampleRecipientId"), "sampleRecipientId");
        if (Has(body, "variables"))
        {
            var variables = body.GetProperty("variables");
            if (variables.ValueKind != JsonValueKind.Object || variables.EnumerateObject().Count() > 50) Invalid("variables");
            foreach (var variable in variables.EnumerateObject())
            {
                if (!Regex.IsMatch(variable.Name, "\\A[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}\\z", RegexOptions.CultureInvariant)) Invalid("variables");
                var value = variable.Value;
                string rendered;
                if (value.ValueKind == JsonValueKind.String) rendered = value.GetString()!;
                else if (value.ValueKind is JsonValueKind.True or JsonValueKind.False) rendered = value.GetBoolean() ? "true" : "false";
                else if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number)) rendered = Number(number);
                else
                {
                    Invalid("variables");
                    throw new InvalidOperationException();
                }
                if (rendered.Length > 1024) Invalid("variables");
            }
        }
        return body;
    }
    internal static JsonElement Assignment(object input, bool project = false)
    {
        var body = Capture(input);
        Fields(body, project ? ["projectId", "replyFlowId"] : ["replyFlowId"], project ? ["projectId", "replyFlowId"] : ["replyFlowId"]);
        if (project) Uuid(String(body.GetProperty("projectId"), "projectId"), "projectId");
        if (body.GetProperty("replyFlowId").ValueKind != JsonValueKind.Null) Uuid(String(body.GetProperty("replyFlowId"), "replyFlowId"), "replyFlowId");
        return body;
    }
    internal static IReadOnlyList<KeyValuePair<string, string>> Export(CampaignRecipientExportParameters? input)
    {
        var body = Capture(input ?? new());
        Fields(body, ["status", "reason", "cursor", "limit"], []);
        if (Has(body, "status")) One(body.GetProperty("status"), ["queued", "sending", "sent", "delivered", "read", "failed", "skipped"], "status");
        if (Has(body, "reason")) One(body.GetProperty("reason"), ["opted_out", "cold_held", "campaign_cancelled", "invalid_recipient", "session_not_connected", "ack_timeout", "blocked_by_safety", "send_failed", "missing_variable", "other"], "reason");
        if (Has(body, "cursor")) String(body.GetProperty("cursor"), "cursor", 1, 256);
        if (Has(body, "limit")) Integer(body.GetProperty("limit"), "limit", 1, 1000);
        if ((Has(body, "status") || Has(body, "reason")) && (Has(body, "cursor") || Has(body, "limit") && body.GetProperty("limit").GetInt32() != 1000)) Invalid("params");
        return Resource.Query(body).ToArray();
    }
    internal static JsonElement Retarget(CreateAudienceFromCampaignRequest input)
    {
        var body = Capture(input);
        Fields(body, ["name", "campaignId", "outcome", "projectId"], ["name", "campaignId", "outcome"]);
        var name = Trim(String(body.GetProperty("name"), "name"));
        if (name.Length < 1 || name.Length > 200) Invalid("name");
        Uuid(String(body.GetProperty("campaignId"), "campaignId"), "campaignId");
        if (Has(body, "projectId")) Uuid(String(body.GetProperty("projectId"), "projectId"), "projectId");
        One(body.GetProperty("outcome"), ["delivered", "not_delivered", "read", "not_read", "replied", "not_replied", "failed"], "outcome");
        return body;
    }
    internal static JsonElement Stop(UpdateStopConfirmationSettingsInput input)
    {
        var body = Capture(input);
        Fields(body, ["teamId", "revision", "enabled", "locale"], ["teamId", "revision", "enabled", "locale"]);
        Uuid(String(body.GetProperty("teamId"), "teamId"), "teamId");
        Integer(body.GetProperty("revision"), "revision", 0, 2147483646);
        if (body.GetProperty("enabled").ValueKind is not (JsonValueKind.True or JsonValueKind.False)) Invalid("enabled");
        var locale = body.GetProperty("locale");
        if (locale.ValueKind == JsonValueKind.Null)
        {
            if (body.GetProperty("enabled").GetBoolean()) Invalid("locale");
        }
        else One(locale, ["en", "pt-BR", "es"], "locale");
        return body;
    }
    internal static JsonElement Custody(object input, bool customer = false)
    {
        var body = Capture(input);
        Fields(body, ["expectedRevision", "signalModeDefault"], ["expectedRevision", "signalModeDefault"]);
        Integer(body.GetProperty("expectedRevision"), "expectedRevision");
        if (!(customer && body.GetProperty("signalModeDefault").ValueKind == JsonValueKind.Null)) One(body.GetProperty("signalModeDefault"), ["standard", "zero_knowledge"], "signalModeDefault");
        return body;
    }
    internal static JsonElement Project(JsonElement body, string projectId)
    {
        var dictionary = body.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone(), StringComparer.Ordinal);
        dictionary.Add("projectId", JsonSerializer.SerializeToElement(Uuid(projectId, "projectId")));
        return JsonSerializer.SerializeToElement(dictionary, HttpTransport.Json);
    }
    internal static long SemanticBytes(JsonElement value, bool normalizedKeywords = false) => Encoding.UTF8.GetByteCount(Semantic(value, normalizedKeywords));
    private static string Quote(string value)
    {
        var result = new StringBuilder("\"");
        for (var i = 0; i < value.Length; i++)
        {
            var c = value[i];
            switch (c)
            {
                case '"':
                    result.Append("\\\"");
                    break;
                case '\\':
                    result.Append("\\\\");
                    break;
                case '\b':
                    result.Append("\\b");
                    break;
                case '\t':
                    result.Append("\\t");
                    break;
                case '\n':
                    result.Append("\\n");
                    break;
                case '\f':
                    result.Append("\\f");
                    break;
                case '\r':
                    result.Append("\\r");
                    break;
                default:
                    if (c < 32 || char.IsSurrogate(c) && !(char.IsHighSurrogate(c) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1])))
                    {
                        result.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        result.Append(c);
                        if (char.IsHighSurrogate(c)) result.Append(value[++i]);
                    }
                    break;
            }
        }
        return result.Append('"').ToString();
    }
    private static string Semantic(JsonElement value, bool normalized)
    {
        return value.ValueKind switch { JsonValueKind.Object => "{" + string.Join(',', value.EnumerateObject().Select(p => Quote(p.Name) + ":" + (normalized && p.Name == "value" && value.TryGetProperty("kind", out var kind) && kind.GetString() == "keyword" ? Quote(p.Value.GetString()!.Replace("İ", "i\u0307").ToLowerInvariant()) : Semantic(p.Value, normalized)))) + "}", JsonValueKind.Array => "[" + string.Join(',', value.EnumerateArray().Select(v => Semantic(v, normalized))) + "]", JsonValueKind.String => Quote(value.GetString()!), JsonValueKind.Number => Number(value.GetDouble()), JsonValueKind.True => "true", JsonValueKind.False => "false", JsonValueKind.Null => "null", _ => throw new JsonException() };
    }
    private static string Number(double number)
    {
        if (!double.IsFinite(number)) throw new JsonException();
        if (number == 0) return "0";
        var negative = number < 0;
        var absolute = Math.Abs(number);
        var repr = absolute.ToString("R", CultureInfo.InvariantCulture).ToLowerInvariant();
        var parts = repr.Split('e');
        var mantissa = parts[0];
        var dot = mantissa.IndexOf('.');
        var position = (dot < 0 ? mantissa.Length : dot) + (parts.Length == 2 ? int.Parse(parts[1], CultureInfo.InvariantCulture) : 0);
        var digits = mantissa.Replace(".", "");
        var trimmed = digits.TrimStart('0');
        position -= digits.Length - trimmed.Length;
        digits = trimmed.TrimEnd('0');
        string text;
        if (absolute >= 1e-6 && absolute < 1e21) text = position <= 0 ? "0." + new string('0', -position) + digits : position >= digits.Length ? digits + new string('0', position - digits.Length) : digits[..position] + "." + digits[position..];
        else
        {
            text = digits[..1] + (digits.Length > 1 ? "." + digits[1..] : "");
            var exponent = position - 1;
            text += "e" + (exponent >= 0 ? "+" : "-") + Math.Abs(exponent).ToString(CultureInfo.InvariantCulture);
        }
        return (negative ? "-" : "") + text;
    }
}
