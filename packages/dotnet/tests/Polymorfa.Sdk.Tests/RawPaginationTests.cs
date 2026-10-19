using System.Text.Json;
using Polymorfa.Sdk;

internal static class RawPaginationTests
{
    private const string Key = "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k";
    private static DecodedRawPage<int> Decode(JsonElement body, ResponseMetadata metadata)
    {
        ResourceTests.Equal(metadata.RequestId, "req_native");
        return new(body.GetProperty("records").EnumerateArray().Select(row => row.GetProperty("n").GetInt32()).ToArray(), body.GetProperty("resume").ValueKind == JsonValueKind.Null ? null : body.GetProperty("resume").GetString());
    }
    public static async Task RunAsync()
    {
        foreach (var owner in new[] { "messaging", "organization", "project" })
        {
            using var fixture = new WireFixture { Authorization = "Bearer " + Key, ExpectedHeaders = new Dictionary<string, string> { ["idempotency-key"] = "raw-key", ["x-custom"] = "retained" } };
            var prefix = owner == "project" ? "/platform/projects/project" : "/" + (owner == "organization" ? "platform" : "messaging");
            var served = Serve();
            using var messaging = new MessagingClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = fixture.Url });
            using var organization = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = fixture.Url });
            using var project = new ProjectClient(Credential.OrganizationApiKey(Key), "project", new() { BaseUrl = fixture.Url });
            using var body = JsonDocument.Parse("{\"scope\":\"fixture\"}");
            var request = new RawRequest(HttpMethod.Post, owner == "project" ? "/raw" : prefix + "/raw", body.RootElement, new() { IdempotencyKey = "raw-key", Headers = new Dictionary<string, string> { ["x-custom"] = "retained" } }, [new("filter", "keep"), new("position", "seed")]);
            var page = owner switch { "messaging" => await messaging.PaginateRawAsync(request, Decode, "position"), "organization" => await organization.PaginateRawAsync(request, Decode, "position"), _ => await project.PaginateRawAsync(request, Decode, "position") };
            body.Dispose(); // Later pages retain their own body snapshot.
            ResourceTests.Equal(page.Items.Count, 0); ResourceTests.True(page.HasMore); ResourceTests.True(page.Response.Data.GetProperty("custom").GetBoolean());
            var rows = new List<int>(); await foreach (var item in page) rows.Add(item); ResourceTests.True(rows.SequenceEqual([1, 2, 3])); await served;
            async Task Serve()
            {
                await fixture.ServeAsync("POST", prefix + "/raw?filter=keep&position=seed", "{\"scope\":\"fixture\"}", """{"records":[],"resume":"next /+","custom":true}""");
                await fixture.ServeAsync("POST", prefix + "/raw?filter=keep&position=next%20%2F%2B", "{\"scope\":\"fixture\"}", """{"records":[{"n":1},{"n":2}],"resume":"last"}""");
                await fixture.ServeAsync("POST", prefix + "/raw?filter=keep&position=last", "{\"scope\":\"fixture\"}", """{"records":[{"n":3}],"resume":null}""");
            }
        }
        using var client = new ProjectClient(Credential.OrganizationApiKey(Key), "project", new() { BaseUrl = new("http://127.0.0.1:1") });
        foreach (var path in new[] { "/platform/projects/other/raw", "/platform/%70rojects/other/raw", "/../raw", "/%2e%2e/raw", "//other/raw", "https://other/raw" })
            try { await client.PaginateRawAsync(new(HttpMethod.Get, path), Decode); throw new Exception("Project pagination escaped"); } catch (PolymorfaException) { }
        try { await client.PaginateRawAsync(new(HttpMethod.Get, "/raw", Options: new() { Headers = new Dictionary<string, string> { ["Authorization"] = "Bearer replacement" } }), Decode); throw new Exception("Authorization override accepted"); } catch (PolymorfaException) { }
        using var errorFixture = new WireFixture(); using var organizationClient = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = errorFixture.Url });
        var errorServe = errorFixture.ServeAsync("GET", "/raw", null, "{}");
        try { await organizationClient.PaginateRawAsync<int>(new(HttpMethod.Get, "/raw"), (_, _) => throw new FormatException("Caller decoder rejected the page.")); throw new Exception("Decoder error lost"); } catch (FormatException) { } await errorServe;
        using var cancellation = new CancellationTokenSource(); var cancellationServe = errorFixture.ServeAsync("GET", "/raw", null, """{"records":[],"resume":"next"}""");
        var cancelledPage = await organizationClient.PaginateRawAsync(new(HttpMethod.Get, "/raw", Options: new() { CancellationToken = cancellation.Token }), Decode); await cancellationServe; cancellation.Cancel();
        try { await cancelledPage.NextPageAsync(); throw new Exception("Next page ignored original cancellation"); } catch (PolymorfaCancelledException) { }
        Console.WriteLine("PASS generic raw pagination: custom decoder/cursor, empty pages, request snapshots, all owners, metadata, confinement and cancellation");
    }
}
