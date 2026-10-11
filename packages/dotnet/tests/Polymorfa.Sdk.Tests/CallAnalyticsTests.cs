using Polymorfa.Sdk;

internal static class CallAnalyticsTests
{
    private const string Id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    private const string Disabled = """{"data":{"callSeries":[],"enabled":false,"period":{"start":0,"end":42},"requestVitals":{"requests":4,"failures":1,"errorRate":0.25},"summary":null,"numbers":[],"series":[]}}""";
    private const string Metrics = "# TYPE polymorfa_analytics_enabled gauge\npolymorfa_analytics_enabled 0\n";
    public static async Task RunAsync()
    {
        await Organization("GET", "/platform/calls?direction=inbound&outcome=missed&limit=25", null, """{"data":[{"callId":"c1","projectId":null,"sessionId":"support","direction":"inbound","upstream":"linked_device","outcome":"missed","state":"ended","hasVideo":false,"peerRef":null,"startedAt":"2026-09-22T00:00:00Z","connectedAt":null,"endedAt":"2026-09-22T00:00:10Z","durationSeconds":0,"endReason":"ring_timeout"}],"page":{"nextCursor":null}}""", async c => ResourceTests.Equal((await c.Calls.ListAsync(new(Direction: "inbound", Outcome: "missed", Limit: 25))).Items[0].DurationSeconds, 0m));
        await Organization("GET", "/platform/calls/c1", null, """{"data":{"call":{"callId":"c1","sessionId":"support","projectId":null,"direction":"inbound","state":"ended","live":false,"backend":"linked_device","hasVideo":false,"peerRef":null,"startedAt":"2026-09-22T00:00:00Z","connectedAt":null,"endedAt":"2026-09-22T00:00:10Z","durationSeconds":0,"endReason":{"code":"ring_timeout","label":"No answer"},"answeredBy":null,"exclusive":null},"participants":[{"id":"p1","state":"left","firstSeenAt":"2026-09-22T00:00:00Z","updatedAt":"2026-09-22T00:00:10Z","leftReason":"call_ended"}],"connections":[],"telemetry":{"status":"unknown","source":"media_server","setupMs":null,"ringMs":null,"codec":null,"jitterMs":null,"packetsLost":null,"rttMs":null,"receivedKbps":null,"sentKbps":null},"appReports":{"status":"none","connections":[],"truncated":false},"history":{"events":[],"truncated":false},"correlation":{"callId":"c1","sessionId":"support"}}}""", async c => ResourceTests.Equal((await c.Calls.RetrieveAsync("c1")).Data.Telemetry.JitterMs, null));
        await Organization("GET", "/platform/calls/stats?groupBy=day&timezone=UTC", null, """{"data":{"since":"2026-09-21T00:00:00Z","until":"2026-09-22T00:00:00Z","timezone":"UTC","groupBy":"day","totals":{"calls":2,"answered":1,"missed":1,"declined":0,"failed":0,"inProgress":0,"answerRate":0.5,"totalDurationSeconds":1.5,"averageDurationSeconds":1.5},"groups":[],"groupsTruncated":false,"heatmap":[{"dayOfWeek":1,"hour":0,"calls":2,"answered":1}]}}""", async c => ResourceTests.Equal((await c.Calls.StatsAsync(new(GroupBy: "day", Timezone: "UTC"))).Data.Totals.AnswerRate, 0.5m));
        await Organization("GET", "/platform/calls/export?format=csv&limit=2", null, "callId,outcome\r\nc1,missed\r\n", async c => ResourceTests.Equal((await c.Calls.ExportAsync(new(Limit: 2))).Data.Body, "callId,outcome\r\nc1,missed\r\n"), "text/csv");
        await Organization("GET", "/platform/analytics?start=0&end=42", null, Disabled, async c => ResourceTests.Equal((await c.Analytics.GetAsync(new(Start: 0, End: 42))).Data.RequestVitals.ErrorRate, 0.25m));
        await Organization("GET", "/platform/projects/" + Id + "/analytics?start=0&end=42", null, Disabled, async c => ResourceTests.True(!(await c.Project(Id).Analytics.GetAsync(new(Id, Start: 0, End: 42))).Data.Enabled));
        await Organization("GET", "/platform/analytics/metrics?windowHours=24&segments=false&format=prometheus", null, Metrics, async c => ResourceTests.Equal((await c.Analytics.MetricsAsync(new(WindowHours: 24, Segments: false))).Data, Metrics), "text/plain");
        await Organization("GET", "/platform/projects/" + Id + "/analytics/metrics?format=openmetrics", null, Metrics + "# EOF\n", async c => ResourceTests.True((await c.Project(Id).Analytics.MetricsAsync(new(Format: "openmetrics"))).Data.EndsWith("# EOF\n", StringComparison.Ordinal)), "application/openmetrics-text");
        using var server = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)));
        await Invalid(() => server.Calls.ListAsync(new(Limit: 0))); await Invalid(() => server.Calls.StatsAsync(new(Since: "2026-02-30T00:00:00Z"))); await Invalid(() => server.Calls.RetrieveAsync("with space")); await Invalid(() => server.Project(Id).Calls.ListAsync(new(ProjectId: "other"))); await Invalid(() => server.Analytics.GetAsync(new(Start: 43, End: 42))); await Invalid(() => server.Analytics.MetricsAsync(new(WindowHours: 169))); await Invalid(() => server.Project(Id).Analytics.GetAsync(new(ProjectId: "11111111-2222-3333-4444-555555555555")));
        await RejectContentType(); await ExportCursor();
        Console.WriteLine("PASS typed call records/stats, actual CSV/OpenMetrics, disabled analytics, project guards and export cursor safety");
    }
    private static async Task RejectContentType()
    {
        using var fixture = new WireFixture(); var serve = fixture.ServeAsync("GET", "/platform/calls/export?format=csv", null, "<html>proxy</html>", responseHeaders: new Dictionary<string, string> { ["content-type"] = "text/html" }); using var c = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0 });
        try { await c.Calls.ExportAsync(); throw new Exception("HTML accepted as CSV"); } catch (PolymorfaServerException e) { ResourceTests.Equal(e.Code, "invalid_response"); }
        await serve;
    }
    private static async Task ExportCursor()
    {
        using var fixture = new WireFixture(); using var c = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0 });
        var serve = fixture.ServeAsync("GET", "/platform/calls/export?format=csv", null, "callId\r\nc1\r\n", responseHeaders: new Dictionary<string, string> { ["content-type"] = "text/csv", ["polymorfa-next-cursor"] = "cursor1" }); await using var pages = c.Calls.ExportAllAsync().GetAsyncEnumerator(); ResourceTests.True(await pages.MoveNextAsync()); ResourceTests.Equal(pages.Current, "callId\r\nc1\r\n"); await serve;
        serve = fixture.ServeAsync("GET", "/platform/calls/export?format=csv&cursor=cursor1", null, "callId\r\nc1\r\n", responseHeaders: new Dictionary<string, string> { ["content-type"] = "text/csv", ["polymorfa-next-cursor"] = "cursor1" }); try { await pages.MoveNextAsync(); throw new Exception("Repeated page yielded"); } catch (PolymorfaServerException e) { ResourceTests.Equal(e.Code, "invalid_response"); }
        await serve;
    }
    private static async Task Invalid(Func<Task> invoke) { try { await invoke(); } catch (PolymorfaException e) when (e is PolymorfaConfigurationException or PolymorfaValidationException) { return; } throw new Exception("Invalid filter accepted."); }
    private static async Task Organization(string method, string path, string? body, string response, Func<OrganizationClient, Task> invoke, string contentType = "application/json")
    {
        var key = "pmfa_" + new string('a', 72); using var fixture = new WireFixture { Authorization = "Bearer " + key }; var serve = fixture.ServeAsync(method, path, body, response, responseHeaders: new Dictionary<string, string> { ["content-type"] = contentType }); using var c = new OrganizationClient(Credential.OrganizationApiKey(key), new() { BaseUrl = fixture.Url, Timeout = TimeSpan.FromSeconds(3), MaxNetworkRetries = 0 }); try { await invoke(c); await serve; } catch { await serve; throw; }
    }
}
