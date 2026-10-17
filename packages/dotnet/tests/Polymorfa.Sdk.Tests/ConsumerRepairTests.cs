using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class ConsumerRepairTests
{
    private const string Key = "pmfa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    public static async Task RunAsync() { await MediaAsync(); await CallsAsync(); await CursorAsync(); await UsageAsync(); await SignalSessionAsync(); await SignalTruncationAsync(); await SignalAckAsync(); await SignalDeadlineAsync(); }
    public static async Task UsageAsync()
    {
        foreach (var repeated in new[] { false, true })
        {
            await using var peer = new Peer((_, stream, _) => Reply(stream, 200, JsonSerializer.Serialize(new { data = new { records = Array.Empty<int>(), nextCursor = repeated ? "seed /+" : null } })));
            using var client = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = peer.Url, MaxNetworkRetries = 0 });
            try { await foreach (var _ in client.Usage.IterateRecordsAsync(new(Cursor: "seed /+"))) { } Check(!repeated, "Usage repeated initial cursor accepted"); }
            catch (PolymorfaServerException error) { Check(repeated && error.Code == "invalid_response" && error.RequestId == "repair", "Usage cursor error changed"); }
            Check(peer.Requests.Count == 1 && peer.Requests.Single().Target == "/platform/usage/records?cursor=seed%20%2F%2B", "Usage initial cursor discarded/repeated");
        }
        Console.WriteLine("PASS public usage: initial cursor retained and seeded duplicate guard");
    }
    private const string SignalSecret = "application-fixture-secret";
    private static string SignalFrame(string session) => "id: e\nevent: message\ndata: " + JsonSerializer.Serialize(new { id = "e", type = "message", session_id = session, chat = "c", sender = "p", message_id = "m", timestamp = 1, is_from_me = false, redelivered = false, identity_changed = false, message_proto = "", text = "private" }) + "\n\n";
    private static void SignalHeaders(Request request)
    {
        Check(request.Headers["authorization"] == "Bearer " + SignalSecret && !request.Headers.ContainsKey("cookie") && !request.Headers.ContainsKey("origin") && !request.Headers.ContainsKey("polymorfa-version"), "Signal authority changed");
    }
    private static Task SignalReply(NetworkStream stream, string body) => stream.WriteAsync(Encoding.UTF8.GetBytes($"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {Encoding.UTF8.GetByteCount(body)}\r\nConnection: close\r\n\r\n{body}")).AsTask();
    public static async Task SignalSessionAsync()
    {
        await using (var peer = new Peer((request, stream, _) => { SignalHeaders(request); Check(request.Target == "/v1/events?session_id=assigned%20%2F%2B", "Signal filter query lost"); return SignalReply(stream, SignalFrame("other")); }))
        {
            using var client = new SignalClient(new(peer.Url, SignalSecret));
            try { await foreach (var _ in client.EventsAsync("assigned /+")) { throw new Exception("Cross-session Signal event escaped"); } throw new Exception("Missing Signal mismatch error"); } catch (PolymorfaServerException error) { Check(error.Code == "invalid_response", "Signal mismatch error changed"); }
        }
        foreach (var filter in new string?[] { null, "s" })
        {
            await using var peer = new Peer((request, stream, _) => { SignalHeaders(request); return SignalReply(stream, ": keepalive\r\n\r\n" + SignalFrame("s")); });
            using var client = new SignalClient(new(peer.Url, SignalSecret)); var events = new List<SignalEvent>(); await foreach (var item in client.EventsAsync(filter)) events.Add(item); Check(events.Count == 1 && events[0].SessionId == "s", "Valid Signal filter/EOF changed");
        }
        Console.WriteLine("PASS public Signal: session filtering and unfiltered/clean EOF controls");
    }
    public static async Task SignalTruncationAsync()
    {
        foreach (var body in new[] { "id: e", "id: e\nevent: message\n", SignalFrame("s").TrimEnd('\n'), SignalFrame("s") + "id: next\ndata: partial" })
        {
            await using var peer = new Peer((request, stream, _) => { SignalHeaders(request); return SignalReply(stream, body); });
            using var client = new SignalClient(new(peer.Url, SignalSecret)); var count = 0;
            try { await foreach (var _ in client.EventsAsync("s")) count++; throw new Exception("Truncated Signal frame ended normally"); } catch (PolymorfaServerException error) { Check(error.Code == "invalid_response" && count == (body.StartsWith(SignalFrame("s"), StringComparison.Ordinal) ? 1 : 0), "Signal partial frame outcome changed"); }
        }
        Console.WriteLine("PASS public Signal: truncated lines/frames and partial tail after valid event are errors");
    }
    public static async Task SignalAckAsync()
    {
        foreach (var status in new[] { 200, 201, 202, 205, 206, 299, 204 })
        {
            await using var peer = new Peer((request, stream, _) => { SignalHeaders(request); Check(request.Target == "/v1/events/e%20%2F%2B/ack", "Signal ACK id escaping lost"); return Reply(stream, status, status == 204 ? "" : "private"); });
            using var client = new SignalClient(new(peer.Url, SignalSecret));
            try { await client.AcknowledgeAsync("e /+"); Check(status == 204, "Signal non-204 ACK accepted"); } catch (PolymorfaServerException error) { Check(status != 204 && error.Status == status && error.Code == "invalid_response" && !error.ToString().Contains("private"), "Signal ACK error lost status/safety"); }
            Check(peer.Requests.Count == 1, "Signal ACK replayed");
        }
        Console.WriteLine("PASS public Signal: exact 204 ACK, actual status, safe errors and no replay");
    }
    public static async Task SignalDeadlineAsync()
    {
        await using var peer = new Peer(async (request, stream, stop) => { SignalHeaders(request); await Task.Delay(160, stop); var body = "{\"node_id\":\"n\",\"sessions\":[]}"; await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n"), stop); await Task.Delay(240, stop); await stream.WriteAsync(Encoding.UTF8.GetBytes(body), stop); });
        using var client = new SignalClient(new(peer.Url, SignalSecret) { Timeout = TimeSpan.FromMilliseconds(300) });
        try { await client.SessionsAsync(); throw new Exception("Signal header time reset body deadline"); } catch (PolymorfaTimeoutException) { }
        Console.WriteLine("PASS public Signal: finite JSON shares header/body deadline");
    }
    public static async Task MediaAsync()
    {
        foreach (var redirect in new[] { false, true })
            foreach (var synchronous in new[] { false, true })
            {
                await using var storage = new Peer(async (request, stream, stop) =>
                {
                    Check(!request.Headers.ContainsKey("authorization") && !request.Headers.ContainsKey("cookie") && !request.Headers.ContainsKey("x-private") && !request.Headers.ContainsKey("polymorfa-version"), "Storage received API authority");
                    await Stall(stream, stop);
                });
                await using var api = new Peer(async (request, stream, stop) =>
                {
                    Check(request.Target == "/prefix/messaging/media/id" && request.Headers["authorization"] == "Bearer " + Key && request.Headers["polymorfa-version"] == "2026-09-22", "Media API request changed");
                    if (redirect) await Reply(stream, 302, "", "Location: " + storage.Url + "signed?signature=private\r\n"); else await Stall(stream, stop);
                });
                using var client = new MessagingClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = new(api.Url, "prefix"), MaxNetworkRetries = 0 });
                await using var download = await client.Media.DownloadStreamAsync("id", new() { Timeout = TimeSpan.FromMilliseconds(200), Headers = new Dictionary<string, string> { ["x-private"] = "private" } });
                var read = synchronous ? Task.Run(() => { var buffer = new byte[8]; while (download.Body.Read(buffer, 0, buffer.Length) != 0) { } }) : download.ReadAllAsync();
                try { await read.WaitAsync(TimeSpan.FromSeconds(2)); throw new Exception("Media stall was accepted"); }
                catch (PolymorfaTimeoutException error) { Check(error.RequestId == "repair" && !error.ToString().Contains("signature=private"), "Unsafe/missing media timeout metadata"); }
                catch (TimeoutException) { throw new Exception("Public media body outlived its request deadline"); }
                Check(api.Requests.Count == 1 && storage.Requests.Count == (redirect ? 1 : 0), "Media body retried");
            }
        // Header time consumes the same successful request's budget, rather than starting a fresh body timer.
        await using (var api = new Peer(async (_, stream, stop) => { await Task.Delay(160, stop); await stream.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Length: 1\r\nx-request-id: repair\r\nConnection: close\r\n\r\n"), stop); await Task.Delay(240, stop); await stream.WriteAsync(new byte[] { 97 }, stop); }))
        {
            using var client = new MessagingClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = api.Url, MaxNetworkRetries = 0 });
            try { await client.Media.DownloadAsync("id", new() { Timeout = TimeSpan.FromMilliseconds(300) }); throw new Exception("Media header budget reset at body"); } catch (PolymorfaTimeoutException) { }
        }
        foreach (var perRead in new[] { false, true })
        {
            await using var api = new Peer((_, stream, stop) => Stall(stream, stop));
            using var client = new MessagingClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = api.Url });
            using var caller = new CancellationTokenSource(); using var readCancel = new CancellationTokenSource();
            await using var download = await client.Media.DownloadStreamAsync("id", new() { Timeout = TimeSpan.FromSeconds(3), CancellationToken = caller.Token });
            var read = download.ReadAllAsync(readCancel.Token); (perRead ? readCancel : caller).CancelAfter(100);
            try { await read.WaitAsync(TimeSpan.FromSeconds(2)); throw new Exception("Media cancellation ignored"); } catch (PolymorfaCancelledException) { }
        }
        await using (var api = new Peer((_, stream, _) => Reply(stream, 200, "media")))
        {
            using var client = new MessagingClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = api.Url });
            await using var download = await client.Media.DownloadStreamAsync("id", new() { Timeout = TimeSpan.FromMilliseconds(200) });
            Check(Encoding.UTF8.GetString(await download.ReadAllAsync()) == "media", "Valid media changed");
            await Task.Delay(250); Check(await download.Body.ReadAsync(new byte[1]) == 0, "Completed body retained deadline");
            Check((await client.Media.DownloadAsync("id")).Data.Length == 5, "Download disposed borrowed client");
        }
        await using (var api = new Peer((request, stream, _) => Reply(stream, request.Number == 1 ? 500 : 200, request.Number == 1 ? "{}" : "retry", "Retry-After: 0\r\n")))
        {
            using var client = new MessagingClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = api.Url, MaxNetworkRetries = 1 });
            var result = await client.Media.DownloadAsync("id"); Check(result.Metadata.Attempts == 2 && Encoding.UTF8.GetString(result.Data) == "retry", "API media retry changed");
        }
        Console.WriteLine("PASS public media: direct/redirect async/sync deadlines, shared header budget, caller/read cancellation, EOF, ownership and retry");
    }
    private static async Task Stall(NetworkStream stream, CancellationToken stop)
    {
        await stream.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nx-request-id: repair\r\nConnection: close\r\n\r\n1\r\na\r\n"), stop);
        await Task.Delay(Timeout.Infinite, stop);
    }
    public static async Task CallsAsync()
    {
        foreach (var prefix in new[] { "/nested/api", "/nested/api/", "/escaped%20prefix/v1/", "" })
            foreach (var media in new[] { false, true })
                foreach (var clientToken in new[] { false, true })
                {
                    var credential = clientToken ? "pmfa_ct_fixture" : Key;
                    var authenticated = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
                    await using var peer = new Peer(async (request, stream, stop) =>
                    {
                        var protocol = media ? CallsProtocol.MediaSubprotocol : null;
                        Check(!request.Headers.ContainsKey("authorization") && !request.Headers.ContainsKey("cookie") && !request.Target.Contains(credential) && !request.Headers.ContainsKey("origin"), "Calls handshake authority changed");
                        Check(request.Headers.GetValueOrDefault("sec-websocket-protocol") == protocol, "Calls subprotocol changed");
                        var accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(request.Headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
                        await stream.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n" + (protocol is null ? "" : "Sec-WebSocket-Protocol: " + protocol + "\r\n") + "\r\n"), stop);
                        using var socket = WebSocket.CreateFromStream(stream, true, protocol, TimeSpan.Zero); var bytes = new byte[8192]; var frame = await socket.ReceiveAsync(bytes.AsMemory(), stop); using var json = JsonDocument.Parse(bytes.AsMemory(0, frame.Count)); authenticated.TrySetResult(json.RootElement.Clone());
                        await socket.SendAsync(Encoding.UTF8.GetBytes(media ? "{\"type\":\"ready\",\"sampleRate\":16000,\"video\":false}" : "{\"type\":\"ready\"}").AsMemory(), WebSocketMessageType.Text, true, stop);
                        await Task.Delay(Timeout.Infinite, stop);
                    });
                    var options = new CallsSocketOptions { BaseUrl = new(peer.Url.AbsoluteUri.TrimEnd('/') + prefix), Session = "session/a ?&b", Participant = "agent:one@example.test", Heartbeat = TimeSpan.Zero };
                    await using var socket = media ? await CallsSocket.OpenMediaAsync(new(credential), "call /?+", "connection_1", options) : await CallsSocket.OpenLifecycleAsync(new(credential), options);
                    var auth = await authenticated.Task; Check(auth.GetProperty("token").GetString() == credential && auth.GetProperty("type").GetString() == "auth", "First-frame Calls authentication changed");
                    var expected = prefix.TrimEnd('/') + (media ? "/voip/calls/call%20%2F%3F%2B/media" : "/voip/ws" + (clientToken ? "" : "?session=session%2Fa%20%3F%26b&participant=agent%3Aone%40example.test"));
                    Check(peer.Requests.Single().Target == expected, "Calls base prefix/escaping lost: " + peer.Requests.Single().Target + " expected " + expected);
                    if (media) { Check(auth.GetProperty("connectionId").GetString() == "connection_1", "Connection binding lost"); Check(clientToken ? !auth.TryGetProperty("participant", out _) : auth.GetProperty("participant").GetString() == options.Participant, "Participant authority changed"); }
                }
        Console.WriteLine("PASS public Calls WebSockets: nested/escaped/trailing base prefixes, lifecycle/media, both token kinds, first-frame authority and native Origin control");
    }
    public static async Task CursorAsync()
    {
        foreach (var cycle in new[] { new[] { "again", "again" }, new[] { "a", "b", "a" }, new[] { "seed" }, new[] { "", "" } })
        {
            await using var peer = new Peer((request, stream, _) => Reply(stream, 200, JsonSerializer.Serialize(new { items = Array.Empty<int>(), next = cycle[Math.Min(request.Number - 1, cycle.Length - 1)] })));
            using var client = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = peer.Url, MaxNetworkRetries = 0 });
            var page = await client.PaginateRawAsync(new(HttpMethod.Get, "/raw", Query: [new("position", "seed")]), Decode, "position");
            try { await Task.Run(async () => { await foreach (var _ in page) { } }).WaitAsync(TimeSpan.FromSeconds(2)); throw new Exception("Repeated cursor accepted"); }
            catch (PolymorfaServerException error) { Check(error.Code == "invalid_response" && error.RequestId == "repair" && !error.ToString().Contains(Key), "Cursor failure lost safe metadata"); }
            catch (TimeoutException) { throw new Exception("Public raw iterator made unbounded repeated-cursor requests"); }
            Check(peer.Requests.Count <= cycle.Length + 1, "Cursor request bound exceeded");
        }
        await using (var peer = new Peer((request, stream, _) =>
        {
            Check(request.Headers["authorization"] == "Bearer " + Key && request.Headers["idempotency-key"] == "retained" && request.Body == "{\"filter\":true}", "Raw request authority/body lost");
            Check(request.Target == "/prefix/platform/projects/p/raw?filter=a%20%2F%2B&position=" + new[] { "seed", "next%20%2F%2B", "last" }[request.Number - 1], "Raw cursor query/prefix lost");
            return Reply(stream, 200, JsonSerializer.Serialize(new { items = request.Number == 1 ? Array.Empty<int>() : new[] { request.Number }, next = request.Number == 1 ? "next /+" : request.Number == 2 ? "last" : null }));
        }))
        {
            using var client = new ProjectClient(Credential.OrganizationApiKey(Key), "p", new() { BaseUrl = new(peer.Url, "prefix") }); using var body = JsonDocument.Parse("{\"filter\":true}");
            var page = await client.PaginateRawAsync(new(HttpMethod.Post, "/raw", body.RootElement, new() { IdempotencyKey = "retained" }, [new("filter", "a /+"), new("position", "seed")]), Decode, "position"); body.Dispose();
            var values = new List<int>(); await foreach (var value in page) values.Add(value); Check(values.SequenceEqual([2, 3]) && peer.Requests.Count == 3, "Valid/empty raw pages changed");
        }
        Console.WriteLine("PASS public raw cursor: repeated/self/cyclic/empty cursors bounded, valid empty pages, custom cursor, project/body/header/query snapshots");
    }
    private static DecodedRawPage<int> Decode(JsonElement json, ResponseMetadata _) => new(json.GetProperty("items").EnumerateArray().Select(item => item.GetInt32()).ToArray(), json.GetProperty("next").GetString());
    private static Task Reply(NetworkStream stream, int status, string body, string headers = "") => stream.WriteAsync(Encoding.UTF8.GetBytes($"HTTP/1.1 {status} Fixture\r\nx-request-id: repair\r\nContent-Type: application/json\r\nContent-Length: {Encoding.UTF8.GetByteCount(body)}\r\nConnection: close\r\n{headers}\r\n{body}")).AsTask();
    private sealed record Request(int Number, string Target, Dictionary<string, string> Headers, string Body);
    private sealed class Peer : IAsyncDisposable
    {
        private readonly TcpListener listener = new(IPAddress.Loopback, 0);
        private readonly CancellationTokenSource stop = new();
        private readonly ConcurrentBag<Task> handlers = [];
        private readonly Task accepting;
        private int count;
        public ConcurrentQueue<Request> Requests { get; } = new();
        public Uri Url { get; }
        public Peer(Func<Request, NetworkStream, CancellationToken, Task> handle)
        {
            listener.Start(); Url = new($"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/");
            accepting = Accept();
            async Task Accept()
            {
                try { while (!stop.IsCancellationRequested) { var client = await listener.AcceptTcpClientAsync(stop.Token); handlers.Add(Serve(client)); } } catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
            }
            async Task Serve(TcpClient client)
            {
                using (client)
                    try
                    {
                        var stream = client.GetStream(); var bytes = new List<byte>(); var one = new byte[1];
                        while (true) { if (await stream.ReadAsync(one, stop.Token) == 0) return; bytes.Add(one[0]); Check(bytes.Count < 65536, "Fixture request too large"); if (bytes.Count >= 4 && bytes.TakeLast(4).SequenceEqual(new byte[] { 13, 10, 13, 10 })) break; }
                        var lines = Encoding.ASCII.GetString(bytes.ToArray()).Split("\r\n"); var headers = lines.Skip(1).Where(line => line.Contains(':')).Select(line => line.Split(':', 2)).ToDictionary(parts => parts[0], parts => parts[1].Trim(), StringComparer.OrdinalIgnoreCase);
                        var body = new byte[int.Parse(headers.GetValueOrDefault("Content-Length", "0"))]; await stream.ReadExactlyAsync(body, stop.Token);
                        var request = new Request(Interlocked.Increment(ref count), lines[0].Split(' ')[1], headers, Encoding.UTF8.GetString(body)); Requests.Enqueue(request); await handle(request, stream, stop.Token);
                    }
                    catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
            }
        }
        public async ValueTask DisposeAsync() { stop.Cancel(); listener.Stop(); await accepting; await Task.WhenAll(handlers); stop.Dispose(); }
    }
}
