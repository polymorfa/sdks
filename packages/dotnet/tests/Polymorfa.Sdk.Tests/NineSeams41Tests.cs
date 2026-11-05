using System.Text.Json;
using Polymorfa.Sdk;
using static Adoption41Fixtures;
using static CampaignExistingTests;

internal static class NineSeams41Tests
{
    internal static async Task RunAsync()
    {
        const string caps = "{\"success\":true,\"data\":{\"status\":\"unknown\",\"syncedAt\":null,\"checkedAt\":null,\"capabilities\":[{\"key\":\"future.key\",\"kind\":\"feature\",\"unit\":null,\"value\":null,\"source\":null},{\"key\":\"boolean\",\"kind\":\"feature\",\"unit\":null,\"value\":false,\"source\":\"server\"}]}}";
        await Messaging("GET", "/messaging/s%2Fone/groups/g%40group/capabilities", null, caps, async c => { var v = (await c.Groups.GetCapabilitiesAsync("s/one", "g@group")).Data.Data; Check(v.Capabilities[0].Value is null && v.Capabilities[1].Value == false && v.CheckedAt is null, "Nullable group facts"); });
        await Messaging("GET", "/messaging/s/groups/g/capabilities", null, caps.Replace("\"unit\":null,", ""), c => InvalidResponse(async () => { await c.Groups.GetCapabilitiesAsync("s", "g"); }));
        const string phone = "{\"session\":\"s\",\"phone\":\"+15550001111\",\"online\":false,\"devices\":[{\"deviceId\":99}]}";
        await Messaging("GET", "/messaging/testing/p/numbers/s/phone", null, phone, async c => Check(!(await c.Testing.GetPhoneAsync("p", "s")).Data.Online, "Phone offline"));
        await Messaging("POST", "/messaging/testing/p/numbers/s/phone/messages", "{\"to\":\"+15550001111\",\"text\":\"Hello\"}", "{\"session\":\"s\",\"to\":\"+15550001111\",\"messageId\":null}", async c => Check((await c.Testing.SendPhoneMessageAsync("p", "s", new("+15550001111", "Hello"))).Data.MessageId is null, "Accepted nullable messageId"), 202);
        await Messaging("POST", "/messaging/testing/p/numbers/s/phone/messages", "{\"to\":\"+15550001111\",\"text\":\"Hello\"}", "{\"session\":\"s\",\"to\":\"+15550001111\"}", c => InvalidResponse(async () => { await c.Testing.SendPhoneMessageAsync("p", "s", new("+15550001111", "Hello")); }), 202);
        await Messaging("POST", "/messaging/testing/p/numbers/s/phone/devices/99/unlink", null, "{\"session\":\"s\",\"deviceId\":99,\"unlinked\":true}", async c => Check((await c.Testing.UnlinkPhoneDeviceAsync("p", "s", 99)).Data.Unlinked, "Unlink99"));
        await Messaging("POST", "/messaging/testing/p/numbers/s/phone/devices/1/unlink", null, "{\"session\":\"s\",\"deviceId\":1,\"unlinked\":false}", c => InvalidResponse(async () => { await c.Testing.UnlinkPhoneDeviceAsync("p", "s", 1); }));
        foreach (var id in new[] { 0, 100 })
        {
            using var c = new MessagingClient(Key); try { await c.Testing.UnlinkPhoneDeviceAsync("p", "s", id); throw new Exception("Invalid unlink accepted"); } catch (PolymorfaValidationException) { Check(true, "Unlink bounds"); }
        }
        const string log = "{\"id\":\"9007199254740993123\",\"projectId\":\"p\",\"createdAt\":\"2026-10-14T00:00:00Z\",\"method\":\"GET\",\"route\":\"/messaging/:session\",\"status\":200,\"durationMs\":0,\"result\":\"success\",\"source\":\"api\",\"requestId\":null,\"traceId\":null,\"errorCode\":null,\"mcpTool\":null,\"credential\":null}";
        foreach (var selected in new[] { Project, "22222222-2222-4222-8222-222222222222", Project })
            await Organization("GET", "/platform/projects/" + selected + "/request-logs?limit=1&cursor=next", null, "{\"data\":[" + log + "],\"page\":{\"hasMore\":false,\"nextCursor\":null,\"followCursor\":\"f\"}}", async c => { using var p = c.Project(selected); var r = await p.RequestLogs.ListAsync(new(Limit: 1, Cursor: "next")); Check(r.Items[0].Id == "9007199254740993123" && r.Items[0].TraceId is null, "Log identity/owner"); });
        foreach (var kind in Enum.GetValues<HistorySyncType>())
            foreach (var order in new uint[] { 0, uint.MaxValue })
                await Messaging("POST", "/messaging/s%2Fone/history/chunks/retry", "{\"syncType\":\"" + kind + "\",\"chunkOrder\":" + order + ",\"chunkMessageId\":\"wa-id:1\",\"regenerate\":false}", Envelope("{\"requestId\":\"request\",\"status\":\"requested\"}"), async c => { var r = await c.HistorySync.RequestChunkRetryAsync("s/one", new(kind, order, "wa-id:1", false)); Check(r.RequestId == "request" && r.Status == "requested", "Retry acknowledgement"); }, version: "2026-10-14");
        await Messaging("POST", "/messaging/s/history/chunks/retry", "{\"syncType\":\"FULL\",\"chunkOrder\":0}", Envelope("{\"requestId\":\"r\",\"status\":\"requested\"}"), async c => { await c.HistorySync.RequestChunkRetryAsync("s", new(HistorySyncType.FULL, 0), new() { ApiVersion = "2026-09-22" }); });
        var hash = Convert.ToBase64String(new byte[32]); var noncanonical = hash[..42] + "B=";
        foreach (var validHash in new[] { hash, noncanonical })
            await Messaging("POST", "/messaging/s/history/media/delete", "{\"directPath\":\"/history.enc\",\"fileEncSha256\":\"" + validHash + "\",\"encHandle\":\"token+/%=\",\"companionMetaNonce\":\"nonce-1\"}", Envelope("{\"status\":\"deleted\"}"), async c => { await c.HistorySync.DeleteChunkAsync("s", new("/history.enc", validHash, "token+/%=", "nonce-1")); }, version: "2026-10-14");
        foreach (var malformed in new[] { "{}", "[]", "null", "{\"data\":{\"requestId\":\"r\",\"status\":\"requested\"}}", "{\"success\":false,\"data\":{\"requestId\":\"r\",\"status\":\"requested\"}}", Envelope("{}"), Envelope("{\"requestId\":\"\",\"status\":\"requested\"}"), Envelope("{\"requestId\":\"r\",\"status\":\"queued\"}") })
            await Messaging("POST", "/messaging/s/history/chunks/retry", "{\"syncType\":\"FULL\",\"chunkOrder\":0}", malformed, c => InvalidResponse(async () => { await c.HistorySync.RequestChunkRetryAsync("s", new(HistorySyncType.FULL, 0)); }), version: "2026-10-14");
        foreach (var malformed in new[] { "{}", "[]", "null", "{\"data\":{\"status\":\"deleted\"}}", Envelope("{}"), Envelope("{\"status\":\"requested\"}") })
            await Messaging("POST", "/messaging/s/history/media/delete", "{\"directPath\":\"/x\",\"fileEncSha256\":\"" + hash + "\"}", malformed, c => InvalidResponse(async () => { await c.HistorySync.DeleteChunkAsync("s", new("/x", hash)); }), version: "2026-10-14");
        await Messaging("POST", "/messaging/s/history/chunks/retry", "{\"syncType\":\"FULL\",\"chunkOrder\":0}", "", c => InvalidResponse(async () => { await c.HistorySync.RequestChunkRetryAsync("s", new(HistorySyncType.FULL, 0)); }), 204, "2026-10-14");
        foreach (var body in new[] { new HistoryChunkRetryRequest((HistorySyncType)999, 0), new HistoryChunkRetryRequest(HistorySyncType.FULL, 0, ""), new HistoryChunkRetryRequest(HistorySyncType.FULL, 0, new string('x', 129)) }) await NoHttp(async (c, _) => { await c.HistorySync.RequestChunkRetryAsync("s", body); });
        foreach (var body in new[] { new HistoryChunkDeleteRequest("", hash), new HistoryChunkDeleteRequest("/x", hash.TrimEnd('=')), new HistoryChunkDeleteRequest("/x", new string('_', 43) + "="), new HistoryChunkDeleteRequest("/x", hash, ""), new HistoryChunkDeleteRequest("/x", hash, CompanionMetaNonce: new string('x', 513)), new HistoryChunkDeleteRequest("/" + new string('x', 1024), hash) }) await NoHttp(async (c, _) => { await c.HistorySync.DeleteChunkAsync("s", body); });
        await NoHttp(async (c, _) => { await c.HistorySync.RequestChunkRetryAsync("", new(HistorySyncType.FULL, 0)); });
        await ClientGuardsAsync(c => c.HistorySync.RequestChunkRetryAsync("s", new(HistorySyncType.FULL, 0)));
        await ClientGuardsAsync(c => c.HistorySync.DeleteChunkAsync("s", new("/x", hash)));
        await ClientGuardsAsync(c => c.WhatsAppMedia.CreateUploadGrantAsync("s", WhatsAppUploadMediaType.Image, new byte[32]));
        await ClientGuardsAsync(c => c.Testing.GetPhoneAsync("p", "s"));
        await ClientGuardsAsync(c => c.Testing.SendPhoneMessageAsync("p", "s", new("to", "text")));
        await ClientGuardsAsync(c => c.Testing.UnlinkPhoneDeviceAsync("p", "s", 1));
        using (var wire = new WireFixture())
        using (var c = new MessagingClient(Credential.ClientToken("pmfa_ct_Zml4dHVyZQ"), Options(wire)))
        {
            var serve = wire.ServeAsync("GET", "/messaging/s/groups/g/capabilities", null, caps);
            await c.Groups.GetCapabilitiesAsync("s", "g"); await serve; Check(true, "Scoped Client group allowed");
        }
        using (var wire = new WireFixture())
        using (var c = new MessagingClient(Key, Options(wire)))
        {
            using var stop = new CancellationTokenSource(); stop.Cancel();
            try { await c.HistorySync.RequestChunkRetryAsync("s", new(HistorySyncType.FULL, 0), new() { CancellationToken = stop.Token }); throw new Exception("Cancelled history reached success"); } catch (PolymorfaCancelledException) { Check(!wire.Pending, "Cancelled before HTTP"); }
        }
        foreach (var malformedGrant in new[] { "{\"uploadUrl\":null,\"host\":\"mmg.whatsapp.net\",\"expiresAt\":2000000000}", "{\"uploadUrl\":\"https://mmg.whatsapp.net/mms/image/" + new string('A', 43) + "?auth=synthetic\",\"host\":\"mmg.whatsapp.net\",\"expiresAt\":1e25}" })
            await Messaging("POST", "/messaging/s/media/upload-grants", "{\"type\":\"image\",\"fileEncSha256\":\"" + new string('A', 43) + "\"}", Envelope(malformedGrant), c => InvalidResponse(async () => { await c.WhatsAppMedia.CreateUploadGrantAsync("s", WhatsAppUploadMediaType.Image, new byte[32]); }), version: "2026-10-14");
        Console.WriteLine("PASS nine41 public group/phone/log/history authority, envelopes, versions and domain controls");
    }
    private static async Task ClientGuardsAsync(Func<MessagingClient, Task> invoke)
    {
        using var wire = new WireFixture(); using var c = new MessagingClient(Credential.ClientToken("pmfa_ct_Zml4dHVyZQ"), Options(wire));
        try { await invoke(c); throw new Exception("Client authority accepted"); } catch (PolymorfaConfigurationException) { Check(!wire.Pending, "Client reached HTTP"); }
    }
}
