using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Nodes;
using Polymorfa.Sdk;

internal static class NewsletterObservationTests
{
    public static void Run()
    {
        var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
        var path = Path.Combine(AppContext.BaseDirectory, "newsletter-fixtures");
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(path, "delivery.json")));
        var root = fixture.RootElement;
        var secret = root.GetProperty("secret").GetString()!;
        var events = root.GetProperty("events").EnumerateArray().ToArray();
        VerifiedWebhookDelivery Signed(byte[] bytes) => Webhooks.ConstructDelivery(bytes, Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), bytes)), secret);
        void Check(WebhookEvent e, JsonElement expected)
        {
            var typed = e as TypedWebhookEvent<NewsletterUpdatePayload> ?? throw new Exception("newsletter typed event lost");
            var (_, _, _) = typed.Payload; // Preserve the existing public Deconstruct arity.
            var encoded = JsonSerializer.SerializeToElement(typed.Payload, json);
            if (!JsonNode.DeepEquals(JsonNode.Parse(encoded.GetRawText()), JsonNode.Parse(expected.GetProperty("payload").GetRawText()))) throw new Exception("newsletter omission/zero/map roundtrip");
            if (typed.Payload.Action == "live_update")
            {
                var rows = typed.Payload.Messages!;
                if (rows[0].Forwards != 0 || rows[0].ReactionCounts?.Count != 0 || rows[1].Message is not null || rows[1].Forwards is not null) throw new Exception("newsletter metadata lost");
            }
        }
        foreach (var expected in events)
        {
            var e = ((SingleWebhookDelivery)Signed(Encoding.UTF8.GetBytes(expected.GetRawText()))).Event;
            Check(e, expected);
            var encoded = Webhooks.CreateFixture(e, secret);
            Check(((SingleWebhookDelivery)Webhooks.ConstructDelivery(encoded.Body, encoded.Signature, secret)).Event, expected);
        }
        var batchBytes = JsonSerializer.SerializeToUtf8Bytes(new { @object = "event_batch", version = 1, id = root.GetProperty("batchId").GetString(), events });
        var batch = (WebhookEventBatch)Signed(batchBytes);
        for (var i = 0; i < events.Length; i++) Check(batch.Events[i], events[i]);
        var channel = JsonSerializer.Deserialize<ChannelMessage>(File.ReadAllText(Path.Combine(path, "channel-message.json")), json)!;
        if (channel.Forwards != 0) throw new Exception("channel forward zero lost");
        Console.WriteLine("PASS newsletter observations, milestones, omission/zero/map and batch roundtrips");
    }
}
