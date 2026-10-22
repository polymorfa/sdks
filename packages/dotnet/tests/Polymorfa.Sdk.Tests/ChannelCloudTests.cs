using Polymorfa.Sdk;

internal static class ChannelCloudTests
{
    private const string Channel = """{"success":true,"data":{"id":"ch1","name":"Updates","followers":9007199254740993,"muted":false,"preview":true}}""";
    private const string Messages = """{"success":true,"data":[{"position":9007199254740993,"id":"m1","whatsapp_ids":{"linked_devices":"wa1"},"conversation":{"id":"ch1"},"type":"text","timestamp":"2026-09-22T00:00:00Z","views":2,"reactionCounts":{"🐈":3},"text":"Zoë"}]}""";
    private const string Accepted = """{"success":true,"data":{"requestId":"req_rpc"}}""";
    private const string Reply = """{"success":true,"data":{"id":"qr1","shortcut":"hello","message":"Welcome","keywords":[],"count":0}}""";
    public static async Task RunAsync()
    {
        await Messaging("GET", "/messaging/s/channels", null, """{"success":true,"data":[{"id":"ch1","name":"Updates","muted":false}]}""", async c => ResourceTests.Equal((await c.Channels.ListAsync("s")).Data.Data[0].Muted, false));
        await Messaging("POST", "/messaging/s/channels", """{"name":"Updates","picture":"photo"}""", Accepted, async c => ResourceTests.True((await c.Channels.CreateAsync("s", new("Updates", Picture: "photo"))).Data.Data is AcceptedCommand<Channel>));
        await Messaging("GET", "/messaging/s/channels/ch1", null, Channel, async c => ResourceTests.Equal((await c.Channels.RetrieveAsync("s", "ch1")).Data.Data.Followers, 9007199254740993L));
        await Messaging("DELETE", "/messaging/s/channels/ch1", null, """{"success":true,"data":{"status":"DELETED"}}""", async c => ResourceTests.Equal(((CompletedCommand<StatusResult>)(await c.Channels.DeleteAsync("s", "ch1")).Data.Data).Value.Status, "DELETED"));
        await Messaging("GET", "/messaging/s/channels/ch1/messages?count=2&before=9007199254740993", null, Messages, async c => ResourceTests.Equal((await c.Channels.ListMessagesAsync("s", "ch1", new(2, 9007199254740993L))).Data.Data[0].Position, 9007199254740993L));
        await Messaging("GET", "/messaging/s/channels/ch1/message-updates?count=2&since=0&after=1", null, Messages, async c => ResourceTests.Equal((await c.Channels.ListMessageUpdatesAsync("s", "ch1", new(2, 0, 1))).Data.Data[0].ReactionCounts["🐈"], 3L));
        await Messaging("POST", "/messaging/s/channels/ch1/messages/m1/viewed", null, """{"success":true}""", async c => ResourceTests.True((await c.Channels.MarkMessageViewedAsync("s", "ch1", "m1")).Data.Success));
        await Messaging("POST", "/messaging/s/channels/ch1/messages/m1/reaction", """{"reaction":""}""", """{"success":true,"data":{"status":"UPDATED"}}""", async c => ResourceTests.Equal(((CompletedCommand<StatusResult>)(await c.Channels.ReactToMessageAsync("s", "ch1", "m1", new(""), new() { IdempotencyKey = "reaction1" })).Data.Data!).Value.Status, "UPDATED"), new Dictionary<string, string> { ["idempotency-key"] = "reaction1" });
        await Messaging("POST", "/messaging/s/channels/ch1/live-updates", null, """{"success":true,"data":{"durationSeconds":120}}""", async c => ResourceTests.Equal(((CompletedCommand<ChannelLiveUpdates>)(await c.Channels.SubscribeToLiveUpdatesAsync("s", "ch1")).Data.Data).Value.DurationSeconds, 120));
        await Messaging("POST", "/messaging/s/channels/ch1/follow", null, """{"success":true,"data":{"status":"FOLLOWED"}}""", async c => ResourceTests.Equal(((CompletedCommand<StatusResult>)(await c.Channels.FollowAsync("s", "ch1")).Data.Data!).Value.Status, "FOLLOWED"));
        await Messaging("POST", "/messaging/s/channels/ch1/unfollow", null, Accepted, async c => ResourceTests.True((await c.Channels.UnfollowAsync("s", "ch1")).Data.Data is AcceptedCommand<StatusResult>));
        await Messaging("POST", "/messaging/s/channels/ch1/mute", null, """{"success":true,"message":"muted"}""", async c => ResourceTests.Equal((await c.Channels.MuteAsync("s", "ch1")).Data.Message, "muted"));
        await Messaging("POST", "/messaging/s/channels/ch1/unmute", null, """{"success":true,"data":{"status":"UNMUTED"}}""", async c => ResourceTests.Equal(((CompletedCommand<StatusResult>)(await c.Channels.UnmuteAsync("s", "ch1")).Data.Data!).Value.Status, "UNMUTED"));
        await Messaging("GET", "/messaging/s/business/quick-replies", null, """{"success":true,"data":{"policy":"follow","status":"partial","unknownReason":"not_observed","quickReplies":[{"id":"qr1","shortcut":"hello","message":"Welcome","keywords":[],"count":0,"associatedLabelIds":["label1"],"observedAt":"2026-09-22T00:00:00Z"}]}}""", async c => ResourceTests.Equal((await c.QuickReplies.ListAsync("s")).Data.Data.QuickReplies[0].AssociatedLabelIds[0], "label1"));
        await Messaging("POST", "/messaging/s/business/quick-replies", """{"shortcut":"hello","message":"Welcome","keywords":[],"count":0}""", Reply, async c => ResourceTests.Equal((await c.QuickReplies.CreateAsync("s", new("hello", "Welcome", [], 0))).Data.Data.Count, 0));
        await Messaging("PUT", "/messaging/s/business/quick-replies/qr1", """{"shortcut":"hello","message":"Welcome"}""", Reply, async c => ResourceTests.Equal((await c.QuickReplies.ReplaceAsync("s", "qr1", new("hello", "Welcome"))).Data.Data.Id, "qr1"));
        await Messaging("DELETE", "/messaging/s/business/quick-replies/qr1", null, """{"success":true,"data":{"id":"qr1","status":"DELETED"}}""", async c => ResourceTests.Equal((await c.QuickReplies.DeleteAsync("s", "qr1")).Data.Data.Status, "DELETED"));
        await Messaging("GET", "/messaging/s/users/user%2F1/security-code", null, """{"success":true,"data":{"id":"user/1","numericCode":"1234567890","qrCode":"AQID","username":"peer"}}""", async c => ResourceTests.Equal((await c.Users.GetSecurityCodeAsync("s", "user/1")).Data.Data.NumericCode, "1234567890"));
        await Messaging("GET", "/messaging/s/meta-pricing?since=2026-09-01&until=2026-09-22", null, """{"success":true,"data":{"source":"meta","since":"2026-09-01","until":"2026-09-22","messages":2,"groups":[{"category":"utility","pricingModel":"PMP","pricingType":null,"billable":false,"messages":2}]}}""", async c => ResourceTests.Equal((await c.Sessions.GetMetaPricingAsync("s", new("2026-09-01", "2026-09-22"))).Data.Data.Groups[0].Billable, false));
        await Messaging("GET", "/messaging/s/cloud-credentials", null, """{"success":true,"data":{"status":"action_required","checkedAt":null,"nextCheckAt":null,"token":{"status":"expired","expiresAt":null},"missingPermissions":["whatsapp_business_messaging"],"phoneRegistration":"unknown","webhookSubscription":"unknown","failureCode":"token_expired"}}""", async c => ResourceTests.Equal((await c.Sessions.GetCloudCredentialHealthAsync("s")).Data.Data.Token.Status, "expired"));
        await Messaging("POST", "/messaging/s/cloud-credentials/reauthorize", null, """{"success":true,"data":{"quicklinkId":"ql1","url":"https://pair.polymorfa.com/secret","session":"s"}}""", async c => { var r = (await c.Sessions.ReauthorizeCloudCredentialsAsync("s")).Data.Data; ResourceTests.Equal(r.QuicklinkId, "ql1"); ResourceTests.True(!r.ToString().Contains("/secret")); });
        await Messaging("GET", "/messaging/s/chats/peer/service-window", null, """{"success":true,"data":{"state":"unknown","reason":"not_tracked","openedAt":null,"expiresAt":null,"checkedAt":"2026-09-22T00:00:00Z"}}""", async c => ResourceTests.Equal((await c.Chats.GetServiceWindowAsync("s", "peer")).Data.Data.State, "unknown"));
        using var client = new MessagingClient(Credential.ClientToken("pmfa_ct_fixture"));
        await Invalid(() => client.Sessions.GetMetaPricingAsync("s")); await Invalid(() => client.Sessions.GetCloudCredentialHealthAsync("s")); await Invalid(() => client.Sessions.ReauthorizeCloudCredentialsAsync("s")); await Invalid(() => client.Chats.GetServiceWindowAsync("s", "peer"));
        var key = "pmfa_" + new string('a', 72);
        using var fixture = new WireFixture { Authorization = "Bearer " + key };
        var serve = fixture.ServeAsync("POST", "/messaging/s/cloud-credentials/reauthorize", null, """{"error":{"code":"unavailable","message":"Try later"}}""", 503);
        using var server = new MessagingClient(Credential.OrganizationApiKey(key), new() { BaseUrl = fixture.Url, Timeout = TimeSpan.FromMilliseconds(300) });
        try { await server.Sessions.ReauthorizeCloudCredentialsAsync("s", new() { IdempotencyKey = "key", MaxNetworkRetries = 3 }); throw new Exception("Expected server refusal"); } catch (PolymorfaServerException e) { ResourceTests.Equal(e.Metadata!.Attempts, 1); }
        await serve;
        Console.WriteLine("PASS Channels, QuickReplies, security code, Cloud credential/pricing and service-window native APIs");
    }
    private static async Task Invalid(Func<Task> action) { try { await action(); throw new Exception("Client token reached server API"); } catch (PolymorfaConfigurationException) { } }
    private static async Task Messaging(string method, string path, string? body, string response, Func<MessagingClient, Task> invoke, IReadOnlyDictionary<string, string>? headers = null)
    {
        var key = "pmfa_" + new string('a', 72);
        using var fixture = new WireFixture { Authorization = "Bearer " + key, ExpectedHeaders = headers };
        var serve = fixture.ServeAsync(method, path, body, response);
        using var client = new MessagingClient(Credential.OrganizationApiKey(key), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0 });
        await invoke(client); await serve;
    }
}
