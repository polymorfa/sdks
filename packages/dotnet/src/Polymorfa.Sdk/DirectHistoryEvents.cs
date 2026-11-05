using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Polymorfa.Sdk;

/// <summary>A projected notification. Parsing does not download or store history.</summary>
public abstract record DirectHistorySyncPayload(
    [property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds,
    string SyncType, double FileLength, double? ChunkOrder = null, int? Progress = null,
    string? OldestMessageAt = null, string? PeerDataRequestSessionId = null,
    [property: JsonPropertyName("original_whatsapp_ids")] WhatsAppMessageIds? OriginalWhatsAppIds = null,
    [property: JsonPropertyName("whatsapp_id")] string? WhatsAppId = null,
    [property: JsonPropertyName("original_whatsapp_id")] string? OriginalWhatsAppId = null)
{
    public string Delivery => "descriptor";
}
public sealed record DirectHistoryMedia(string DirectPath, string MediaKey, string FileSha256, string FileEncSha256, string? EncHandle = null)
{
    public string Type => "md-msg-hist";
    public override string ToString() => "DirectHistoryMedia(redacted)";
}
public sealed record DirectHistoryInline(string Data)
{
    public string Encoding => "zlib-base64-protobuf";
    public override string ToString() => "DirectHistoryInline(redacted)";
}
public sealed record DirectHistorySyncMediaPayload(WhatsAppMessageIds WhatsAppIds, string SyncType, double FileLength, DirectHistoryMedia Media, double? ChunkOrder = null, int? Progress = null, string? OldestMessageAt = null, string? PeerDataRequestSessionId = null, WhatsAppMessageIds? OriginalWhatsAppIds = null, string? WhatsAppId = null, string? OriginalWhatsAppId = null) : DirectHistorySyncPayload(WhatsAppIds, SyncType, FileLength, ChunkOrder, Progress, OldestMessageAt, PeerDataRequestSessionId, OriginalWhatsAppIds, WhatsAppId, OriginalWhatsAppId)
{
    public override string ToString() => "DirectHistorySyncMediaPayload(redacted)";
}
public sealed record DirectHistorySyncInlinePayload(WhatsAppMessageIds WhatsAppIds, string SyncType, double FileLength, DirectHistoryInline Inline, double? ChunkOrder = null, int? Progress = null, string? OldestMessageAt = null, string? PeerDataRequestSessionId = null, WhatsAppMessageIds? OriginalWhatsAppIds = null, string? WhatsAppId = null, string? OriginalWhatsAppId = null) : DirectHistorySyncPayload(WhatsAppIds, SyncType, FileLength, ChunkOrder, Progress, OldestMessageAt, PeerDataRequestSessionId, OriginalWhatsAppIds, WhatsAppId, OriginalWhatsAppId)
{
    public override string ToString() => "DirectHistorySyncInlinePayload(redacted)";
}
internal static class DirectHistoryEvents
{
    internal static WebhookEvent Parse(WebhookEnvelope envelope)
    {
        try
        {
            var p = envelope.Payload;
            Fields(p, ["delivery", "whatsapp_ids", "whatsapp_id", "original_whatsapp_ids", "original_whatsapp_id", "syncType", "chunkOrder", "progress", "fileLength", "oldestMessageAt", "peerDataRequestSessionId", "media", "inline"]);
            if (String(p.GetProperty("delivery")) != "descriptor" || p.TryGetProperty("media", out _) == p.TryGetProperty("inline", out _)) throw new JsonException();
            var ids = Ids(p.GetProperty("whatsapp_ids"));
            var original = p.TryGetProperty("original_whatsapp_ids", out var o) ? Ids(o) : null;
            var sync = String(p.GetProperty("syncType"));
            var length = Number(p.GetProperty("fileLength"));
            var order = p.TryGetProperty("chunkOrder", out var c) ? Number(c) : (double?)null;
            var progress = p.TryGetProperty("progress", out var progressJson) ? Number(progressJson) : (double?)null;
            if (progress > 100) throw new JsonException();
            var oldest = OptionalString(p, "oldestMessageAt");
            if (oldest is not null && !IsoDateTime(oldest)) throw new JsonException();
            var peer = OptionalString(p, "peerDataRequestSessionId", 0);
            var alias = OptionalString(p, "whatsapp_id", 1, 512);
            var originalAlias = OptionalString(p, "original_whatsapp_id", 1, 512);
            if (p.TryGetProperty("media", out var media))
            {
                Fields(media, ["type", "directPath", "mediaKey", "fileSha256", "fileEncSha256", "encHandle"]);
                if (String(media.GetProperty("type")) != "md-msg-hist") throw new JsonException();
                var payload = new DirectHistorySyncMediaPayload(ids, sync, length, new(String(media.GetProperty("directPath")), String(media.GetProperty("mediaKey")), String(media.GetProperty("fileSha256")), String(media.GetProperty("fileEncSha256")), OptionalString(media, "encHandle", 0)), order, (int?)progress, oldest, peer, original, alias, originalAlias);
                return new TypedWebhookEvent<DirectHistorySyncMediaPayload>(envelope, payload);
            }
            var inline = p.GetProperty("inline"); Fields(inline, ["encoding", "data"]);
            if (String(inline.GetProperty("encoding")) != "zlib-base64-protobuf") throw new JsonException();
            return new TypedWebhookEvent<DirectHistorySyncInlinePayload>(envelope, new(ids, sync, length, new(String(inline.GetProperty("data"))), order, (int?)progress, oldest, peer, original, alias, originalAlias));
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException or FormatException or OverflowException)
        {
            throw new PolymorfaValidationException("Invalid descriptor history notification.", "invalid_webhook_event");
        }
    }
    private static bool IsoDateTime(string value)
    {
        // f97 uses Zod 3.25.76's default datetime predicate: UTC, optional
        // seconds/fraction and a four-digit Gregorian year, including year zero.
        var match = Regex.Match(value, "\\A([0-9]{4})-(0[1-9]|1[0-2])-([0-9]{2})T(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\\.[0-9]+)?)?Z\\z", RegexOptions.CultureInvariant);
        if (!match.Success) return false;
        var year = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
        var month = int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
        var day = int.Parse(match.Groups[3].Value, CultureInfo.InvariantCulture);
        int[] days = [31, year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return day >= 1 && day <= days[month - 1];
    }
    private static void Fields(JsonElement value, string[] allowed)
    {
        if (value.ValueKind != JsonValueKind.Object || value.EnumerateObject().Any(p => !allowed.Contains(p.Name)) || value.EnumerateObject().GroupBy(p => p.Name).Any(g => g.Count() > 1)) throw new JsonException();
    }
    private static string String(JsonElement value, int min = 1, int max = int.MaxValue)
    {
        if (value.ValueKind != JsonValueKind.String || value.GetString() is not { } text || text.Length < min || text.Length > max) throw new JsonException();
        return text;
    }
    private static string? OptionalString(JsonElement value, string name, int min = 1, int max = int.MaxValue) => value.TryGetProperty(name, out var p) ? String(p, min, max) : null;
    private static double Number(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetDouble(out var number) || !double.IsFinite(number) || number < 0 || Math.Truncate(number) != number) throw new JsonException();
        return number;
    }
    private static WhatsAppMessageIds Ids(JsonElement value)
    {
        Fields(value, ["linked_devices", "official_api"]);
        var linked = OptionalString(value, "linked_devices", 1, 512); var cloud = OptionalString(value, "official_api", 1, 512);
        if (linked is null && cloud is null) throw new JsonException();
        return new(linked, cloud);
    }
}
