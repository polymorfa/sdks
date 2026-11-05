using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class CampaignWebhookMetadataTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static void Run()
    {
        var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "contracts/fixtures/campaign-webhook-metadata.json"))) dir = dir.Parent;
        if (dir is null) throw new Exception("Missing campaign fixture");
        using var fixture = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(dir.FullName, "contracts/fixtures/campaign-webhook-metadata.json")));
        var secret = fixture.RootElement.GetProperty("secret").GetString()!;
        var events = fixture.RootElement.GetProperty("events").EnumerateArray().ToArray();
        VerifiedWebhookDelivery Signed(byte[] raw) => Webhooks.ConstructDelivery(raw, Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), raw)), secret);
        void Check(bool value) { if (!value) throw new Exception("Campaign metadata regression"); }
        void Verify(WebhookEvent actual, int i)
        {
            Check(actual.Envelope.Id == events[i].GetProperty("id").GetString());
            Check(actual.Envelope.Payload.GetRawText() == events[i].GetProperty("payload").GetRawText());
            if (actual is TypedWebhookEvent<CampaignPausedPayload> pause)
            {
                Check(pause.Payload.PausedAt == 1757161200);
                Check(i == 0 ? pause.Payload.Reason == "Automatic safety pause" && pause.Payload.Code == "future_automatic_pause" : pause.Payload.Reason is null && pause.Payload.Code is null);
                var (_, _, _, seconds) = pause.Payload; Check(seconds == 1757161200); // Existing Deconstruct arity.
                if (i == 1) Check(!JsonSerializer.SerializeToElement(pause.Payload, Json).TryGetProperty("code", out _) && !JsonSerializer.SerializeToElement(pause.Payload, Json).TryGetProperty("reason", out _));
            }
            else if (actual is TypedWebhookEvent<CampaignRecipientSkippedPayload> skip)
            {
                Check(skip.Payload.SkippedAt == 1757161200000);
                Check(i switch { 2 => skip.Payload.MessageIndex == 0 && skip.Payload.FollowUpId is null, 3 => skip.Payload.MessageIndex == 1 && skip.Payload.FollowUpId == "0198a2cb-0000-7000-8000-0000000000f1", _ => skip.Payload.MessageIndex is null && skip.Payload.FollowUpId is null && skip.Payload.Reason == "future_skip_reason" });
                var (_, _, _, _, milliseconds) = skip.Payload; Check(milliseconds == 1757161200000);
                if (i == 4) Check(!JsonSerializer.SerializeToElement(skip.Payload, Json).TryGetProperty("messageIndex", out _) && !JsonSerializer.SerializeToElement(skip.Payload, Json).TryGetProperty("followUpId", out _));
            }
            else throw new Exception("Wrong campaign public typed decoder");
        }
        for (var i = 0; i < events.Length; i++) Verify(((SingleWebhookDelivery)Signed(Encoding.UTF8.GetBytes(events[i].GetRawText()))).Event, i);
        var batch = new { @object = "event_batch", version = 1, id = fixture.RootElement.GetProperty("batchId").GetString(), events };
        // Preserve fixture whitespace for exact raw-envelope assertions above.
        var rawBatch = Encoding.UTF8.GetBytes("{\"object\":\"event_batch\",\"version\":1,\"id\":\"" + batch.id + "\",\"events\":[" + string.Join(",", events.Select(e => e.GetRawText())) + "]}");
        var delivery = (WebhookEventBatch)Signed(rawBatch); Check(delivery.Events.Count == 5);
        for (var i = 0; i < events.Length; i++) Verify(delivery.Events[i], i);
        foreach (var raw in new[] { events[0].GetRawText().Replace("\"future_automatic_pause\"", "[]"), events[2].GetRawText().Replace("\"messageIndex\": 0", "\"messageIndex\": \"zero\""), events[3].GetRawText().Replace("\"0198a2cb-0000-7000-8000-0000000000f1\"", "42") })
        {
            try { Signed(Encoding.UTF8.GetBytes(raw)); throw new Exception("Malformed typed metadata accepted"); } catch (PolymorfaValidationException) { }
        }
        try { Webhooks.ConstructDelivery("not JSON"u8, "bad", secret); throw new Exception("Signature order changed"); } catch (WebhookSignatureException) { }
        var signature = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), rawBatch));
        try { Webhooks.ConstructDelivery([.. rawBatch, 32], signature, secret); throw new Exception("Tamper accepted"); } catch (WebhookSignatureException) { }
        Console.WriteLine("PASS campaign single/batch typed metadata, raw preservation, units, omission, malformed and tamper");
    }
}
