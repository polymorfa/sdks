using Polymorfa.Sdk;
using System.Text.Json;

internal static class MediaApiTests
{
    public static async Task RunAsync()
    {
        await Messaging("GET", "/messaging/media/media1/info", null, """{"success":true,"data":{"id":"media1","session":"support","messageId":"m1","mimeType":"audio/ogg","fileLength":9007199254740993,"persisted":true,"s3Url":"https://storage.example/once"}}""", async c => ResourceTests.Equal((await c.Media.RetrieveAsync("media1")).Data.Data.FileLength, 9007199254740993L));
        await Messaging("POST", "/messaging/media/media1/download-and-save", null, """{"success":true}""", async c => ResourceTests.True((await c.Media.PersistAsync("media1")).Data.Success));
        await Organization("GET", "/platform/media/media1", null, """{"data":{"id":"media1","state":"ready"}}""", async c => ResourceTests.Equal((await c.Media.RetrieveAsync("media1")).Data.Data.GetProperty("state").GetString(), "ready"));
        await Organization("DELETE", "/platform/media/media1", null, """{"data":{"deleted":true}}""", async c => ResourceTests.True((await c.Media.DeleteAsync("media1")).Data.Data.GetProperty("deleted").GetBoolean()));
        await Organization("POST", "/platform/media/uploads", """{"filename":"voice.ogg","contentType":"audio/ogg"}""", """{"data":{"uploadId":"up1","url":"https://storage.example/once"}}""", async c => ResourceTests.Equal((await c.Media.CreateUploadAsync(JsonSerializer.SerializeToElement(new { filename = "voice.ogg", contentType = "audio/ogg" }))).Data.Data.GetProperty("uploadId").GetString(), "up1"));
        await DirectMedia(); await StoredHistoryMedia(); await RedirectIsolation(); await DownloadUrl(); await InvalidRedirect(); await CancelledRead();
        Console.WriteLine("PASS media API paths, native binary/history downloads, credential-free redirect chain, URL expiry and cancellation");
    }
    private static Task Messaging(string method, string path, string? body, string response, Func<MessagingClient, Task> invoke) => ResourceTests.Messaging(method, path, body, response, invoke);
    private static Task Organization(string method, string path, string? body, string response, Func<OrganizationClient, Task> invoke) => BillingTests.Organization(method, path, body, response, invoke);
    private static MessagingClient Client(WireFixture fixture) => new(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0, Timeout = TimeSpan.FromSeconds(3) });
    private static async Task DirectMedia()
    {
        using var fixture = new WireFixture(); var serving = fixture.ServeAsync("GET", "/messaging/media/media1", null, "\0\u0001\u0002", responseHeaders: new Dictionary<string, string> { ["content-type"] = "audio/ogg", ["content-disposition"] = "attachment; filename*=UTF-8''voice%20note.ogg" });
        using var client = Client(fixture); await using var download = await client.Media.DownloadStreamAsync("media1");
        ResourceTests.Equal(download.ContentType, "audio/ogg"); ResourceTests.Equal(download.ContentLength, 3L); ResourceTests.Equal(download.Filename, "voice note.ogg"); ResourceTests.True(!download.Redirected); ResourceTests.True((await download.ReadAllAsync()).SequenceEqual(new byte[] { 0, 1, 2 })); await serving;
    }
    private static async Task StoredHistoryMedia()
    {
        using var fixture = new WireFixture(); var serving = fixture.ServeAsync("GET", "/messaging/support/chats/peer/messages/m1/media", null, "\0\u0001\u0002", responseHeaders: new Dictionary<string, string> { ["content-type"] = "image/png" });
        using var client = Client(fixture); var response = await client.Chats.DownloadMessageMediaAsync("support", "peer", "m1"); ResourceTests.True(response.Data.SequenceEqual(new byte[] { 0, 1, 2 })); ResourceTests.Equal(response.Metadata.RequestId, "req_native"); await serving;
    }
    private static async Task RedirectIsolation()
    {
        using var api = new WireFixture { RequiredHeaders = ["authorization", "x-private", "idempotency-key"] };
        using var storage = new WireFixture { AbsentHeaders = ["authorization", "cookie", "x-private", "idempotency-key", "polymorfa-version"] };
        using var destination = new WireFixture { AbsentHeaders = ["authorization", "cookie", "x-private", "idempotency-key", "polymorfa-version"] };
        var servingApi = api.ServeAsync("GET", "/messaging/media/media1", null, "", 302, new Dictionary<string, string> { ["location"] = new Uri(storage.Url, "/asset?signature=fixture").ToString(), ["set-cookie"] = "operator=secret; Path=/" });
        var servingStorage = storage.ServeAsync("GET", "/asset?signature=fixture", null, "", 307, new Dictionary<string, string> { ["location"] = new Uri(destination.Url, "/object").ToString(), ["set-cookie"] = "storage=secret; Path=/" });
        var servingDestination = destination.ServeAsync("GET", "/object", null, "\0\u0001\u0002", responseHeaders: new Dictionary<string, string> { ["content-type"] = "application/octet-stream" });
        using var client = Client(api); var r = await client.Media.DownloadAsync("media1", new() { IdempotencyKey = "fixture-key", Headers = new Dictionary<string, string> { ["x-private"] = "fixture" } }); ResourceTests.True(r.Data.SequenceEqual(new byte[] { 0, 1, 2 })); ResourceTests.Equal(r.Metadata.Status, 302); await Task.WhenAll(servingApi, servingStorage, servingDestination);
    }
    private static async Task DownloadUrl()
    {
        using var fixture = new WireFixture(); var serving = fixture.ServeAsync("GET", "/messaging/media/media1", null, "", 302, new Dictionary<string, string> { ["location"] = "https://storage.example/once?X-Amz-Date=20260922T000000Z&X-Amz-Expires=60" });
        using var client = Client(fixture); var url = await client.Media.DownloadUrlAsync("media1"); ResourceTests.True(!url.Streamed); ResourceTests.Equal(url.ExpiresAt, DateTimeOffset.Parse("2026-09-22T00:01:00Z")); ResourceTests.True(!url.ToString().Contains("/once")); await serving;
    }
    private static async Task InvalidRedirect()
    {
        using var fixture = new WireFixture(); var serving = fixture.ServeAsync("GET", "/messaging/media/media1", null, "", 302, new Dictionary<string, string> { ["location"] = "https://user:password@storage.example/file" }); using var client = Client(fixture);
        try { await client.Media.DownloadAsync("media1"); throw new Exception("Unsafe storage redirect accepted"); } catch (PolymorfaException e) { ResourceTests.Equal(e.Code, "invalid_redirect"); } await serving;
    }
    private static async Task CancelledRead()
    {
        using var fixture = new WireFixture(); using var cancelled = new CancellationTokenSource(); var serving = fixture.ServeAsync("GET", "/messaging/media/media1", null, "binary"); using var client = Client(fixture); await using var download = await client.Media.DownloadStreamAsync("media1", new() { CancellationToken = cancelled.Token }); cancelled.Cancel();
        try { await download.ReadAllAsync(); throw new Exception("Cancelled media read succeeded"); } catch (PolymorfaCancelledException) { } await serving;
    }
}
