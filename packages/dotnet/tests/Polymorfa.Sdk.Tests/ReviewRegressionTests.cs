using System.Text.Json;
using Polymorfa.Sdk;
internal static class ReviewRegressionTests
{
    internal static async Task RunAsync()
    {
        const string key = "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k";
        foreach (var prefix in new[] { "/proxy", "/proxy/" })
        {
            using var fixture = new WireFixture { Authorization = "Bearer " + key };
            using var client = new MessagingClient(Credential.OrganizationApiKey(key), new() { BaseUrl = new Uri(fixture.Url, prefix), MaxNetworkRetries = 0 });
            var serving = fixture.ServeAsync("GET", "/proxy/probe", null, "{\"ok\":true}");
            ResourceTests.True((await client.RawAsync<JsonElement>(HttpMethod.Get, "/probe")).Data.GetProperty("ok").GetBoolean()); await serving;
            serving = fixture.ServeAsync("GET", "/proxy/messaging/media/m", null, "", 302, new Dictionary<string, string> { ["location"] = "object?capability=fixture" });
            var location = await client.Media.DownloadUrlAsync("m"); ResourceTests.Equal(location.Url!.AbsolutePath, "/proxy/messaging/media/object"); await serving;
        }
        Console.WriteLine("PASS configured API base prefixes and relative download capabilities remain under the proxy path");
    }
}
