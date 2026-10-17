using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Polymorfa.Sdk;

internal static class CampaignExistingValidation
{
    private static void Invalid(string field) => throw new PolymorfaConfigurationException("Invalid campaign request field: " + field + ".");
    private static bool Has(JsonElement value, string name) => value.TryGetProperty(name, out _);
    private static bool Match(string value, string expression) => Regex.IsMatch(value, "\\A(?:" + expression + ")\\z", RegexOptions.CultureInvariant);
    private static string Text(JsonElement value, string field, int min = 1, int max = int.MaxValue) => CampaignContractValidation.String(value, field, min, max);
    private static void Fields(JsonElement value, string[] allowed, string[] required) => CampaignContractValidation.Fields(value, allowed, required);
    private static void One(JsonElement value, string field, params string[] allowed) { if (value.ValueKind != JsonValueKind.String || !allowed.Contains(value.GetString())) Invalid(field); }
    private static long Integer(JsonElement value, string field, long min, long max) => CampaignContractValidation.Integer(value, field, min, max);
    // ECMAScript whitespace and ASCII literal case are intentional. .NET's
    // whitespace and IgnoreCase sets also include characters the producer accepts.
    internal static bool EcmaSpace(char c) => c is '\u0009' or '\u000a' or '\u000b' or '\u000c' or '\u000d' or '\u0020' or '\u00a0' or '\u1680' or >= '\u2000' and <= '\u200a' or '\u2028' or '\u2029' or '\u202f' or '\u205f' or '\u3000' or '\ufeff';
    private static bool Placeholder(string text)
    {
        for (var i = 0; i + 1 < text.Length; i++)
        {
            if (text[i] != '{' || text[i + 1] != '{') continue;
            var j = i + 2; while (j < text.Length && EcmaSpace(text[j])) j++;
            if (j + 5 <= text.Length && (text[j] is 'l' or 'L') && (text[j + 1] is 'i' or 'I') && (text[j + 2] is 'n' or 'N') && (text[j + 3] is 'k' or 'K') && text[j + 4] == ':') return true;
        }
        return false;
    }
    private static IDictionary<string, JsonElement>? Extensions(IDictionary<string, JsonElement>? input, string[] known)
    {
        if (input is null) return null;
        var copy = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var p in input)
        {
            CampaignContractValidation.Unicode(p.Key);
            if (known.Contains(p.Key)) Invalid("extensions");
            copy.Add(p.Key, p.Value.Clone());
        }
        return copy;
    }
    private static IReadOnlyList<PlatformCampaignMessage> Messages(IReadOnlyList<PlatformCampaignMessage> input) => input.Select(message => message with
    {
        AdditionalFields = Extensions(message.AdditionalFields, ["version", "source", "media", "buttons", "footer", "delayAfterSec"]),
        Media = message.Media is { } media ? media with { AdditionalFields = Extensions(media.AdditionalFields, ["kind", "url", "filename", "caption"]) } : null,
        Buttons = message.Buttons?.Select(button => button with { AdditionalFields = Extensions(button.AdditionalFields, ["kind", "label", "url", "phone"]) }).ToArray()
    }).ToArray();
    private static void Unique(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            if (value.EnumerateObject().GroupBy(p => p.Name, StringComparer.Ordinal).Any(g => g.Count() != 1)) Invalid("extensions");
            foreach (var p in value.EnumerateObject()) { CampaignContractValidation.Unicode(p.Name); Unique(p.Value); }
        }
        else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) Unique(item);
        else if (value.ValueKind == JsonValueKind.String) CampaignContractValidation.Unicode(value.GetString());
    }
    internal static JsonElement Body(object input, bool platform = false, bool patch = false)
    {
        if (input is CreatePlatformCampaignRequest { MessagesArray: { } messages } create) input = create with { MessagesArray = Messages(messages) };
        if (input is UpdatePlatformCampaignRequest { MessagesArray: { } updateMessages } updateBody) input = updateBody with { MessagesArray = Messages(updateMessages) };
        if (platform && patch && input is UpdatePlatformCampaignRequest update && update.AdditionalFields is { } extra)
        {
            var known = new[] { "projectId", "id", "name", "templateId", "recipientListId", "senderConfig", "scheduledAt", "sendWindow", "messageVariations", "variants", "variantStrategy", "followUp", "variableMapping", "trackedLinks", "messagesArray" };
            input = update with { AdditionalFields = Extensions(extra, known) };
        }
        var body = Capture(input);
        try { Unique(body); Validate(body, platform, patch); }
        catch (Exception error) when (error is InvalidOperationException or KeyNotFoundException or JsonException) { Invalid("body"); }
        return body;
    }
    internal static void Validate(JsonElement body, bool platform, bool patch)
    {
        if (body.ValueKind != JsonValueKind.Object) Invalid("body");
        if (body.EnumerateObject().GroupBy(p => p.Name, StringComparer.Ordinal).Any(g => g.Count() != 1)) Invalid("extensions");
        if (platform && patch && (Has(body, "projectId") || Has(body, "id"))) Invalid("projectId/id");
        if (!platform)
        {
            var allowed = new[] { "name", "templateId", "recipientListId", "senderConfig", "scheduledAt", "sendWindow", "recipients", "messageVariations", "variants", "variantStrategy", "followUp", "variableMapping", "trackedLinks" };
            Fields(body, allowed, patch ? [] : ["name"]);
            if (patch && !body.EnumerateObject().Any()) Invalid("body");
        }
        if (platform && !patch) CampaignContractValidation.Uuid(Text(body.GetProperty("projectId"), "projectId"), "projectId");
        if (Has(body, "variableMapping") && !(patch && body.GetProperty("variableMapping").ValueKind == JsonValueKind.Null)) Mapping(body.GetProperty("variableMapping"));
        if (Has(body, "trackedLinks")) Links(body.GetProperty("trackedLinks"));
        if (patch && Has(body, "templateId") && body.GetProperty("templateId").ValueKind != JsonValueKind.Null) CampaignContractValidation.Uuid(Text(body.GetProperty("templateId"), "templateId"), "templateId");
        if (Has(body, "followUp")) FollowUp(body.GetProperty("followUp"));
        if (Has(body, "messagesArray")) Composed(body.GetProperty("messagesArray"));
        foreach (var name in new[] { "variants", "messageVariations" })
            if (Has(body, name) && !(body.GetProperty(name).ValueKind == JsonValueKind.Null && (!platform || patch))) Alternatives(body.GetProperty(name), name == "variants", platform);
        if (Has(body, "variantStrategy") && !(body.GetProperty("variantStrategy").ValueKind == JsonValueKind.Null && (!platform || patch)))
        {
            var v = body.GetProperty("variantStrategy");
            Fields(v, ["winnerCriterion", "holdoutPercent", "testSlicePercent", "autoPromote", "testWindowMinutes"], ["winnerCriterion", "holdoutPercent", "autoPromote", "testWindowMinutes"]);
            One(v.GetProperty("winnerCriterion"), "winnerCriterion", "delivery", "read", "reply");
            Integer(v.GetProperty("holdoutPercent"), "holdoutPercent", 0, 30);
            if (Has(v, "testSlicePercent")) Integer(v.GetProperty("testSlicePercent"), "testSlicePercent", 5, 50);
            if (v.GetProperty("autoPromote").ValueKind != JsonValueKind.True) Invalid("autoPromote");
            Integer(v.GetProperty("testWindowMinutes"), "testWindowMinutes", 15, 1440);
        }
    }
    private static void Mapping(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Object || value.EnumerateObject().Count() > 50) Invalid("variableMapping");
        foreach (var p in value.EnumerateObject())
        {
            if (!Match(p.Name, "[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}")) Invalid("variableMapping.key");
            Fields(p.Value, ["source", "fallback"], []);
            if (Has(p.Value, "source") && !Match(Text(p.Value.GetProperty("source"), "source"), "[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}")) Invalid("source");
            if (Has(p.Value, "fallback") && CampaignContractValidation.Trim(Text(p.Value.GetProperty("fallback"), "fallback", 1, 1024)).Length == 0) Invalid("fallback");
        }
    }
    private static void Links(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Null) return;
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > 5) Invalid("trackedLinks");
        var keys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var entry in value.EnumerateArray())
        {
            Fields(entry, ["key", "url"], ["key", "url"]);
            var key = Text(entry.GetProperty("key"), "key", 1, 32);
            if (!Match(key, "[a-z0-9_]+") || !keys.Add(key)) Invalid("trackedLinks.key");
            Url(Text(entry.GetProperty("url"), "url", 1, 2048));
        }
    }
    private static void Url(string raw)
    {
        if (raw.Any(c => EcmaSpace(c) || c < 32 || c == 127)) Invalid("trackedLinks.url");
        // WHATWG special HTTPS URLs treat backslashes as slashes and accept an
        // omitted pair of authority slashes. Uri supplies IDNA and path escaping.
        if (!raw.StartsWith("https:", StringComparison.OrdinalIgnoreCase)) Invalid("trackedLinks.url");
        var special = raw[6..].TrimStart('/', '\\');
        var end = special.IndexOfAny(['/', '\\', '?', '#']);
        var authority = end < 0 ? special : special[..end];
        var remainder = end < 0 ? "" : special[end..];
        if (authority.LastIndexOf('@') is var at && at >= 0)
        {
            if (authority[..at] is not ("" or ":")) Invalid("trackedLinks.url");
            authority = authority[(at + 1)..];
        }
        if (authority.Contains('[') || authority.Contains(']')) Invalid("trackedLinks.url");
        var colon = authority.LastIndexOf(':');
        var rawHost = colon < 0 ? authority : authority[..colon];
        var port = "";
        if (colon >= 0 && authority[(colon + 1)..] is { Length: > 0 } rawPort)
        {
            if (!int.TryParse(rawPort, NumberStyles.None, CultureInfo.InvariantCulture, out var number) || number > 65535) Invalid("trackedLinks.url");
            if (number != 443) port = ":" + number.ToString(CultureInfo.InvariantCulture);
        }
        var decoded = Uri.UnescapeDataString(rawHost);
        if (decoded.Length == 0 || decoded.Any(c => c < 33 || c is '#' or '/' or ':' or '<' or '>' or '?' or '@' or '[' or '\\' or ']' or '^' or '|' or '%')) Invalid("trackedLinks.url");
        string ascii;
        try { ascii = string.Join('.', decoded.Split('.').Select(label => label.All(c => c < 128) ? label.ToLowerInvariant() : new IdnMapping().GetAscii(label).ToLowerInvariant())); }
        catch (ArgumentException) { Invalid("trackedLinks.url"); throw; }
        var host = ascii.EndsWith('.') ? ascii[..^1] : ascii;
        if (!host.Contains('.') || IPAddress.TryParse(host, out _) || Match(host, "[0-9.]+") || Match(host.Split('.')[^1], "[0-9]+") || new[] { ".local", ".internal", ".localhost" }.Any(host.EndsWith)) Invalid("trackedLinks.url");
        var queryAt = remainder.IndexOfAny(['?', '#']);
        remainder = queryAt < 0 ? remainder.Replace('\\', '/') : remainder[..queryAt].Replace('\\', '/') + remainder[queryAt..];
        // A placeholder host lets Uri escape and normalize the path while the
        // WHATWG host rules above retain accepted empty labels and percent hosts.
        if (!Uri.TryCreate("https://example.test" + remainder, UriKind.Absolute, out var uri)) Invalid("trackedLinks.url");
        var normalized = "https://" + ascii + port + uri!.AbsolutePath + uri.Query.Replace("'", "%27", StringComparison.Ordinal) + uri.Fragment;
        var length = 0;
        foreach (var rune in normalized.EnumerateRunes()) length += rune.IsAscii ? 1 : Encoding.UTF8.GetByteCount(rune.ToString()) * 3;
        if (length > 2048) Invalid("trackedLinks.url");
    }
    private static void FollowUp(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Null) return;
        Fields(value, ["message", "delaySeconds", "expirySeconds"], ["message"]);
        var delay = Has(value, "delaySeconds") ? Integer(value.GetProperty("delaySeconds"), "delaySeconds", 60, 604800) : 86400;
        var expiry = Has(value, "expirySeconds") ? Integer(value.GetProperty("expirySeconds"), "expirySeconds", 86400, 2592000) : 604800;
        if (expiry <= delay) Invalid("expirySeconds");
        var message = value.GetProperty("message");
        if (message.ValueKind != JsonValueKind.Object || !Has(message, "type")) Invalid("message");
        if (message.GetProperty("type").GetString() == "text")
        {
            Fields(message, ["type", "text"], ["type", "text"]);
            if (Placeholder(Text(message.GetProperty("text"), "text", 1, 16384))) Invalid("text");
        }
        else
        {
            Fields(message, ["type", "templateId"], ["type", "templateId"]);
            One(message.GetProperty("type"), "type", "template");
            CampaignContractValidation.Uuid(Text(message.GetProperty("templateId"), "templateId"), "templateId");
        }
    }
    private static void Alternatives(JsonElement value, bool variants, bool platform)
    {
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() < 2 || value.GetArrayLength() > (variants ? 4 : 5)) Invalid("variants");
        var keys = new HashSet<string>(); long total = 0;
        foreach (var item in value.EnumerateArray())
        {
            Fields(item, variants ? ["key", "label", "weight", "blueprint"] : ["key", "weight", "blueprint"], variants ? ["key", "label", "weight", "blueprint"] : ["key", "weight", "blueprint"]);
            var key = Text(item.GetProperty("key"), "key", 1, 16);
            if (!Match(key, "[a-z][a-z0-9_-]{0,15}") || !keys.Add(key)) Invalid("key");
            if (variants) { var label = Text(item.GetProperty("label"), "label"); var bound = platform ? label : CampaignContractValidation.Trim(label); if (bound.Length is < 1 or > 100) Invalid("label"); }
            total += Integer(item.GetProperty("weight"), "weight", 1, 99);
            var blueprint = item.GetProperty("blueprint");
            if (blueprint.GetProperty("version").ValueKind != JsonValueKind.Number || blueprint.GetProperty("version").GetDouble() != 2 || CampaignContractValidation.Trim(Text(blueprint.GetProperty("source"), "source", 1, 4096)).Length == 0) Invalid("blueprint");
        }
        if (total != 100) Invalid("weight");
    }
    private static void Composed(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > 10) Invalid("messagesArray");
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) Invalid("message");
            if (Has(item, "version") && (item.GetProperty("version").ValueKind != JsonValueKind.Number || item.GetProperty("version").GetDouble() != 2)) Invalid("version");
            foreach (var key in new[] { "source", "footer" }) if (Has(item, key)) Text(item.GetProperty(key), key, 0);
            if (Has(item, "delayAfterSec")) Integer(item.GetProperty("delayAfterSec"), "delayAfterSec", 0, 86400);
            if (Has(item, "media"))
            {
                var media = item.GetProperty("media");
                if (media.ValueKind != JsonValueKind.Object || !Has(media, "kind") || !Has(media, "url")) Invalid("media");
                One(media.GetProperty("kind"), "kind", "image", "video", "audio", "document"); Text(media.GetProperty("url"), "url", 0);
                foreach (var key in new[] { "filename", "caption" }) if (Has(media, key)) Text(media.GetProperty(key), key, 0);
            }
            if (Has(item, "buttons"))
            {
                var buttons = item.GetProperty("buttons"); if (buttons.ValueKind != JsonValueKind.Array) Invalid("buttons");
                foreach (var button in buttons.EnumerateArray())
                {
                    if (button.ValueKind != JsonValueKind.Object || !Has(button, "kind") || !Has(button, "label")) Invalid("button");
                    One(button.GetProperty("kind"), "kind", "reply", "link", "call"); Text(button.GetProperty("label"), "label", 0);
                    foreach (var key in new[] { "url", "phone" }) if (Has(button, key)) Text(button.GetProperty(key), key, 0);
                }
            }
        }
    }
    private static JsonElement Capture(object input)
    {
        try { return CampaignContractValidation.Capture(input); }
        catch (ArgumentException) { throw new PolymorfaConfigurationException("Invalid campaign request input."); }
    }
    internal static JsonElement Launch(object input, bool platform)
    {
        var body = Capture(input);
        Fields(body, platform ? ["projectId", "scheduledAt", "skipMissingVariables"] : ["scheduledAt", "skipMissingVariables"], platform ? ["projectId"] : []);
        if (platform) CampaignContractValidation.Uuid(Text(body.GetProperty("projectId"), "projectId"), "projectId");
        if (Has(body, "scheduledAt") && (body.GetProperty("scheduledAt").ValueKind != JsonValueKind.Number || !double.IsFinite(body.GetProperty("scheduledAt").GetDouble()))) Invalid("scheduledAt");
        if (Has(body, "skipMissingVariables") && body.GetProperty("skipMissingVariables").ValueKind is not (JsonValueKind.True or JsonValueKind.False)) Invalid("skipMissingVariables");
        return body;
    }
    internal static IReadOnlyList<KeyValuePair<string, string>> Recipients(object input, bool platform)
    {
        var body = Capture(input);
        Fields(body, platform ? ["projectId", "status", "reason", "cursor", "limit"] : ["status", "reason", "cursor", "limit"], platform ? ["projectId"] : []);
        if (platform) CampaignContractValidation.Uuid(Text(body.GetProperty("projectId"), "projectId"), "projectId");
        if (Has(body, "status")) One(body.GetProperty("status"), "status", "queued", "sending", "sent", "delivered", "read", "failed", "skipped");
        if (Has(body, "reason")) One(body.GetProperty("reason"), "reason", "opted_out", "cold_held", "campaign_cancelled", "invalid_recipient", "session_not_connected", "ack_timeout", "blocked_by_safety", "send_failed", "missing_variable", "other");
        if (Has(body, "cursor")) Text(body.GetProperty("cursor"), "cursor", 1, 256);
        if (Has(body, "limit")) Integer(body.GetProperty("limit"), "limit", 1, 100);
        return Resource.Query(body);
    }
}
