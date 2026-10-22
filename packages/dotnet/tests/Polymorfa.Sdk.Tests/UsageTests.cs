using Polymorfa.Sdk;
using System.Text.Json;

internal static class UsageTests
{
    private const string Record = """{"id":"u1","meter":"call.duration","quantity":1.123456,"unit":"second","dimensions":{"direction":"inbound","connections":2,"video":false},"keySource":"none","sourceKind":"call","sourceId":"call1","projectId":"p1","session":"support","occurredAt":"2026-09-22T00:00:00Z","recordedAt":"2026-09-22T00:00:01Z","revision":2,"pricingState":"unpriced","rateCard":null,"pricedCredits":null}""";
    public static async Task RunAsync()
    {
        await Organization("GET", "/platform/usage?projectId=p1&session=support&period=2026-09", null, """{"data":{"period":"2026-09","start":"2026-09-01","end":"2026-10-01","projectId":"p1","session":"support","billingEnabled":false,"meters":[{"meter":"call.duration","unit":"second","keySource":"none","quantity":1.123456,"records":1}],"numbers":[],"numbersTruncated":false}}""", async c => ResourceTests.Equal((await c.Usage.SummaryAsync(new("p1", "support", "2026-09"))).Data.Meters[0].Quantity, 1.123456m));
        await Organization("GET", "/platform/usage/records?session=support&callId=call1&meter=call.duration&limit=2", null, "{\"data\":{\"records\":[" + Record + "],\"nextCursor\":null}}", async c => { var r = (await c.Usage.ListRecordsAsync(new(Session: "support", CallId: "call1", Meter: "call.duration", Limit: 2))).Data.Records[0]; ResourceTests.Equal(r.Revision, 2L); ResourceTests.True(!r.Dimensions["video"].GetBoolean()); });
        await Organization("GET", "/platform/gates?session=support", null, """{"data":{"session":"support","gates":[{"key":"calls.outbound_monthly","kind":"quota","subject":"number","mode":"record","active":false,"limit":null,"used":null,"unit":"minute","overLimit":null,"decisions":{"wouldBlock":2,"blocked":0,"evaluationError":1}}]}}""", async c => ResourceTests.Equal((await c.Usage.ListGatesAsync(new(Session: "support"))).Data.Gates[0].Decisions.EvaluationError, 1L));
        await Organization("GET", "/platform/optouts", null, """{"data":{"contacts":[]}}""", async c => ResourceTests.Equal((await c.OptOuts.ListAsync()).Data.Data.GetProperty("contacts").GetArrayLength(), 0));
        await Organization("POST", "/platform/optouts", """{"phone":"+15550001111"}""", """{"data":{"created":true}}""", async c => ResourceTests.True((await c.OptOuts.CreateAsync(JsonSerializer.SerializeToElement(new { phone = "+15550001111" }))).Data.Data.GetProperty("created").GetBoolean()));
        await Organization("POST", "/platform/optouts/batch", """{"phones":["+15550001111"]}""", """{"data":{"created":1}}""", async c => ResourceTests.Equal((await c.OptOuts.CreateBatchAsync(JsonSerializer.SerializeToElement(new { phones = new[] { "+15550001111" } }))).Data.Data.GetProperty("created").GetInt32(), 1));
        await Organization("DELETE", "/platform/optouts/%2B15550001111", null, """{"data":{"deleted":true}}""", async c => ResourceTests.True((await c.OptOuts.DeleteAsync("+15550001111")).Data.Data.GetProperty("deleted").GetBoolean()));
        await Organization("GET", "/platform/optouts/settings", null, """{"data":{"enabled":false,"optOutKeywords":["STOP"],"optInKeywords":["START"],"updatedAt":null}}""", async c => ResourceTests.True(!(await c.OptOuts.GetSettingsAsync()).Data.Data.Enabled));
        await Organization("PUT", "/platform/optouts/settings", """{"enabled":false,"optOutKeywords":["STOP"],"optInKeywords":["START"]}""", """{"data":{"enabled":false,"optOutKeywords":["STOP"],"optInKeywords":["START"],"updatedAt":100}}""", async c => ResourceTests.Equal((await c.OptOuts.UpdateSettingsAsync(new(false, ["STOP"], ["START"]))).Data.Data.UpdatedAt, 100L));
        await BoundProject(); await RepeatedCursor();
        Console.WriteLine("PASS typed usage reads, decimal precision, bound project, cursor repetition and six opt-out APIs");
    }
    private static Task Organization(string method, string path, string? body, string response, Func<OrganizationClient, Task> invoke) => BillingTests.Organization(method, path, body, response, invoke);
    private static async Task BoundProject()
    {
        using var fixture = new WireFixture(); var serving = fixture.ServeAsync("GET", "/platform/usage/records?session=support&projectId=p1", null, "{\"data\":{\"records\":[" + Record + "],\"nextCursor\":null}}");
        using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new() { BaseUrl = fixture.Url });
        ResourceTests.Equal((await client.Project("p1").Usage.ListRecordsAsync(new(ProjectId: "p2", Session: "support"))).Data.Records[0].Quantity, 1.123456m); await serving;
    }
    private static async Task RepeatedCursor()
    {
        using var fixture = new WireFixture();
        var serving = Serve();
        using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new() { BaseUrl = fixture.Url });
        var count = 0;
        try { await foreach (var _ in client.Usage.IterateRecordsAsync()) count++; throw new Exception("Repeated cursor accepted"); }
        catch (PolymorfaServerException e) { ResourceTests.Equal(e.Code, "invalid_response"); ResourceTests.Equal(count, 1); ResourceTests.Equal(e.RequestId, "req_native"); }
        await serving;
        async Task Serve() { await fixture.ServeAsync("GET", "/platform/usage/records", null, "{\"data\":{\"records\":[" + Record + "],\"nextCursor\":\"same\"}}"); await fixture.ServeAsync("GET", "/platform/usage/records?cursor=same", null, "{\"data\":{\"records\":[" + Record + "],\"nextCursor\":\"same\"}}"); }
    }
}
