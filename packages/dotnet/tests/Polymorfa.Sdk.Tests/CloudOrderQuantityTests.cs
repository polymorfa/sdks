using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class CloudOrderQuantityTests
{
    private const string Secret = "synthetic-quantity-regression";
    private const string Key = "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k";
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private sealed class Handler(string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            Check(request.Method == HttpMethod.Get && request.RequestUri!.AbsolutePath == "/messaging/n/chats/123/messages/m", "history public route");
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    private static string Order(string quantity) => "{\"catalogId\":\"123\",\"items\":[{\"productRetailerId\":\"sku\",\"quantity\":" + quantity + ",\"itemPrice\":0.125,\"currency\":\"USD\"}]}";
    private static string Event(string id, string quantity) => "{\"id\":\"" + id + "\",\"session\":\"n\",\"timestamp\":\"2026-10-22T00:00:00Z\",\"event\":\"message.received\",\"payload\":{\"id\":\"m\",\"whatsapp_ids\":{\"official_api\":\"wamid.synthetic\"},\"conversation\":{\"id\":\"123\"},\"timestamp\":\"2026-10-22T00:00:00Z\",\"type\":\"order\",\"order\":" + Order(quantity) + "}}";
    private static byte[] Batch(string quantity) => Encoding.UTF8.GetBytes("{\"object\":\"event_batch\",\"version\":1,\"id\":\"00000000-0000-4000-8000-000000000001\",\"events\":[" + Event("before", "1") + "," + Event("wide", quantity) + "," + Event("after", "2") + "]}");
    private static string Sign(byte[] body) => Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(Secret), body));
    private static void Quantity(CloudOrder order, long expected)
    {
        Check(order.Items[0].Quantity == expected, "exact quantity");
        Check(order.Items[0].ItemPrice == 0.125 && typeof(CloudOrderItem).GetProperty("ItemPrice")!.PropertyType == typeof(double), "fractional price unchanged");
        using var roundTrip = JsonDocument.Parse(JsonSerializer.Serialize(order, Json));
        Check(roundTrip.RootElement.GetProperty("items")[0].GetProperty("quantity").GetInt64() == expected, "exact serialized quantity");
    }
    private static CloudOrder EventOrder(WebhookEvent item) => ((TypedWebhookEvent<CloudMessagePayload>)item).Payload.Order!;
    private static void Throws<T>(Action action) where T : Exception
    {
        try { action(); } catch (T) { return; }
        throw new Exception("Expected " + typeof(T).Name);
    }
    public static async Task RunAsync()
    {
        var failures = new List<Exception>();
        async Task Case(string name, Func<Task> action)
        {
            try { await action(); Console.WriteLine("PASS " + name); }
            catch (Exception error) { failures.Add(error); Console.WriteLine("FAIL " + name + ": " + error.Message); }
        }
        foreach (var value in new long[] { 2147483647L, 2147483648L, 9007199254740991L })
        {
            var number = value.ToString(System.Globalization.CultureInfo.InvariantCulture);
            await Case("single " + number, () => {
                var raw = Encoding.UTF8.GetBytes(Event("single", number));
                var single = (SingleWebhookDelivery)Webhooks.ConstructDelivery(raw, Sign(raw), Secret);
                Quantity(EventOrder(single.Event), value);
                return Task.CompletedTask;
            });
            await Case("ordered three-member batch " + number, () => {
                var raw = Batch(number);
                var batch = (WebhookEventBatch)Webhooks.ConstructDelivery(raw, Sign(raw), Secret);
                Check(batch.Events.Select(x => x.Envelope.Id).SequenceEqual(new[] { "before", "wide", "after" }), "member order preserved");
                Quantity(EventOrder(batch.Events[0]), 1);
                Quantity(EventOrder(batch.Events[1]), value);
                Quantity(EventOrder(batch.Events[2]), 2);
                return Task.CompletedTask;
            });
            await Case("public history decode " + number, async () => {
                var message = "{\"id\":\"m\",\"whatsapp_ids\":{\"official_api\":\"wamid.synthetic\"},\"direction\":\"inbound\",\"type\":\"order\",\"timestamp\":\"2026-10-22T00:00:00Z\",\"conversation\":{\"id\":\"123\"},\"fromMe\":false,\"order\":" + Order(number) + "}";
                using var handler = new Handler("{\"success\":true,\"data\":" + message + "}");
                using var client = new MessagingClient(Credential.OrganizationApiKey(Key), new() { TransportHandler = handler });
                Quantity((await client.Chats.RetrieveMessageAsync("n", "123", "m")).Data.Data.Order!, value);
            });
        }
        await Case("HMAC before JSON and whole-body tamper", () => {
            foreach (var raw in new[] { Encoding.UTF8.GetBytes("{"), Batch("1.5"), Batch("9007199254740991") })
                Throws<WebhookSignatureException>(() => Webhooks.ConstructDelivery(raw, new string('0', 64), Secret));
            var valid = Batch("9007199254740991");
            Throws<WebhookSignatureException>(() => Webhooks.ConstructDelivery([.. valid, 32], Sign(valid), Secret));
            return Task.CompletedTask;
        });
        await Case("malformed numeric quantities remain rejected", () => {
            foreach (var invalid in new[] { "1.5", "1e100", "9223372036854775808", "true", "\"many\"" })
            {
                var single = Encoding.UTF8.GetBytes(Event("invalid", invalid));
                Throws<PolymorfaValidationException>(() => Webhooks.ConstructDelivery(single, Sign(single), Secret));
                var batch = Batch(invalid);
                Throws<PolymorfaValidationException>(() => Webhooks.ConstructDelivery(batch, Sign(batch), Secret));
            }
            return Task.CompletedTask;
        });
        await Case("catalog prices remain strings", () => {
            Check(JsonSerializer.Deserialize<CloudCatalogCacheProduct>("{\"id\":\"p\",\"price\":\"0.10\"}", Json)!.Price == "0.10", "catalog price precision");
            return Task.CompletedTask;
        });
        Check(failures.Count == 0, failures.Count + " quantity regression cases failed");
    }
}
