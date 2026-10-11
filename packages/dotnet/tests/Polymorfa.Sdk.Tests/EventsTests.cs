using Polymorfa.Sdk;
using static BillingTests;

internal static class EventsTests
{
    private const string Key = "pmfa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string Event = "{\"id\":\"evt\",\"organizationId\":\"team\",\"projectId\":\"p\",\"type\":\"message.received\",\"source\":\"runtime\",\"environment\":\"development\",\"createdAt\":\"2026-09-22\",\"payloadAvailability\":\"not_retained\",\"payload\":null,\"replayableUntil\":null,\"metadataExpiresAt\":\"2026-10-22\"}";
    private const string Replay = "{\"data\":{\"eventId\":\"evt\",\"deliveryId\":\"delivery\",\"operationId\":\"op\",\"idempotency\":{\"id\":\"idem\",\"key\":\"key\",\"replayed\":false,\"createdAt\":\"2026-09-22\",\"expiresAt\":\"2026-09-23\"}}}";
    public static async Task RunAsync()
    {
        await Organization("GET", "/platform/events?type=message.received&limit=2", null, "{\"data\":[" + Event + "],\"page\":{\"nextCursor\":null,\"hasMore\":false}}", async c => ResourceTests.Equal((await c.Events.ListAsync(new(Type: "message.received", Limit: 2))).Items[0].Id, "evt"));
        await Organization("GET", "/platform/projects/p/events", null, "{\"data\":[" + Event + "],\"page\":{\"nextCursor\":null}}", async c => ResourceTests.Equal((await c.Project("p").Events.ListAsync()).Items[0].ProjectId, "p"));
        await Organization("GET", "/platform/events/evt?includePayload=true", null, "{\"data\":" + Event + "}", async c => ResourceTests.Equal((await c.Events.RetrieveAsync("evt", new(true))).Data.PayloadAvailability, "not_retained"));
        await Organization("GET", "/platform/projects/p/events/evt", null, "{\"data\":" + Event + "}", async c => ResourceTests.Equal((await c.Project("p").Events.RetrieveAsync("evt")).Data.MetadataExpiresAt, "2026-10-22"));
        await Organization("POST", "/platform/events/evt/replays", "{\"webhookId\":\"webhook\"}", Replay, async c => ResourceTests.Equal((await c.Events.ReplayAsync("evt", new("webhook"))).Data.OperationId, "op"));
        await Organization("POST", "/platform/projects/p/events/evt/replays", "{\"webhookId\":\"webhook\"}", Replay, async c => ResourceTests.Equal((await c.Project("p").Events.ReplayAsync("evt", new("webhook"))).Data.Idempotency.Replayed, false));
        await Organization("POST", "/platform/projects/p/events/stream/stream/ack", "{\"cursor\":\"cursor\",\"sequence\":2}", "{\"data\":{\"streamId\":\"stream\",\"acknowledgedCursor\":\"cursor\",\"sequence\":2,\"replayed\":true}}", async c => ResourceTests.True((await c.Events.AcknowledgeStreamAsync("stream", new("cursor", 2), projectId: "p")).Data.Replayed));
        await PaginationAsync();
        await StreamAsync();
        await Organization("GET", "/platform/events?afterOffset=0", null, "{\"data\":[],\"page\":{\"hasMore\":true,\"highWatermark\":\"10\",\"nextOffset\":\"0\"}}", async c => { try { await c.Events.ListIndexedAsync(new("0")); } catch (PolymorfaServerException e) when (e.Code == "invalid_response") { return; } throw new Exception("Non-advancing offset accepted."); });
        await Organization("GET", "/platform/events?afterOffset=0", null, "{\"data\":[],\"page\":{\"hasMore\":false,\"highWatermark\":\"10\",\"nextOffset\":\"3\"}}", async c => { try { await c.Events.ListIndexedAsync(new("0")); } catch (PolymorfaServerException e) when (e.Code == "invalid_response") { return; } throw new Exception("Terminal indexed metadata accepted offset."); });
        Console.WriteLine("PASS typed event reads/replays/acknowledgement, pagination and native fragmented SSE resume");
    }
    private static async Task PaginationAsync()
    {
        using var fixture = new WireFixture { Authorization = "Bearer " + Key };
        async Task Serve()
        {
            await fixture.ServeAsync("GET", "/platform/events?type=message.received&limit=2", null, "{\"data\":[" + Event + "],\"page\":{\"nextCursor\":\"next\"}}");
            await fixture.ServeAsync("GET", "/platform/events?type=message.received&limit=2&cursor=next", null, "{\"data\":[" + Event + "],\"page\":{\"nextCursor\":null}}");
            await fixture.ServeAsync("GET", "/platform/projects/p/events?afterOffset=0&type=message.received&limit=2", null, "{\"data\":[" + Event + "],\"page\":{\"hasMore\":true,\"highWatermark\":\"10\",\"nextOffset\":\"3\",\"nextCursor\":null}}");
            await fixture.ServeAsync("GET", "/platform/projects/p/events?afterOffset=3&type=message.received&limit=2", null, "{\"data\":[" + Event + "],\"page\":{\"hasMore\":false,\"highWatermark\":\"10\",\"nextOffset\":null,\"nextCursor\":null}}");
        }
        var serving = Serve(); using var client = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0 });
        var page = await client.Events.ListAsync(new(Type: "message.received", Limit: 2));
        var total = 0; await foreach (var item in page) { ResourceTests.Equal(item.Id, "evt"); total++; }
        ResourceTests.Equal(total, 2);
        var indexed = await client.Project("p").Events.ListIndexedAsync(new("0", "message.received", 2));
        ResourceTests.Equal(indexed.NextOffset, "3"); total = 0; await foreach (var item in indexed) total++;
        ResourceTests.Equal(total, 2); await serving;
    }
    private static async Task StreamAsync()
    {
        using var fixture = new WireFixture { Authorization = "Bearer " + Key, FragmentBytes = 7 };
        async Task Serve()
        {
            await fixture.ServeAsync("GET", "/platform/projects/p/events/stream?types=message.received&ack=manual", null,
                "data: {\"type\":\"ready\",\"heartbeatIntervalMs\":1000}\n\ndata: {\"type\":\"event\",\"event\":" + Event + ",\"cursor\":\"cursor1\",\"streamId\":\"stream\",\"sequence\":1}\n\ndata: {\"type\":\"checkpoint\",\"cursor\":\"checkpoint\"}\n\ndata: {\"type\":\"gap\",\"reason\":\"retention_exceeded\",\"missedEvents\":2}\n\ndata: {\"type\":\"expiry\"}\n\n", responseHeaders: new Dictionary<string, string> { ["content-type"] = "text/event-stream" });
            await fixture.ServeAsync("GET", "/platform/projects/p/events/stream?types=message.received&ack=manual", null,
                "data: {\"type\":\"event\",\"event\":" + Event + ",\"cursor\":\"cursor2\",\"streamId\":\"stream\",\"sequence\":2}\n\ndata: {\"type\":\"revoked\"}\n\n", responseHeaders: new Dictionary<string, string> { ["content-type"] = "text/event-stream" }, expectedHeaders: new Dictionary<string, string> { ["last-event-id"] = "checkpoint" });
        }
        var serving = Serve(); using var client = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0 });
        var missed = 0L; var reconnects = 0;
        var stream = client.Project("p").Events.Stream(new() { Types = ["message.received"], ManualAcknowledgement = true, InitialReconnectDelay = TimeSpan.FromMilliseconds(1), MaximumReconnectDelay = TimeSpan.FromMilliseconds(2), OnGap = gap => missed = gap.MissedEvents, OnReconnect = (_, _) => reconnects++ });
        var count = 0;
        try { await foreach (var item in stream) { count++; ResourceTests.Equal(item.StreamId, "stream"); } }
        catch (PolymorfaAuthorizationException error) when (error.Code == "stream_revoked") { }
        ResourceTests.Equal(count, 2); ResourceTests.Equal(missed, 2L); ResourceTests.Equal(reconnects, 1); ResourceTests.Equal(stream.Cursor, "cursor2"); await serving;
    }
}
