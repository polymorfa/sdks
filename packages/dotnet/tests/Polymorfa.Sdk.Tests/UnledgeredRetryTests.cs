using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;
using Polymorfa.Sdk;

internal static class UnledgeredRetryTests
{
    private sealed class Peer : IAsyncDisposable
    {
        private readonly TcpListener listener = new(IPAddress.Loopback, 0);
        private readonly CancellationTokenSource stop = new();
        private readonly Task serving;
        public readonly ConcurrentQueue<(string Path, Dictionary<string, string> Headers, int Length)> Requests = new();
        public Uri Url { get; }
        public Peer(int status, bool control = false)
        {
            listener.Start(); Url = new Uri($"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}");
            serving = Task.Run(async () =>
            {
                try
                {
                    while (!stop.IsCancellationRequested)
                    {
                        using var socket = await listener.AcceptTcpClientAsync(stop.Token);
                        await using var stream = socket.GetStream();
                        var raw = new List<byte>(); var one = new byte[1];
                        while (await stream.ReadAsync(one, stop.Token) != 0)
                        {
                            raw.Add(one[0]);
                            if (raw.Count >= 4 && raw.TakeLast(4).SequenceEqual("\r\n\r\n"u8.ToArray())) break;
                        }
                        var lines = Encoding.ASCII.GetString(raw.ToArray()).Split("\r\n");
                        var headers = lines.Skip(1).Where(l => l.Contains(':')).Select(l => l.Split(':', 2)).ToDictionary(p => p[0].ToLowerInvariant(), p => p[1].Trim());
                        var length = int.Parse(headers.GetValueOrDefault("content-length", "0"));
                        var body = new byte[length]; await stream.ReadExactlyAsync(body, stop.Token);
                        Requests.Enqueue((lines[0].Split(' ')[1], headers, length));
                        if (status == 0) continue; // Disconnect after the complete effect-bearing request.
                        var actual = control && Requests.Count > 1 ? 200 : status;
                        var json = actual == 200 ? "{\"success\":true,\"data\":{\"id\":\"message\",\"status\":\"sent\"}}" : "{\"error\":{\"code\":\"fixture_failure\",\"message\":\"unknown outcome\"}}";
                        await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 {actual} Fixture\r\ncontent-type: application/json\r\nretry-after: 0\r\nx-request-id: unledgered\r\ncontent-length: {json.Length}\r\nconnection: close\r\n\r\n{json}"), stop.Token);
                    }
                }
                catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
            });
        }
        public async ValueTask DisposeAsync() { stop.Cancel(); listener.Stop(); await serving; stop.Dispose(); }
    }
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    internal static async Task RunAsync()
    {
        var failures = new List<Exception>();
        foreach (var operation in new[] { "grant", "relay", "retry", "delete" })
            foreach (var status in new[] { 0, 429, 503 })
                foreach (var policy in new[] { "keyed", "unkeyed", "default" })
                {
                    try { await CaseAsync(operation, status, policy); }
                    catch (Exception error) { failures.Add(new Exception($"{operation}/{status}/{policy}: {error.Message}", error)); }
                }
        if (failures.Count != 0) throw new AggregateException(failures);
        foreach (var operation in new[] { "send", "descriptor", "get" })
        {
            await using var peer = new Peer(503, true);
            using var client = new MessagingClient(Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"), new() { BaseUrl = peer.Url, MaxNetworkRetries = 1 });
            var options = new RequestOptions { IdempotencyKey = "send-key", MaxNetworkRetries = 1 };
            if (operation == "send") await client.Messages.SendAsync("s", new(new() { PhoneNumber = "+15550001111" }, new TextContent("fixture")), options);
            else if (operation == "descriptor")
            {
                var media = new WhatsAppMediaSendDescriptor("/sticker.enc", new byte[32], new byte[32], new byte[32], 100, "image/webp", "https://mmg.whatsapp.net/sticker.enc") { Width = 64, Height = 64 };
                await client.Messages.SendAsync("s", new(new(Id: "recipient"), new StickerContent(media)), options);
            }
            else await client.Profile.GetAsync("s", options);
            Check(peer.Requests.Count == 2, "Established " + operation + " retry lost");
        }
        Console.WriteLine("PASS 36 unledgered submissions and established send/GET retry controls");
    }
    private static async Task CaseAsync(string operation, int status, string policy)
    {
        await using var peer = new Peer(status);
        using var client = new MessagingClient(Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"), new() { BaseUrl = peer.Url, MaxNetworkRetries = 1 });
        var options = new RequestOptions { IdempotencyKey = policy == "keyed" ? "caller-key" : null, MaxNetworkRetries = policy == "default" ? null : 1, Headers = new Dictionary<string, string> { ["x-caller"] = "retained" } };
        using var input = new MemoryStream(new byte[26]);
        PolymorfaException? error = null;
        try
        {
            switch (operation)
            {
                case "grant": await client.WhatsAppMedia.CreateUploadGrantAsync("s", WhatsAppUploadMediaType.Image, new byte[32], options); break;
                case "relay": await client.WhatsAppMedia.RelayUploadAsync("s", WhatsAppUploadMediaType.Image, new byte[32], input, 26, options); break;
                case "retry": await client.HistorySync.RequestChunkRetryAsync("s", new(HistorySyncType.RECENT, 1), options); break;
                case "delete": await client.HistorySync.DeleteChunkAsync("s", new("/chunk", Convert.ToBase64String(new byte[32])), options); break;
            }
        }
        catch (PolymorfaException failure) { error = failure; }
        Check(error is not null, "Failure not surfaced");
        Check(peer.Requests.Count == 1, "Repeated submission: " + peer.Requests.Count);
        var record = peer.Requests.Single();
        Check(record.Headers["authorization"] == "Bearer pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k" && record.Headers["x-caller"] == "retained" && record.Headers["polymorfa-version"] == "2026-10-14", "Caller headers lost");
        Check(record.Headers.GetValueOrDefault("idempotency-key") == options.IdempotencyKey, "Caller key lost");
        if (operation == "relay") Check(input.CanRead && record.Length == 26, "Borrowed ciphertext ownership/length");
        if (status == 0) Check(error is PolymorfaConnectionException, "Connection failure lost");
        else Check(error!.Code == "fixture_failure" && error.Status == status && error.RequestId == "unledgered" && error.Metadata?.Attempts == 1, "Failure metadata lost");
    }
}
