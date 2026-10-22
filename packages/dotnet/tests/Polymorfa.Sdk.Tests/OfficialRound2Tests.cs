using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class OfficialRound2Tests
{
    private const string Key = "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k";
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
    { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) => send(request, token); }
    private static HttpResponseMessage Response(string body, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    private static void Check(bool value) { if (!value) throw new Exception("Official round2 assertion failed"); }
    private static void Invalid(Action call) { try { call(); throw new Exception("Expected validation"); } catch (PolymorfaValidationException) { } }
    public static async Task RunAsync()
    {
        var paths = new List<string>(); byte[] jpeg = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "official-group-picture.jpg"));
        using var handler = new Handler(async (r, token) =>
        {
            Check(r.Headers.Authorization?.Parameter == Key); paths.Add(r.Method + " " + r.RequestUri!.PathAndQuery);
            if (r.Method == HttpMethod.Put)
            {
                Check(r.Content is MultipartFormDataContent); var bytes = await r.Content!.ReadAsByteArrayAsync(token);
                Check(Encoding.Latin1.GetString(bytes).Contains(Encoding.Latin1.GetString(jpeg)));
                Check(Encoding.ASCII.GetString(bytes).Contains("Content-Type: image/jpeg"));
                return Response("""{"success":true,"data":{"accepted":true}}""");
            }
            return Response("""{"success":true,"data":{"catalogId":"123","syncedAt":null,"stale":true,"productCount":1,"lastAttempt":{"startedAt":"now","finishedAt":null,"outcome":"future"},"catalogs":[],"catalog":{"catalogId":"123"},"products":[{"id":"p","price":"0.10"}],"nextCursor":"next_-","wabaId":"w","onboarding":{"status":"unknown","metaStatus":null},"terms":{"status":"unknown","metaStatus":null,"date":null},"cloudApiMarketingDisabled":false}}""");
        });
        using (var c = new MessagingClient(Credential.OrganizationApiKey(Key), new() { TransportHandler = handler }))
        {
            await c.Catalogs.ListAsync("n /x"); var s = await c.Catalogs.RetrieveAsync("n /x", "123"); Check(s.Data.Data.SyncedAt is null && s.Data.Data.LastAttempt.Outcome == "future");
            await c.Catalogs.SyncAsync("n /x", "123"); var p = await c.Catalogs.ListProductsAsync("n /x", "123", new(100, "next_-")); Check(p.Data.Data.Products[0].Price == "0.10");
            Check((await c.CloudGraph.GetMarketingMessagesStatusAsync("n /x")).Data.Data.CloudApiMarketingDisabled == false);
            Check((await c.OfficialGroups.SetPictureAsync("n /x", "g/x", jpeg)).Data.Data.Accepted);
            Invalid(() => c.Catalogs.RetrieveAsync("n", "../")); Invalid(() => c.Catalogs.ListProductsAsync("n", "123", new(0)));
        }
        Check(paths.Count == 6 && paths[0] == "GET /messaging/n%20%2Fx/catalogs" && paths[5] == "PUT /messaging/n%20%2Fx/official-groups/g%2Fx/picture");
        var attempts = 0;
        using var denied = new Handler((r, _) => { attempts++; var v = Response("""{"error":{"code":"catalog_sync_cooldown","message":"Wait"}}""", HttpStatusCode.TooManyRequests); v.Headers.TryAddWithoutValidation("Retry-After", "120"); return Task.FromResult(v); });
        using (var c = new MessagingClient(Credential.OrganizationApiKey(Key), new() { TransportHandler = denied }))
        { try { await c.Catalogs.SyncAsync("n", "123", new() { IdempotencyKey = "key", MaxNetworkRetries = 3 }); throw new Exception("Expected cooldown"); } catch (PolymorfaRateLimitException e) { Check(e.Code == "catalog_sync_cooldown" && e.Metadata!.Headers["retry-after"] == "120"); } }
        Check(attempts == 1);
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        using (var c = new MessagingClient(Credential.OrganizationApiKey(Key), new() { TransportHandler = new Handler((_, token) => Task.FromCanceled<HttpResponseMessage>(token)) }))
        { try { await c.OfficialGroups.SetPictureAsync("n", "g", jpeg, new() { CancellationToken = cancelled.Token }); throw new Exception("Expected cancellation"); } catch (PolymorfaCancelledException) { } }
        using (var c = new MessagingClient(Credential.ClientToken("pmfa_ct_bG9jYWw")))
        { try { await c.Catalogs.ListAsync("n"); throw new Exception("Expected credential refusal"); } catch (PolymorfaConfigurationException) { } }
        using var platformHandler = new Handler(async (r, token) => {
            if (r.Method != HttpMethod.Get) { var body = JsonSerializer.Deserialize<JsonElement>(await r.Content!.ReadAsStringAsync(token)); Check(body.GetProperty("batching").GetProperty("enabled").GetBoolean() == false); }
            const string hook = "{\"id\":\"w\",\"batching\":{\"enabled\":false,\"maxEvents\":100,\"windowMs\":1000}}";
            return Response(r.Method == HttpMethod.Get ? "{\"data\":" + hook + "}" : "{\"data\":{\"webhook\":" + hook + "}}");
        });
        using (var c = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { TransportHandler = platformHandler }))
        {
            foreach (var resource in new[] { c.Webhooks, c.Project("p/x").Webhooks }) {
                await resource.CreateAsync(new("https://example.test", [], Batching: new(false)));
                await resource.UpdateAsync("w", new(Batching: new(false)));
                Check((await resource.RetrieveAsync("w")).Data.Batching!.MaxEvents == 100);
                Invalid(() => resource.UpdateAsync("w", new(Batching: new(true, 1))));
            }
        }
        foreach (var code in CloudReadiness.FailureCodes.Concat(new[] { "future_readiness" })) {
            var status = JsonSerializer.Deserialize<QuickLinkStatus>(JsonSerializer.Serialize(new { errorCode = code }), Json)!;
            Check(status.ErrorCode == code && !PolymorfaErrorCodes.IsKnown(code));
        }
        Batch();
        Console.WriteLine("PASS Official round2 native wire, multipart, cancellation, cooldown, identity and whole-body batches");
    }
    private static void Batch()
    {
        const string ev = """{"id":"e","session":"","timestamp":"now","event":"contact.update","payload":{"id":"new","parentBsuid":"new-p","identityChange":{"reason":"user_id_changed","messageId":"m","previous":{"id":"old","parentBsuid":"old-p"}}}}""";
        var e = JsonSerializer.Deserialize<JsonElement>(ev); var batch = new { @object = "event_batch", version = 1, id = "00000000-0000-4000-8000-000000000001", events = new[] { e, e } };
        var raw = JsonSerializer.SerializeToUtf8Bytes(batch); var sig = Convert.ToHexString(HMACSHA256.HashData("s"u8, raw));
        var delivery = (WebhookEventBatch)Webhooks.ConstructDelivery(raw, sig, "s"); Check(delivery.Events.Count == 2 && delivery.Events[0].Envelope.Id == "e");
        var payload = delivery.Events[0].Envelope.Payload.Deserialize<ContactUpdatePayload>(Json)!; Check(payload.ParentBsuid == "new-p" && payload.IdentityChange!.Previous!.Id == "old");
        var one = JsonSerializer.SerializeToUtf8Bytes(new { @object = "event_batch", version = 1, id = "00000000-0000-4000-8000-000000000001", events = new[] { e } });
        Check(((WebhookEventBatch)Webhooks.ParseVerifiedDelivery(one)).Events.Count == 1);
        Check(Webhooks.ParseVerifiedDelivery(Encoding.UTF8.GetBytes(ev)) is SingleWebhookDelivery);
        try { Webhooks.ConstructDelivery([.. raw, 32], sig, "s"); throw new Exception("Expected signature failure"); } catch (WebhookSignatureException) { }
        foreach (var text in new[] { """{"object":"event_batch","version":2,"id":"00000000-0000-4000-8000-000000000001","events":[]}""", """{"object":"event_batch","version":1,"id":"00000000-0000-4000-8000-000000000001","events":[{"object":"event_batch"}]}""" }) Invalid(() => Webhooks.ParseVerifiedDelivery(Encoding.UTF8.GetBytes(text)));
        var graph = JsonSerializer.Deserialize<CloudMarketingStatus>("""{"id":"w","owner_business_info":{"marketing_messages_onboarding_status":{"status":"future_terms","time":"now"}},"disable_marketing_messages_on_cloud_api":false}""", Json)!;
        Check(graph.DisableMarketingMessagesOnCloudApi == false && graph.OwnerBusinessInfo!.MarketingMessagesOnboardingStatus!.Status == "future_terms");
        var order = JsonSerializer.Deserialize<CloudOrder>("""{"catalogId":"123","items":[{"productRetailerId":"p","quantity":2,"itemPrice":0.1,"currency":"USD"}]}""", Json)!; Check(order.Items[0].Quantity == 2);
    }
}
