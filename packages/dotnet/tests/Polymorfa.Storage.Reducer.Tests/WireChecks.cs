using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;
using Polymorfa.Sdk.Storage;

internal static class WireChecks
{
    private const string Key = "pmfa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static string Frame(bool payload = true)
    {
        var body = Encoding.UTF8.GetBytes("{\"id\":\"wire-event\",\"session\":\"wire\",\"timestamp\":\"2026-10-01T12:00:00Z\",\"event\":\"message.received\",\"payload\":{\"id\":\"wire-message\",\"conversation\":{\"id\":\"wire-chat\"},\"timestamp\":1790856000,\"type\":\"text\",\"text\":\"native TCP\"}}");
        var record = new EventRecord("wire-event", "org", "bound", "message.received", "runtime", "development", "2026-10-01", payload ? "available" : "not_retained", payload ? new("base64", Convert.ToBase64String(body)) : null, null, "2026-10-15");
        return "data: {\"type\":\"ready\",\"heartbeatIntervalMs\":1000}\n\ndata: " + JsonSerializer.Serialize(new { type = "event", @event = record, cursor = "wire-cursor", streamId = "wire-stream", sequence = 1 }, Json) + "\n\n";
    }
    internal static async Task Run()
    {
        var memory = new MemoryStorageAdapter(); var storage = new CustomerStorage(memory); var requests = 0;
        using var fixture = new WireFixture
        {
            Authorization = "Bearer " + Key,
            FragmentBytes = 7,
            AbsentHeaders = ["origin", "cookie", "Polymorfa-Storage-Authority"],
            ExpectedHeaders = new Dictionary<string, string> { ["Polymorfa-Version"] = "2026-09-22" },
            BeforeResponse = async () =>
            {
                if (Interlocked.Increment(ref requests) % 2 == 0 && (!await storage.HasEventAsync("wire", "wire-event") || (await storage.CheckpointAsync("*", "events"))?.Cursor != "wire-cursor")) throw new Exception("HTTP ACK arrived before durable event and cursor.");
            }
        };
        using var client = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0 });
        for (var replay = 0; replay < 2; replay++)
        {
            var headers = replay == 0 ? null : new Dictionary<string, string> { ["last-event-id"] = "wire-cursor" };
            async Task Serve()
            {
                await fixture.ServeAsync("GET", "/platform/projects/bound/events/stream?types=message.received&ack=manual", null, Frame(), responseHeaders: new Dictionary<string, string> { ["content-type"] = "text/event-stream" }, expectedHeaders: headers);
                await fixture.ServeAsync("POST", "/platform/projects/bound/events/stream/wire-stream/ack", "{\"cursor\":\"wire-cursor\",\"sequence\":1}", "{\"data\":{\"streamId\":\"wire-stream\",\"acknowledgedCursor\":\"wire-cursor\",\"sequence\":1,\"replayed\":false}}");
            }
            var serving = Serve(); using var done = new CancellationTokenSource();
            var sync = client.Project("bound").Events.SyncToStorage(storage, new() { StreamOptions = new() { ProjectId = "must-not-escape", Types = ["message.received"] }, CancellationToken = done.Token, OnApplied = (_, result) => { if (result.Applied != (replay == 0)) throw new Exception("Native replay result differs."); done.Cancel(); } });
            var first = await Task.WhenAny(sync.Completion, serving); if (first == serving) await serving; await sync.Completion.WaitAsync(TimeSpan.FromSeconds(10)); await serving; if (memory.Rows(StorageEntity.Messages).Count != 1) throw new Exception("Native replay created duplicate rows.");
        }
        using (var denied = new WireFixture { Authorization = "Bearer " + Key })
        {
            using var deniedClient = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = denied.Url, MaxNetworkRetries = 0 }); var serving = denied.ServeAsync("GET", "/platform/projects/bound/events/stream?types=message.received&ack=manual", null, "{\"error\":{\"code\":\"unauthorized\",\"message\":\"Denied\"}}", 401); var untouched = new CustomerStorage(new MemoryStorageAdapter());
            try { await deniedClient.Project("bound").Events.SyncToStorage(untouched, new() { StreamOptions = new() { Types = ["message.received"] } }).Completion; throw new Exception("HTTP auth denial was ignored."); } catch (PolymorfaAuthenticationException) { }
            await serving; if (denied.Pending || await untouched.CheckpointAsync("*", "events") is not null) throw new Exception("Auth denial advanced the stream.");
        }
        foreach (var gap in new[] { false, true })
        {
            using var denied = new WireFixture { Authorization = "Bearer " + Key }; using var deniedClient = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = denied.Url, MaxNetworkRetries = 0 }); var output = gap ? "data: {\"type\":\"gap\",\"reason\":\"retention_exceeded\",\"missedEvents\":3}\n\n" : Frame(false); var serving = denied.ServeAsync("GET", "/platform/projects/bound/events/stream?types=message.received&ack=manual", null, output, responseHeaders: new Dictionary<string, string> { ["content-type"] = "text/event-stream" }); var untouched = new CustomerStorage(new MemoryStorageAdapter());
            try { await deniedClient.Project("bound").Events.SyncToStorage(untouched, new() { StreamOptions = new() { Types = ["message.received"] } }).Completion; throw new Exception("Native gap/body denial ignored."); } catch (StorageException error) when (gap ? error is StorageStreamGapException : error is StorageValidationException) { }
            await serving; if (denied.Pending || await untouched.CheckpointAsync("*", "events") is not null) throw new Exception("Native gap/body denial advanced cursor or ACK.");
        }
        using (var destination = new WireFixture())
        using (var redirect = new WireFixture { Authorization = "Bearer " + Key })
        {
            using var redirectClient = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = redirect.Url, MaxNetworkRetries = 0 }); var serving = redirect.ServeAsync("GET", "/platform/projects/bound/events/stream?types=message.received&ack=manual", null, "", 302, new Dictionary<string, string> { ["location"] = new Uri(destination.Url, "/credential-sink").ToString() });
            using var limit = new CancellationTokenSource(TimeSpan.FromMilliseconds(150)); var sync = redirectClient.Project("bound").Events.SyncToStorage(new MemoryStorageAdapter(), new() { CancellationToken = limit.Token, StreamOptions = new() { Types = ["message.received"] } }); await sync.Completion.WaitAsync(TimeSpan.FromSeconds(2)); await serving; if (destination.Pending) throw new Exception("Redirect leaked credentials.");
        }
        Console.WriteLine("PASS actual native TCP fragmented SSE→storage→checkpoint→HTTP ACK, project confinement, resume/replay, auth/gap/body denial and redirect isolation");
    }
}
