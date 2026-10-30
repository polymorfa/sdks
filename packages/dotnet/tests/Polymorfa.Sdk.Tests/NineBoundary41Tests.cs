using System.Text.Json;
using Polymorfa.Sdk;
using static CampaignExistingTests;

internal static class NineBoundary41Tests
{
    private sealed record Boundary(string Name, string Method, string Path, string? Body, string Success, int Status, string Version, Func<MessagingClient, OrganizationClient, RequestOptions?, Task> Call);
    internal static async Task RunAsync()
    {
        var hash = Convert.ToBase64String(new byte[32]); var encoded = hash.TrimEnd('=');
        var boundaries = new Boundary[]
        {
            new("group", "GET", "/messaging/s/groups/g/capabilities", null, "{\"success\":true,\"data\":{\"status\":\"synced\",\"syncedAt\":null,\"checkedAt\":null,\"capabilities\":[]}}", 200, "2026-09-22", async (c, _, o) => { await c.Groups.GetCapabilitiesAsync("s", "g", o); }),
            new("phone", "GET", "/messaging/s/phone", null, "{\"session\":\"s\",\"phone\":\"+15550001111\",\"online\":false,\"devices\":[]}", 200, "2026-09-22", async (c, _, o) => { await c.Testing.GetPhoneAsync("s", o); }),
            new("send-phone", "POST", "/messaging/s/phone/messages", "{\"to\":\"to\",\"text\":\"text\"}", "{\"session\":\"s\",\"to\":\"to\",\"messageId\":null}", 202, "2026-09-22", async (c, _, o) => { await c.Testing.SendPhoneMessageAsync("s", new("to", "text"), o); }),
            new("unlink", "POST", "/messaging/s/phone/devices/1/unlink", null, "{\"session\":\"s\",\"deviceId\":1,\"unlinked\":true}", 200, "2026-09-22", async (c, _, o) => { await c.Testing.UnlinkPhoneDeviceAsync("s", 1, o); }),
            new("logs", "GET", "/platform/projects/p/request-logs", null, "{\"data\":[],\"page\":{\"hasMore\":false,\"nextCursor\":null,\"followCursor\":\"f\"}}", 200, "2026-09-22", async (_, c, o) => { await c.RequestLogs.ListAsync(new("p"), o); }),
            new("grant", "POST", "/messaging/s/media/upload-grants", "{\"type\":\"image\",\"fileEncSha256\":\"" + encoded + "\"}", "{\"success\":true,\"data\":{\"host\":\"mmg.whatsapp.net\",\"uploadUrl\":\"https://mmg.whatsapp.net/mms/image/" + encoded + "?auth=synthetic\",\"expiresAt\":2000000000}}", 200, "2026-10-14", async (c, _, o) => { var grant = await c.WhatsAppMedia.CreateUploadGrantAsync("s", WhatsAppUploadMediaType.Image, new byte[32], o); Check(grant.ExpiresAt.ToUnixTimeSeconds() == 2000000000, "Expiry units"); }),
            new("relay", "POST", "/messaging/s/media/uploads?type=image&fileEncSha256=" + encoded, "bytes:AQ==", "{\"success\":true,\"data\":{\"directPath\":\"/x\",\"url\":\"https://mmg.whatsapp.net/x\"}}", 200, "2026-10-14", async (c, _, o) => { using var bytes = new MemoryStream(new byte[] { 1 }); await c.WhatsAppMedia.RelayUploadAsync("s", WhatsAppUploadMediaType.Image, new byte[32], bytes, 1, o); Check(bytes.CanRead, "Borrowed relay input"); }),
            new("retry", "POST", "/messaging/s/history/chunks/retry", "{\"syncType\":\"FULL\",\"chunkOrder\":0}", "{\"success\":true,\"data\":{\"requestId\":\"r\",\"status\":\"requested\"}}", 200, "2026-10-14", async (c, _, o) => { await c.HistorySync.RequestChunkRetryAsync("s", new(HistorySyncType.FULL, 0), o); }),
            new("delete", "POST", "/messaging/s/history/media/delete", "{\"directPath\":\"/x\",\"fileEncSha256\":\"" + hash + "\"}", "{\"success\":true,\"data\":{\"status\":\"deleted\"}}", 200, "2026-10-14", async (c, _, o) => { await c.HistorySync.DeleteChunkAsync("s", new("/x", hash), o); })
        };
        foreach (var b in boundaries)
        {
            foreach (var version in new[] { b.Version, "2026-09-22", "2026-10-14" })
                await Wire(b, b.Success, b.Status, new() { ApiVersion = version }, async call => { await call(); }, version);
            await Wire(b, "{}", b.Status, null, InvalidResponse, b.Version);
            await Wire(b, b.Success, 204, null, InvalidResponse, b.Version);
            await Wire(b, b.Success, b.Status, null, InvalidResponse, b.Version, new Dictionary<string, string> { ["content-type"] = "text/html" });
            foreach (var status in new[] { 401, 409, 422 })
                await Wire(b, "{\"error\":{\"code\":\"future_remote_code\",\"message\":\"Synthetic\",\"param\":\"safe\"}}", status, null, async call => { try { await call(); throw new Exception("Remote error accepted"); } catch (PolymorfaException e) { Check(e.Status == status && e.Code == "future_remote_code" && e.Param == "safe" && e.Metadata!.Headers["x-trace-id"] == "safe" && !e.Metadata.Headers.ContainsKey("set-cookie"), "Nine safe error metadata"); } }, b.Version, new Dictionary<string, string> { ["x-trace-id"] = "safe", ["set-cookie"] = "secret" });
            using var wire = new WireFixture(); using var c = new MessagingClient(Key, Options(wire)); using var org = new OrganizationClient(Key, Options(wire));
            using var stop = new CancellationTokenSource(); stop.Cancel();
            try { await b.Call(c, org, new() { CancellationToken = stop.Token }); throw new Exception("Cancelled seam succeeded"); } catch (PolymorfaCancelledException) { Check(!wire.Pending, "Nine pre-cancel no HTTP"); }
            try { await b.Call(c, org, new() { Timeout = TimeSpan.FromMilliseconds(30) }); throw new Exception("Timeout seam succeeded"); } catch (PolymorfaTimeoutException) { Check(wire.Pending, "Nine timeout preserved outside decoding"); }
        }
        Console.WriteLine("PASS nine41 per-seam exact status/MIME, explicit versions, malformed metadata, remote errors, cancellation and timeout");
    }
    private static async Task Wire(Boundary b, string response, int status, RequestOptions? options, Func<Func<Task>, Task> expectation, string version, IReadOnlyDictionary<string, string>? headers = null)
    {
        using var wire = new WireFixture { AbsentHeaders = ["idempotency-key"], ExpectedHeaders = new Dictionary<string, string> { ["polymorfa-version"] = version } };
        using var c = new MessagingClient(Key, Options(wire)); using var org = new OrganizationClient(Key, Options(wire));
        var serve = wire.ServeAsync(b.Method, b.Path, b.Body, response, status, headers);
        await expectation(() => b.Call(c, org, options)); await serve;
    }
}
