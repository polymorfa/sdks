using Polymorfa.Sdk;

internal static class FunctionTests
{
    private const string Id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    private const string Definition = "{\"id\":\"" + Id + "\",\"projectId\":\"" + Id + "\",\"name\":\"Handler\",\"enabled\":false,\"revision\":2,\"activeDeploymentId\":null,\"createdAt\":\"2026-09-22\",\"updatedAt\":\"2026-09-22\"}";
    private const string Deployment = "{\"id\":\"" + Id + "\",\"functionId\":\"" + Id + "\",\"source\":\"export default {}\",\"language\":\"typescript\",\"region\":\"eu\",\"compatibilityDate\":\"2026-09-22\",\"sha256\":\"abcdef\",\"secretVersionIds\":[],\"egressOrigins\":[],\"createdAt\":\"2026-09-22\"}";
    private const string Secret = "{\"id\":\"" + Id + "\",\"name\":\"API_KEY\",\"createdAt\":\"2026-09-22\",\"revokedAt\":null}";
    private const string Invocation = "{\"id\":\"" + Id + "\",\"functionId\":\"" + Id + "\",\"deploymentId\":\"" + Id + "\",\"outcome\":\"unknown\",\"trigger\":\"http\",\"errorCode\":null,\"durationMs\":null,\"responseBytes\":null,\"attempt\":1,\"createdAt\":\"2026-09-22\",\"completedAt\":null}";
    public static async Task RunAsync()
    {
        await Organization("GET", "/platform/functions?limit=2&projectId=" + Id, null, Page(Definition), async c => ResourceTests.Equal((await c.Project(Id).Functions.ListAsync(new(2))).Data.Items[0].Revision, 2L));
        await Organization("POST", "/platform/functions", "{\"name\":\"Handler\",\"functionId\":\"" + Id + "\",\"projectId\":\"" + Id + "\"}", Envelope(Definition), async c => ResourceTests.True(!(await c.Project(Id).Functions.CreateAsync(new("Handler", Id))).Data.Enabled));
        await Organization("GET", "/platform/functions/" + Id, null, Envelope(Definition), async c => ResourceTests.Equal((await c.Project(Id).Functions.RetrieveAsync(Id)).Data.Name, "Handler"));
        await Organization("PATCH", "/platform/functions/" + Id, "{\"expectedRevision\":1,\"enabled\":false,\"projectId\":\"" + Id + "\"}", Envelope(Definition), async c => ResourceTests.Equal((await c.Project(Id).Functions.UpdateAsync(Id, new(1, Enabled: false))).Data.Revision, 2L));
        await Organization("DELETE", "/platform/functions/" + Id + "?expectedRevision=1&projectId=" + Id, null, "{\"data\":{\"ok\":true}}", async c => ResourceTests.True((await c.Project(Id).Functions.DeleteAsync(Id, 1)).Data.Ok));
        await Organization("GET", "/platform/functions/" + Id + "/deployments", null, Page(Deployment), async c => ResourceTests.Equal((await c.Project(Id).Functions.Deployments.ListAsync(Id)).Data.Items[0].Sha256, "abcdef"));
        await Organization("POST", "/platform/functions/" + Id + "/deployments", "{\"deploymentId\":\"" + Id + "\",\"source\":\"export default {}\",\"language\":\"typescript\",\"region\":\"eu\",\"compatibilityDate\":\"2026-09-22\",\"secretVersionIds\":[],\"egressOrigins\":[],\"projectId\":\"" + Id + "\"}", Envelope(Deployment), async c => ResourceTests.Equal((await c.Project(Id).Functions.Deployments.CreateAsync(Id, new(Id, "export default {}", "typescript", "eu", "2026-09-22", [], []))).Data.Source, "export default {}"));
        await Organization("GET", "/platform/functions/" + Id + "/deployments/" + Id, null, Envelope(Deployment), async c => ResourceTests.Equal((await c.Project(Id).Functions.Deployments.RetrieveAsync(Id, Id)).Data.Language, "typescript"));
        await Organization("PUT", "/platform/functions/" + Id + "/promotion", "{\"deploymentId\":\"" + Id + "\",\"expectedRevision\":1,\"projectId\":\"" + Id + "\"}", Envelope(Definition), async c => ResourceTests.Equal((await c.Project(Id).Functions.Deployments.PromoteAsync(Id, new(Id, 1))).Data.Id, Id));
        await Organization("GET", "/platform/functions/" + Id + "/secrets", null, Page(Secret), async c => ResourceTests.Equal((await c.Project(Id).Functions.Secrets.ListAsync(Id)).Data.Items[0].RevokedAt, null));
        await Organization("POST", "/platform/functions/" + Id + "/secrets", "{\"name\":\"API_KEY\",\"value\":\"fixture-secret\",\"projectId\":\"" + Id + "\"}", Envelope(Secret), async c => ResourceTests.Equal((await c.Project(Id).Functions.Secrets.CreateAsync(Id, new("API_KEY", "fixture-secret"))).Data.Name, "API_KEY"));
        await Organization("DELETE", "/platform/functions/" + Id + "/secrets/" + Id, null, "{\"data\":{\"ok\":true}}", async c => ResourceTests.True((await c.Project(Id).Functions.Secrets.RevokeAsync(Id, Id)).Data.Ok));
        await Organization("GET", "/platform/functions/" + Id + "/invocations", null, Page(Invocation), async c => ResourceTests.Equal((await c.Project(Id).Functions.Invocations.ListAsync(Id)).Data.Items[0].Outcome, "unknown"));
        await Organization("GET", "/platform/functions/" + Id + "/invocations/" + Id, null, Envelope(Invocation), async c => ResourceTests.Equal((await c.Project(Id).Functions.Invocations.RetrieveAsync(Id, Id)).Data.Attempt, 1));
        await Organization("POST", "/platform/functions/" + Id + "/invocations", "{\"request\":{\"method\":\"POST\",\"url\":\"https://function.polymorfa.invalid/form\",\"headers\":{},\"bodyBase64\":\"e30=\"},\"projectId\":\"" + Id + "\"}", "{\"data\":{\"receipt\":" + Invocation + ",\"replayed\":false,\"responseRetained\":false,\"retryable\":false,\"response\":{\"status\":200,\"headers\":{},\"bodyBase64\":\"e30=\"}}}", async c => ResourceTests.Equal((await c.Project(Id).Functions.Invocations.CreateAsync(Id, new(new("POST", "https://function.polymorfa.invalid/form", new Dictionary<string, string>(), "e30=")), new() { IdempotencyKey = "invoke-key" })).Data.Response!.BodyBase64, "e30="));
        using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72))); var functions = client.Project(Id).Functions;
        try { await functions.UpdateAsync(Id, new(0)); throw new Exception("Invalid revision accepted"); } catch (PolymorfaValidationException) { }
        try { await functions.RetrieveAsync(Id.ToUpperInvariant()); throw new Exception("Noncanonical identifier accepted"); } catch (PolymorfaValidationException) { }
        try { await functions.Invocations.CreateAsync(Id, new(new("GET", "https://function.polymorfa.invalid", new Dictionary<string, string>(), "")), new()); throw new Exception("Invocation missing identity"); } catch (PolymorfaValidationException) { }
        await OneAttempt();
        Console.WriteLine("PASS all 15 Functions methods, immutable project, write-only secrets, revision and invocation guards, one-attempt writes");
    }
    private static string Envelope(string value) => "{\"data\":" + value + "}";
    private static string Page(string value) => "{\"data\":{\"items\":[" + value + "],\"nextCursor\":null}}";
    private static Task Organization(string method, string path, string? body, string response, Func<OrganizationClient, Task> invoke)
    {
        if (method is "GET" or "DELETE")
            path += (path.Contains('?') ? "&" : "?") + (path.Contains("projectId=") ? "" : "projectId=" + Id);
        if (path.EndsWith('&')) path = path[..^1];
        return BillingTests.Organization(method, path, body, response, invoke);
    }
    private static async Task OneAttempt()
    {
        using var fixture = new WireFixture(); var serving = fixture.ServeAsync("POST", "/platform/functions", "{\"name\":\"Handler\",\"projectId\":\"" + Id + "\"}", "{\"error\":{\"code\":\"provider_unavailable\",\"message\":\"Unavailable\"}}", 503); using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new() { BaseUrl = fixture.Url });
        try { await client.Project(Id).Functions.CreateAsync(new("Handler"), new() { IdempotencyKey = "create", MaxNetworkRetries = 3 }); throw new Exception("Expected provider rejection"); } catch (PolymorfaServerException e) { ResourceTests.Equal(e.Metadata!.Attempts, 1); }
        await serving;
    }
}
