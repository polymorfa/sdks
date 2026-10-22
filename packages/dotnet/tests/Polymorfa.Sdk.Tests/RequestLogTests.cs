using Polymorfa.Sdk;

internal static class RequestLogTests
{
    private const string Key = "pmfa_" + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string Item = "{\"id\":\"log1\",\"projectId\":\"p1\",\"createdAt\":\"2026-10-11T00:00:00Z\",\"method\":\"POST\",\"route\":\"/messaging/:session/messages\",\"status\":200,\"durationMs\":1.234567,\"result\":\"success\",\"source\":\"api\",\"requestId\":\"request1\",\"traceId\":null,\"errorCode\":null,\"mcpTool\":null,\"credential\":{\"type\":\"team_key\",\"id\":\"key1\",\"last4\":\"aaaa\"}}";
    private static string Page(string items = Item, string follow = "follow1") => "{\"data\":[" + items + "],\"page\":{\"hasMore\":false,\"nextCursor\":null,\"followCursor\":\"" + follow + "\"}}";
    public static async Task RunAsync()
    {
        using var wire = new WireFixture { Authorization = "Bearer " + Key };
        using var client = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = wire.Url });
        var serve = wire.ServeAsync("GET", "/platform/projects/p1/request-logs?status=404%2C5xx&method=GET%2CPOST&route=%2Fmessaging%2F%3Asession%2Fmessages&source=api&limit=2", null, Page());
        var page = await client.RequestLogs.ListAsync(new("p1", 2, Filters: new(Status: ["404", "5xx"], Method: ["GET", "POST"], Route: "/messaging/:session/messages", Source: "api"))); await serve;
        ResourceTests.Equal(page.Items[0].DurationMs, 1.234567m); ResourceTests.Equal(page.Items[0].Credential?.Last4, "aaaa"); ResourceTests.Equal(page.Metadata.RequestId, "req_native");
        serve = wire.ServeAsync("GET", "/platform/projects/p1/request-logs?after=follow1&limit=10", null, Page("", "follow2")); page = await client.Project("p1").RequestLogs.FollowAsync(new("follow1", Limit: 10)); await serve; ResourceTests.Equal(page.FollowCursor, "follow2");
        try { await client.RequestLogs.ListAsync(new("p1", Cursor: "cursor", Filters: new(Source: "api"))); throw new Exception("cursor filters accepted"); } catch (PolymorfaValidationException) { }
        try { await client.Project("p1").RequestLogs.ListAsync(new("other")); throw new Exception("project override accepted"); } catch (PolymorfaValidationException) { }
        try { await client.RequestLogs.ListAsync(); throw new Exception("missing project accepted"); } catch (PolymorfaConfigurationException) { }
        serve = wire.ServeAsync("GET", "/platform/projects/p1/request-logs", null, "{\"data\":[],\"page\":{\"hasMore\":false,\"followCursor\":\"f\"}}");
        try { await client.RequestLogs.ListAsync(new("p1")); throw new Exception("malformed page accepted"); } catch (PolymorfaServerException error) { ResourceTests.Equal(error.Metadata?.RequestId, "req_native"); }
        await serve;
        using var cancellation = new CancellationTokenSource();
        var initial = wire.ServeAsync("GET", "/platform/projects/p1/request-logs?limit=1", null, Page());
        await using (var tail = client.RequestLogs.TailAsync(new("p1", Backfill: 1), cancellationToken: cancellation.Token).GetAsyncEnumerator()) { ResourceTests.True(await tail.MoveNextAsync()); await initial; cancellation.Cancel(); ResourceTests.True(!await tail.MoveNextAsync()); }
        ResourceTests.Equal(RequestLogs.RetryAfterMs("0"), 0); ResourceTests.Equal(RequestLogs.RetryAfterMs("999999"), 300000); ResourceTests.Equal(RequestLogs.RetryAfterMs("bad"), 60000); ResourceTests.Equal(RequestLogs.RetryAfterMs("Sun, 11 Oct 2026 00:00:01 GMT", DateTimeOffset.Parse("2026-10-11T00:00:00Z")), 1000);
        Console.WriteLine("PASS native RequestLogs filters, cursor ownership, project confinement, typed values, metadata and tail cancellation");
    }
}
