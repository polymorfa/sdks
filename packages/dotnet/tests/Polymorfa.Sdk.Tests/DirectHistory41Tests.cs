using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Polymorfa.Sdk;
using static CampaignExistingTests;

internal static class DirectHistory41Tests
{
    internal const string Media = """{"delivery":"descriptor","whatsapp_ids":{"linked_devices":"wa:1"},"original_whatsapp_ids":{"official_api":"original"},"whatsapp_id":"wa:1","original_whatsapp_id":"original","syncType":"future_kind","chunkOrder":4294967296,"progress":0,"fileLength":1e25,"oldestMessageAt":"2026-10-14T12:34:56.123Z","peerDataRequestSessionId":"peer","media":{"type":"md-msg-hist","directPath":"/history.enc","mediaKey":"synthetic-private-key","fileSha256":"hash","fileEncSha256":"encrypted-hash","encHandle":""}}""";
    internal const string Inline = """{"delivery":"descriptor","whatsapp_ids":{"linked_devices":"wa:2"},"syncType":"ON_DEMAND","chunkOrder":0,"fileLength":0,"inline":{"encoding":"zlib-base64-protobuf","data":"eA=="}}""";
    internal static WebhookEvent Parse(string payload)
    {
        var body = Encoding.UTF8.GetBytes("{\"id\":\"event-id-not-wa-id\",\"session\":\"s\",\"timestamp\":\"2026-10-14T00:00:00Z\",\"event\":\"history.sync\",\"payload\":" + payload + "}");
        var signature = Convert.ToHexString(HMACSHA256.HashData("test-secret"u8.ToArray(), body)).ToLowerInvariant();
        return Webhooks.ConstructEvent(body, signature, "test-secret");
    }
    internal static void Run()
    {
        foreach (var date in new[] { "0000-02-29T00:00:00Z", "2026-10-14T00:00:00.12345678901234567890Z", "2026-10-14T00:00Z" }) Check(Parse(Change(Media, "oldestMessageAt", JsonValue.Create(date))) is TypedWebhookEvent<DirectHistorySyncMediaPayload>, "Producer ISO datetime");
        var mediaEvent = Parse(Media);
        Check(mediaEvent is TypedWebhookEvent<DirectHistorySyncMediaPayload>, "Named media event");
        var media = ((TypedWebhookEvent<DirectHistorySyncMediaPayload>)mediaEvent).Payload;
        Check(media.Delivery == "descriptor" && media.Media.Type == "md-msg-hist" && media.WhatsAppIds.LinkedDevices == "wa:1" && media.OriginalWhatsAppIds!.OfficialApi == "original" && media.ChunkOrder == 4294967296 && media.FileLength == 1e25 && media.OldestMessageAt == "2026-10-14T12:34:56.123Z", "Projected media fields");
        Check(!media.ToString().Contains("synthetic-private-key") && !media.Media.ToString().Contains("synthetic-private-key") && !mediaEvent.ToString().Contains("synthetic-private-key") && !mediaEvent.Envelope.ToString().Contains("synthetic-private-key"), "Descriptor diagnostics redacted");
        var inline = ((TypedWebhookEvent<DirectHistorySyncInlinePayload>)Parse(Inline)).Payload;
        Check(inline.FileLength == 0 && inline.ChunkOrder == 0 && inline.Inline.Encoding == "zlib-base64-protobuf", "Inline zero fields");
        Check(Parse("{\"kind\":\"history\",\"value\":{}}") is TypedWebhookEvent<CloudHistorySyncPayload>, "Cloud branch preserved");
        Check(Parse("{\"mode\":\"deliver\",\"syncType\":\"FULL\",\"fileLength\":0,\"conversationCount\":0,\"messageCount\":0,\"pushNameCount\":0,\"statusMessageCount\":0,\"whatsapp_ids\":{\"linked_devices\":\"wa\"},\"messages\":[],\"whatsapp\":{\"encoding\":\"gzip-base64-protobuf\",\"data\":\"\"}}") is TypedWebhookEvent<LinkedHistorySyncPayload>, "Archive branch preserved");
        var invalid = new List<string> { Change(Inline, "delivery", JsonValue.Create("archive")), Change(Inline, "delivery", null), Change(Inline, "media", JsonNode.Parse("{\"type\":\"md-msg-hist\"}")), Change(Inline, "inline", null, true), Change(Inline, "inline", null), Change(Media, "media", null), Change(Media, "whatsapp_ids", new JsonObject()), Change(Media, "whatsapp_ids", JsonNode.Parse("{\"linked_devices\":null}")), Change(Media, "whatsapp_ids", JsonNode.Parse("{\"linked_devices\":\"\"}")), Change(Media, "whatsapp_id", JsonValue.Create(new string('x', 513))), Change(Media, "whatsapp_id", null), Change(Media, "oldestMessageAt", JsonValue.Create("2026-02-30T12:34:56Z")), Change(Media, "oldestMessageAt", JsonValue.Create("2026-10-14T12:34:56+00:00")), Change(Media, "chunkOrder", JsonValue.Create(-1)), Change(Media, "chunkOrder", JsonValue.Create(0.5)), Change(Media, "fileLength", JsonValue.Create(0.5)), Change(Media, "progress", JsonValue.Create(101)), Change(Media, "messageId", JsonValue.Create("raw-runner-field")) };
        foreach (var field in new[] { "type", "directPath", "mediaKey", "fileSha256", "fileEncSha256" })
        {
            var p = JsonNode.Parse(Media)!.AsObject(); p["media"]!.AsObject().Remove(field); invalid.Add(p.ToJsonString());
        }
        foreach (var payload in invalid)
        {
            try { Parse(payload); throw new Exception("Invalid descriptor event accepted"); } catch (PolymorfaValidationException e) { Check(e.Code == "invalid_webhook_event", "Safe descriptor refusal"); }
        }
        Console.WriteLine("PASS descriptor41 verified HMAC, named public branches, XOR/presence/numbers/identity/time/redaction; no download or storage claim");
    }
}
