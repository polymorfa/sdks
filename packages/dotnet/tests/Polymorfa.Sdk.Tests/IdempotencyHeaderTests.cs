using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class IdempotencyHeaderTests
{
    public static async Task RunAsync()
    {
        foreach (var name in new[] { "Idempotency-Key", "idempotency-key", "IDEMPOTENCY-KEY" })
        {
            var headers = new Dictionary<string, string> { [name] = "caller-fixed" };
            await Replay(new() { Headers = headers, MaxNetworkRetries = 1 }, "caller-fixed");
            Equal(headers.Count, 1); Equal(headers[name], "caller-fixed");
        }
        await Replay(new() { Headers = new Dictionary<string, string> { ["Idempotency-Key"] = "same", ["idempotency-key"] = "same" }, MaxNetworkRetries = 1 }, "same");
        await Replay(new() { IdempotencyKey = "explicit", Headers = new Dictionary<string, string> { ["Idempotency-Key"] = "ignored", ["idempotency-key"] = "different" }, MaxNetworkRetries = 1 }, "explicit");
        await Replay(new() { MaxNetworkRetries = 1 }, null);
        var mutable = new Dictionary<string, string> { ["Idempotency-Key"] = "snapshot" };
        await Replay(new() { Headers = mutable, MaxNetworkRetries = 1 }, "snapshot", index => { if (index == 0) mutable["Idempotency-Key"] = "changed"; if (index == 1) mutable["Idempotency-Key"] = "snapshot"; });
        foreach (var value in new[] { "", " ", "private\r\nvalue", "private\0value", "private\u007fvalue", new string('a', 256), new string('é', 128) })
        {
            await Rejected(new() { Headers = new Dictionary<string, string> { ["Idempotency-Key"] = value } });
            await Rejected(new() { IdempotencyKey = value });
        }
        await Rejected(new() { Headers = new Dictionary<string, string> { ["Idempotency-Key"] = "private-first", ["idempotency-key"] = "private-second" } });
        await RawPolicyAndBodySnapshot();
        Console.WriteLine("PASS idempotency headers across public calls and native retries");
    }

    private static async Task Replay(RequestOptions options, string? expected, Action<int>? onRead = null)
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var saved = new List<string[]>();
        var serving = Task.Run(async () =>
        {
            for (var i = 0; i < 4; i++)
            {
                using var connection = await listener.AcceptTcpClientAsync(timeout.Token);
                await using var stream = connection.GetStream();
                var head = new List<byte>(); var one = new byte[1];
                while (head.Count < 65536)
                {
                    if (await stream.ReadAsync(one, timeout.Token) == 0) throw new Exception("Incomplete request headers.");
                    head.Add(one[0]);
                    if (head.Count >= 4 && head[^4] == 13 && head[^3] == 10 && head[^2] == 13 && head[^1] == 10) break;
                }
                var lines = Encoding.ASCII.GetString(head.ToArray()).Split("\r\n");
                saved.Add(lines.Where(line => line.StartsWith("idempotency-key:", StringComparison.OrdinalIgnoreCase)).Select(line => line.Split(':', 2)[1].Trim()).ToArray());
                var length = lines.First(line => line.StartsWith("content-length:", StringComparison.OrdinalIgnoreCase)).Split(':', 2)[1];
                var input = new byte[int.Parse(length)]; await stream.ReadExactlyAsync(input, timeout.Token);
                onRead?.Invoke(i);
                var status = i % 2 == 0 ? 503 : 200;
                var body = status == 503 ? "{\"error\":{\"code\":\"service_unavailable\",\"message\":\"retry\"}}" : Adoption41Fixtures.Envelope(CampaignExistingTests.Change(Adoption41Fixtures.CampaignJson, "operationId", System.Text.Json.Nodes.JsonValue.Create("op")));
                await stream.WriteAsync(Encoding.UTF8.GetBytes($"HTTP/1.1 {status} Fixture\r\ncontent-type: application/json\r\nretry-after: 0\r\ncontent-length: {body.Length}\r\nconnection: close\r\n\r\n{body}"), timeout.Token);
            }
        });
        using var client = new MessagingClient(Credential.OrganizationApiKey("pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), new() { BaseUrl = new Uri($"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}"), MaxNetworkRetries = 1, Timeout = TimeSpan.FromSeconds(3) });
        try
        {
            for (var call = 0; call < 2; call++) await client.Campaigns.LaunchAsync("support", "campaign", options: options);
            await serving;
            foreach (var values in saved) { Equal(values.Length, 1); if (expected is not null) Equal(values[0], expected); else if (!Guid.TryParse(values[0], out _)) throw new Exception("Missing generated key."); }
            if (expected is null) { Equal(saved[0][0], saved[1][0]); Equal(saved[2][0], saved[3][0]); if (saved[0][0] == saved[2][0]) throw new Exception("Distinct public calls reused an automatically generated key."); }
        }
        finally { timeout.Cancel(); listener.Stop(); try { await serving; } catch (OperationCanceledException) { } }
    }

    private static async Task Rejected(RequestOptions options)
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        using var client = new MessagingClient(Credential.OrganizationApiKey("pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), new() { BaseUrl = new Uri($"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}"), Timeout = TimeSpan.FromMilliseconds(200) });
        try { await client.Campaigns.LaunchAsync("support", "campaign", options: options); throw new Exception("Expected invalid key rejection."); }
        catch (PolymorfaConfigurationException error) { if (error.ToString().Contains("private", StringComparison.Ordinal)) throw new Exception("Invalid key leaked."); }
        if (listener.Pending()) throw new Exception("Invalid idempotency key reached the network.");
    }

    private static async Task RawPolicyAndBodySnapshot()
    {
        using (var fixture = new WireFixture { ExpectedHeaders = new Dictionary<string, string> { ["idempotency-key"] = "raw-caller" } })
        using (var client = new MessagingClient(Credential.OrganizationApiKey("pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 1 }))
        {
            var serving = Task.Run(async () => { await fixture.ServeAsync("POST", "/messaging/raw", "{}", "{\"error\":{\"code\":\"service_unavailable\",\"message\":\"retry\"}}", 503); await fixture.ServeAsync("POST", "/messaging/raw", "{}", "{}"); });
            try
            {
                var options = new RequestOptions { Headers = new Dictionary<string, string> { ["IDEMPOTENCY-KEY"] = "raw-caller" }, MaxNetworkRetries = 1 };
                try { await client.RawAsync<JsonElement>(HttpMethod.Post, "/messaging/raw", JsonSerializer.SerializeToElement(new { }), options); throw new Exception("Header-only raw request unexpectedly retried."); }
                catch (PolymorfaServerException error) { Equal(error.Metadata!.Attempts, 1); Equal(error.Code, "service_unavailable"); }
                await client.RawAsync<JsonElement>(HttpMethod.Post, "/messaging/raw", JsonSerializer.SerializeToElement(new { }), options);
            }
            finally { await serving.WaitAsync(TimeSpan.FromSeconds(10)); }
        }
        using var body = JsonDocument.Parse("{\"value\":\"original\"}"); var replies = 0;
        using (var fixture = new WireFixture { BeforeResponse = () => { if (replies++ == 0) body.Dispose(); return Task.CompletedTask; }, ExpectedHeaders = new Dictionary<string, string> { ["idempotency-key"] = "body-snapshot" } })
        using (var client = new MessagingClient(Credential.OrganizationApiKey("pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 1 }))
        {
            var serving = Task.Run(async () => { await fixture.ServeAsync("POST", "/messaging/raw", "{\"value\":\"original\"}", "{\"error\":{\"code\":\"service_unavailable\",\"message\":\"retry\"}}", 503, new Dictionary<string, string> { ["retry-after"] = "0" }); await fixture.ServeAsync("POST", "/messaging/raw", "{\"value\":\"original\"}", "{}"); });
            try { Equal((await client.RawAsync<JsonElement>(HttpMethod.Post, "/messaging/raw", body.RootElement, new() { IdempotencyKey = "body-snapshot", MaxNetworkRetries = 1 })).Metadata.Attempts, 2); }
            finally { await serving.WaitAsync(TimeSpan.FromSeconds(10)); }
            Equal(replies, 2);
        }
    }

    private static void Equal<T>(T actual, T expected) { if (!EqualityComparer<T>.Default.Equals(actual, expected)) throw new Exception($"Idempotency assertion failed: expected {expected}, got {actual}."); }
}
