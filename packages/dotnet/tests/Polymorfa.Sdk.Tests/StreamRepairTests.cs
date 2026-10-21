using System.Net;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;
using Polymorfa.Sdk.Storage;

internal static class StreamRepairTests
{
    private const int Limit = 4 * 1024 * 1024;
    private const string Key = "pmfa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static string Frame(string cursor, string payload) => "data: " + JsonSerializer.Serialize(new { type = "event", cursor, streamId = "stream", sequence = 1, @event = new { id = "record", organizationId = "org", projectId = "p", type = "future.event", source = "runtime", environment = "production", createdAt = "now", payloadAvailability = "available", payload = new { encoding = "base64", contentType = "application/json", data = payload }, metadataExpiresAt = "later" } }) + "\n\n";
    private static string ValidPayload => Convert.ToBase64String("{\"id\":\"webhook\",\"session\":\"s\",\"timestamp\":\"now\",\"event\":\"future.event\",\"payload\":{}}"u8);
    private static OrganizationClient Client(HttpMessageHandler handler) => new(Credential.OrganizationApiKey(Key), new() { TransportHandler = handler, MaxNetworkRetries = 0 });
    private static EventStreamOptions Options(string? since = "initial") => new() { Since = since, ManualAcknowledgement = true, InitialReconnectDelay = TimeSpan.FromMilliseconds(1), MaximumReconnectDelay = TimeSpan.FromMilliseconds(1) };
    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request);
    }
    private static HttpResponseMessage Reply(string body, bool sse = true) => new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, sse ? "text/event-stream" : "application/json") };
    private static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    internal static async Task RunAsync()
    {
        var errors = new List<Exception>();
        foreach (var check in new Func<Task>[] { CursorAsync, StorageAsync, InitialCursorAsync, BoundsAsync })
        {
            try { await check(); } catch (Exception error) { errors.Add(error); }
        }
        if (errors.Count != 0) throw new AggregateException(errors);
        Console.WriteLine("PASS stream validation, retained resume/storage cursors, initial cursor fallback, manual ACK/CAS and UTF-8 frame bounds");
    }
    private static async Task CursorAsync()
    {
        foreach (var bad in new[] { "%%%", "e30=" })
        {
            var requests = 0; var resumedCorrect = true;
            using var handler = new Handler(request =>
            {
                requests++;
                resumedCorrect &= request.Headers.TryGetValues("last-event-id", out var ids) && ids.Single() == (requests == 1 ? "initial" : "good");
                return Task.FromResult(Reply(requests == 1 ? Frame("good", ValidPayload) + Frame("bad", bad) : "data: {\"type\":\"revoked\"}\n\n"));
            });
            using var client = Client(handler); var stream = client.Project("p").Events.Stream(Options()); var cursors = new List<string>();
            try { await foreach (var item in stream) cursors.Add(item.Cursor); }
            catch (PolymorfaValidationException) when (bad == "e30=") { }
            catch (PolymorfaAuthorizationException) { }
            Check(stream.Cursor == "good" && cursors.SequenceEqual(["good"]), "Invalid base64/envelope changed delivered cursor");
            // Invalid decoded webhooks are terminal in this SDK. Explicitly reopening
            // uses its retained cursor; do not add a retry loop to change that policy.
            if (requests == 1)
            {
                try { await foreach (var _ in client.Project("p").Events.Stream(Options(stream.Cursor))) throw new Exception("Unexpected event"); }
                catch (PolymorfaAuthorizationException) { }
            }
            Check(requests == 2 && resumedCorrect, "Bad payload advanced reconnect cursor");
        }
    }
    private static async Task StorageAsync()
    {
        foreach (var bad in new[] { "%%%", "e30=" })
        {
            var storage = new CustomerStorage(new MemoryStorageAdapter()); var requests = 0; var acks = 0; var resumedCorrect = true;
            using var handler = new Handler(async request =>
            {
                if (request.Method == HttpMethod.Post)
                {
                    acks++;
                    Check(await storage.HasEventAsync("s", "webhook") && (await storage.CheckpointAsync("*", "events"))?.Cursor == "good", "ACK preceded event/checkpoint commit");
                    Check((await request.Content!.ReadAsStringAsync()).Contains("\"cursor\":\"good\"", StringComparison.Ordinal), "Bad payload acknowledged");
                    return Reply("{\"data\":{\"streamId\":\"stream\",\"acknowledgedCursor\":\"good\",\"sequence\":1,\"replayed\":false}}", false);
                }
                requests++;
                if (requests == 2) resumedCorrect = request.Headers.GetValues("last-event-id").Single() == "good" && (await storage.CheckpointAsync("*", "events"))?.Cursor == "good";
                return Reply(requests == 1 ? Frame("good", ValidPayload) + Frame("bad", bad) : "data: {\"type\":\"revoked\"}\n\n");
            });
            using var client = Client(handler); var events = client.Project("p").Events;
            var sync = events.SyncToStorage(storage, new() { StreamOptions = Options() });
            try { await sync.Completion; } catch (PolymorfaValidationException) when (bad == "e30=") { } catch (PolymorfaAuthorizationException) { }
            if (requests == 1)
            {
                var resumed = events.SyncToStorage(storage, new() { StreamOptions = Options("ignored") });
                try { await resumed.Completion; } catch (PolymorfaAuthorizationException) { }
            }
            Check(requests == 2 && resumedCorrect && acks == 1 && (await storage.CheckpointAsync("*", "events"))?.Cursor == "good", "Invalid payload escaped into storage");
        }
    }
    private sealed class Source(CustomerStorage storage, string expected, bool conflict = false) : IStorageEventStreamSource
    {
        internal int Acks;
        public async IAsyncEnumerable<EventStreamItem> Stream(EventStreamOptions options)
        {
            Check(options.Since == expected && options.ManualAcknowledgement, "Lost initial cursor or saved override");
            if (conflict) await storage.ApplyAsync(new("*", [new StorageCheckpoint("*", "events", "other", PatchValue<string>.Set(null))]));
            var webhook = Webhooks.ParseVerifiedEvent(Convert.FromBase64String(ValidPayload));
            yield return new(new("record", "org", "p", "future.event", "runtime", "production", "now", "available", null, null, "later"), "stream", 1, webhook, "saved");
        }
        public async Task AcknowledgeAsync(string streamId, EventStreamAcknowledgement input)
        {
            Check(await storage.HasEventAsync("s", "webhook") && (await storage.CheckpointAsync("*", "events"))?.Cursor == "saved", "ACK preceded event/checkpoint commit"); Acks++;
        }
    }
    private static async Task InitialCursorAsync()
    {
        var storage = new CustomerStorage(new MemoryStorageAdapter());
        var first = new Source(storage, "initial"); await first.SyncToStorage(storage, new() { StreamOptions = Options() }).Completion;
        var second = new Source(storage, "saved"); await second.SyncToStorage(storage, new() { StreamOptions = Options("ignored") }).Completion;
        Check(first.Acks == 1 && second.Acks == 1, "Resume changed ACK ordering");
        storage = new CustomerStorage(new MemoryStorageAdapter()); var conflict = new Source(storage, "initial", true);
        try { await conflict.SyncToStorage(storage, new() { StreamOptions = Options() }).Completion; throw new Exception("Concurrent checkpoint overwritten"); }
        catch (StorageCheckpointConflictException) { }
        Check(conflict.Acks == 0 && (await storage.CheckpointAsync("*", "events"))?.Cursor == "other", "CAS failure acknowledged or clobbered checkpoint");
    }
    private static async Task BoundsAsync()
    {
        foreach (var segment in new[] { "x", "🦀", "data: " + new string(' ', 1024) + "\n", ": " + new string('x', 1024) + "\n" })
        {
            var wire = string.Concat(Enumerable.Repeat(segment, Limit / Encoding.UTF8.GetByteCount(segment) + 1));
            using var stop = new CancellationTokenSource(); Exception? failure = null;
            using var handler = new Handler(_ => Task.FromResult(Reply(wire))); using var client = Client(handler);
            var stream = client.Project("p").Events.Stream(Options() with { CancellationToken = stop.Token, OnReconnect = (error, _) => { failure = error; stop.Cancel(); } });
            await foreach (var _ in stream) throw new Exception("Oversized frame delivered");
            Check(failure is PolymorfaServerException { Code: "invalid_stream" } && stream.Cursor == "initial", "Unbounded UTF-8 frame accepted");
        }
        var tail = "\n" + Frame("boundary", ValidPayload); var padding = Limit - Encoding.UTF8.GetByteCount(tail) - 1;
        var exact = ":" + string.Concat(Enumerable.Repeat("🦀", padding / 4)) + new string('x', padding % 4) + tail;
        Check(Encoding.UTF8.GetByteCount(exact) == Limit, "Boundary fixture size");
        using var boundaryHandler = new Handler(_ => Task.FromResult(Reply(exact + exact))); using var boundaryClient = Client(boundaryHandler);
        var count = 0; await foreach (var _ in boundaryClient.Project("p").Events.Stream()) { count++; if (count == 2) break; }
        Check(count == 2, "UTF-8 boundary or frame reset rejected");
    }
}
