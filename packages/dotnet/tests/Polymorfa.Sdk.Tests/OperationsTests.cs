using Polymorfa.Sdk;
using static BillingTests;

internal static class OperationsTests
{
    private const string Operation = "{\"id\":\"op\",\"organizationId\":\"team\",\"projectId\":\"p\",\"kind\":\"session_lifecycle\",\"resource\":{\"type\":\"number\",\"id\":\"s\"},\"status\":\"running\",\"sequence\":2,\"capabilities\":{\"cancellable\":true,\"watchable\":true},\"progress\":{\"code\":\"starting\",\"current\":1,\"total\":2},\"result\":null,\"error\":null,\"actionRequired\":null,\"createdAt\":\"2026-09-22\",\"updatedAt\":\"2026-09-22\",\"completedAt\":null}";
    private const string Transition = "{\"operationId\":\"op\",\"sequence\":2,\"fromStatus\":\"pending\",\"toStatus\":\"running\",\"reasonCode\":null,\"occurredAt\":\"2026-09-22\",\"snapshot\":{\"progress\":{\"code\":\"starting\",\"current\":1,\"total\":2},\"error\":null,\"actionRequired\":null}}";
    private const string Cancel = "{\"data\":{\"operation\":" + Operation + ",\"operationId\":\"op\",\"idempotency\":{\"id\":\"idem\",\"key\":\"key\",\"replayed\":true,\"createdAt\":\"2026-09-22\",\"expiresAt\":\"2026-09-23\"}}}";
    public static async Task RunAsync()
    {
        await Organization("GET", "/platform/operations?status=running&projectId=p", null, "{\"data\":[" + Operation + "],\"page\":{\"nextCursor\":null}}", async c => ResourceTests.Equal((await c.Operations.ListAsync(new(Status: "running", ProjectId: "p"))).Items[0].Progress!.Current, 1L));
        await Organization("GET", "/platform/projects/p/operations?kind=session_lifecycle", null, "{\"data\":[" + Operation + "],\"page\":{\"nextCursor\":null}}", async c => ResourceTests.True((await c.Project("p").Operations.ListAsync(new(Kind: "session_lifecycle"))).Items[0].Capabilities.Watchable));
        await Organization("GET", "/platform/operations/op?wait=30&afterSequence=1&projectId=p", null, "{\"data\":" + Operation + "}", async c => ResourceTests.Equal((await c.Operations.GetAsync("op", new(30, 1, "p"))).Data.Sequence, 2L));
        await Organization("GET", "/platform/projects/p/operations/op", null, "{\"data\":" + Operation + "}", async c => ResourceTests.Equal((await c.Project("p").Operations.GetAsync("op")).Data.Status, "running"));
        await Organization("GET", "/platform/operations/op/transitions?afterSequence=1&limit=2", null, "{\"data\":[" + Transition + "],\"page\":{\"nextCursor\":null}}", async c => ResourceTests.Equal((await c.Operations.ListTransitionsAsync("op", new(AfterSequence: 1, Limit: 2))).Items[0].Snapshot.Progress!.Code, "starting"));
        await Organization("GET", "/platform/projects/p/operations/op/transitions?cursor=next", null, "{\"data\":[" + Transition + "],\"page\":{\"nextCursor\":null}}", async c => ResourceTests.Equal((await c.Project("p").Operations.ListTransitionsAsync("op", new(Cursor: "next"))).Items[0].ToStatus, "running"));
        await Organization("POST", "/platform/operations/op/cancel", null, Cancel, async c => ResourceTests.True((await c.Operations.CancelAsync("op")).Data.Idempotency.Replayed));
        await Organization("POST", "/platform/projects/p/operations/op/cancel", null, Cancel, async c => ResourceTests.Equal((await c.Project("p").Operations.CancelAsync("op", new() { IdempotencyKey = "key" })).Data.Operation.Progress!.Total, 2L));
        await Organization("GET", "/platform/operations/op?wait=0", null, "{\"data\":" + Operation + "}", async c => ResourceTests.Equal((await c.Operations.WaitAsync("op", new() { MaximumWait = TimeSpan.Zero })).Data.Status, "running"));
        await Organization("GET", "/platform/operations/op?wait=30&afterSequence=1", null, "{\"data\":" + Operation + "}", async c => ResourceTests.Equal((await c.Operations.WaitAsync("op", new() { AfterSequence = 1 })).Data.Sequence, 2L));
        await Organization("GET", "/platform/operations/op?wait=30", null, "{\"data\":" + Operation.Replace("\"running\"", "\"succeeded\"") + "}", async c => ResourceTests.Equal((await c.Operations.WaitAsync("op")).Data.Status, "succeeded"));
        using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)));
        try { await client.Operations.GetAsync("op", new(31)); throw new Exception("Invalid long poll accepted."); } catch (PolymorfaConfigurationException) { }
        try { await client.Operations.ListTransitionsAsync("op", new(1, "next")); throw new Exception("Ambiguous transition pagination accepted."); } catch (PolymorfaValidationException) { }
        using var stop = new CancellationTokenSource(); stop.Cancel();
        try { await client.Operations.WaitAsync("op", new() { CancellationToken = stop.Token }); throw new Exception("Cancelled wait sent a request."); } catch (PolymorfaCancelledException) { }
        Console.WriteLine("PASS 8 typed operation routes, bounded long polls, terminal/zero-budget waits and cancellation");
    }
}
