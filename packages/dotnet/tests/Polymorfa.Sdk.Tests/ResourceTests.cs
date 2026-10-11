using Polymorfa.Sdk;

internal static class ResourceTests
{
    private const string Key = "pmfa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string Success = "{\"success\":true}";
    private const string Group = "{\"success\":true,\"data\":{\"id\":\"g\",\"name\":\"Support\",\"description\":\"Team\",\"createdAt\":42,\"participants\":[{\"id\":\"u\",\"isAdmin\":true,\"isSuperAdmin\":false}],\"ownerId\":\"u\"}}";
    private const string Contact = "{\"success\":true,\"data\":{\"id\":\"u\",\"name\":\"Peer\",\"pushName\":\"Peer\",\"phoneNumber\":\"+15551234567\"}}";
    private const string Privacy = "{\"success\":true,\"data\":{\"groupAdd\":\"contacts\",\"lastSeen\":\"none\",\"status\":\"contacts\",\"profile\":\"contacts\",\"readReceipts\":\"all\",\"online\":\"match_last_seen\",\"callAdd\":\"known\",\"messages\":\"contacts\",\"defense\":\"off\",\"stickers\":\"none\"}}";
    public static async Task RunAsync()
    {
        await Messaging("GET", "/messaging/s/contacts", null, "{\"success\":true,\"data\":[{\"id\":\"u\",\"name\":\"Peer\",\"pushName\":\"Peer\"}]}", async c => { var r = await c.Contacts.ListAsync("s"); Equal(r.Data.Data[0].Id, "u"); });
        await Messaging("GET", "/messaging/s/contacts/check?phone=%2B15551234567%2C%2B15557654321", null, "{\"success\":true,\"data\":[{\"exists\":true,\"id\":\"u\"}]}", async c => { var r = await c.Contacts.CheckAsync("s", ["+15551234567", "+15557654321"]); Equal(r.Data.Data[0].Exists, true); });
        await Messaging("GET", "/messaging/s/contacts/blocked", null, "{\"success\":true,\"data\":{\"hash\":\"h\",\"contacts\":[{\"id\":\"u\"}]}}", async c => { var r = await c.Contacts.BlocklistAsync("s"); Equal(r.Data.Data.Contacts[0].Id, "u"); });
        await Messaging("GET", "/messaging/s/contacts/u", null, Contact, async c => { var r = await c.Contacts.RetrieveAsync("s", "u"); Equal(r.Data.Data.Name, "Peer"); });
        await Messaging("GET", "/messaging/s/contacts/u/picture", null, "{\"success\":true,\"data\":{\"url\":\"https://example.invalid/picture\"}}", async c => { var r = await c.Contacts.PictureAsync("s", "u"); Equal(r.Data.Data.Url, "https://example.invalid/picture"); });
        await Messaging("GET", "/messaging/s/contacts/u/info", null, "{\"success\":true,\"data\":{\"id\":\"u\",\"status\":\"Available\",\"pictureId\":\"p\",\"verifiedName\":\"Peer\",\"devices\":[{\"id\":\"d\",\"device\":2}]}}", async c => { var r = await c.Contacts.InfoAsync("s", "u"); Equal(r.Data.Data.Devices[0].Device, 2); });
        await Messaging("GET", "/messaging/s/contacts/u/devices", null, "{\"success\":true,\"data\":[\"device\"]}", async c => { var r = await c.Contacts.DevicesAsync("s", "u"); Equal(r.Data.Data[0], "device"); });
        await Messaging("GET", "/messaging/s/contacts/u/business-profile", null, "{\"success\":true,\"data\":{\"id\":\"u\",\"address\":\"Street\",\"email\":\"support@example.invalid\",\"description\":\"Shop\",\"websites\":[],\"coverPhotoId\":\"p\",\"categories\":[],\"options\":{\"x\":\"y\"},\"hoursTimeZone\":\"UTC\",\"hours\":[]}}", async c => { var r = await c.Contacts.BusinessProfileAsync("s", "u"); Equal(r.Data.Data.Options["x"], "y"); });
        await Messaging("POST", "/messaging/s/contacts/u/block", null, Success, async c => True((await c.Contacts.BlockAsync("s", "u")).Data.Success));
        await Messaging("POST", "/messaging/s/contacts/u/unblock", null, Success, async c => True((await c.Contacts.UnblockAsync("s", "u")).Data.Success));
        await Messaging("GET", "/messaging/s/groups", null, "{\"success\":true,\"data\":[{\"id\":\"g\",\"name\":\"Support\",\"description\":\"Team\",\"createdAt\":42,\"participants\":[],\"ownerId\":\"u\"}]}", async c => Equal((await c.Groups.ListAsync("s")).Data.Data[0].OwnerId, "u"));
        await Messaging("POST", "/messaging/s/groups", "{\"name\":\"Support\",\"participants\":[\"u\"]}", Group, async c => Equal((await c.Groups.CreateAsync("s", new("Support", ["u"]))).Data.Data.Name, "Support"));
        await Messaging("GET", "/messaging/s/groups/g", null, Group, async c => True((await c.Groups.RetrieveAsync("s", "g")).Data.Data.Participants[0].IsAdmin));
        await Messaging("GET", "/messaging/s/groups/join-info?code=invite", null, "{\"success\":true,\"data\":{\"id\":\"g\",\"subject\":\"Support\",\"createdAt\":42,\"size\":1,\"participants\":[],\"creatorId\":\"u\"}}", async c => Equal((await c.Groups.GetJoinInfoAsync("s", "invite")).Data.Data.Size, 1));
        await Messaging("POST", "/messaging/s/groups/join", "{\"code\":\"invite\"}", Success, async c => True((await c.Groups.JoinAsync("s", new("invite"))).Data.Success));
        await Messaging("GET", "/messaging/s/groups/g/capabilities", null, "{\"success\":true,\"data\":{\"status\":\"unknown\",\"syncedAt\":null,\"checkedAt\":null,\"capabilities\":[{\"key\":\"polls.endTime\",\"kind\":\"feature\",\"unit\":null,\"value\":null,\"source\":null}]}}", async c => Equal((await c.Groups.GetCapabilitiesAsync("s", "g")).Data.Data.Capabilities[0].Value, null));
        await Messaging("DELETE", "/messaging/s/groups/g", null, Success, async c => True((await c.Groups.DeleteAsync("s", "g")).Data.Success));
        await Messaging("POST", "/messaging/s/groups/g/leave", null, Success, async c => True((await c.Groups.LeaveAsync("s", "g")).Data.Success));
        await Messaging("PUT", "/messaging/s/groups/g/subject", "{\"value\":\"New\"}", Success, async c => True((await c.Groups.SetSubjectAsync("s", "g", new("New"))).Data.Success));
        await Messaging("PUT", "/messaging/s/groups/g/description", "{\"value\":\"Description\"}", Success, async c => True((await c.Groups.SetDescriptionAsync("s", "g", new("Description"))).Data.Success));
        await Messaging("GET", "/messaging/s/groups/g/invite-code", null, "{\"success\":true,\"data\":{\"code\":\"invite\"}}", async c => Equal((await c.Groups.GetInviteCodeAsync("s", "g")).Data.Data.Code, "invite"));
        await Messaging("POST", "/messaging/s/groups/g/invite-code/revoke", null, "{\"success\":true,\"data\":{\"code\":\"new-invite\"}}", async c => Equal((await c.Groups.RevokeInviteCodeAsync("s", "g")).Data.Data.Code, "new-invite"));
        await Messaging("GET", "/messaging/s/groups/g/participants", null, "{\"success\":true,\"data\":[{\"id\":\"u\",\"isAdmin\":false,\"isSuperAdmin\":false}]}", async c => Equal((await c.Groups.ListParticipantsAsync("s", "g")).Data.Data[0].Id, "u"));
        await Messaging("POST", "/messaging/s/groups/g/participants/add", "{\"participants\":[\"u\"]}", Success, async c => True((await c.Groups.AddParticipantsAsync("s", "g", new(["u"]))).Data.Success));
        await Messaging("POST", "/messaging/s/groups/g/participants/remove", "{\"participants\":[\"u\"]}", Success, async c => True((await c.Groups.RemoveParticipantsAsync("s", "g", new(["u"]))).Data.Success));
        await Messaging("POST", "/messaging/s/groups/g/admin/promote", "{\"participants\":[\"u\"]}", Success, async c => True((await c.Groups.PromoteParticipantsAsync("s", "g", new(["u"]))).Data.Success));
        await Messaging("POST", "/messaging/s/groups/g/admin/demote", "{\"participants\":[\"u\"]}", Success, async c => True((await c.Groups.DemoteParticipantsAsync("s", "g", new(["u"]))).Data.Success));
        await Messaging("PUT", "/messaging/s/groups/g/picture", "{\"url\":\"https://example.invalid/picture\"}", Success, async c => True((await c.Groups.SetPictureAsync("s", "g", new(Url: "https://example.invalid/picture"))).Data.Success));
        await Messaging("PUT", "/messaging/s/groups/g/settings/info-edit", "{\"adminsOnly\":true}", Success, async c => True((await c.Groups.SetInfoEditingAsync("s", "g", new(true))).Data.Success));
        await Messaging("PUT", "/messaging/s/groups/g/settings/messages", "{\"adminsOnly\":false}", Success, async c => True((await c.Groups.SetMessagingAsync("s", "g", new(false))).Data.Success));
        await Messaging("PUT", "/messaging/s/groups/g/settings/member-add", "{\"mode\":\"admin_add\"}", Success, async c => True((await c.Groups.SetMemberAddModeAsync("s", "g", new("admin_add"))).Data.Success));
        await Messaging("PUT", "/messaging/s/groups/g/settings/join-approval", "{\"required\":true}", Success, async c => True((await c.Groups.SetJoinApprovalAsync("s", "g", new(true))).Data.Success));
        await Messaging("GET", "/messaging/s/profile", null, "{\"success\":true,\"data\":{\"name\":\"Support\",\"status\":\"Ready\",\"accountType\":\"business\"}}", async c => Equal((await c.Profile.GetAsync("s")).Data.Data.Name, "Support"));
        await Messaging("PUT", "/messaging/s/profile/name", "{\"name\":\"New\"}", Success, async c => True((await c.Profile.SetNameAsync("s", new("New"))).Data.Success));
        await Messaging("PUT", "/messaging/s/profile/status", "{\"status\":\"Ready\"}", Success, async c => True((await c.Profile.SetStatusAsync("s", new("Ready"))).Data.Success));
        await Messaging("PUT", "/messaging/s/profile/picture", "{\"base64\":\"Zml4dHVyZQ==\"}", Success, async c => True((await c.Profile.SetPictureAsync("s", new(Base64: "Zml4dHVyZQ=="))).Data.Success));
        await Messaging("DELETE", "/messaging/s/profile/picture", null, Success, async c => True((await c.Profile.DeletePictureAsync("s")).Data.Success));
        await Messaging("GET", "/messaging/s/privacy", null, Privacy, async c => Equal((await c.Privacy.GetAsync("s")).Data.Data.Defense, "off"));
        await Messaging("PUT", "/messaging/s/privacy/last", "{\"value\":\"none\"}", Privacy, async c => Equal((await c.Privacy.SetAsync("s", new("last", "none"))).Data.Data.LastSeen, "none"));
        await Messaging("PUT", "/messaging/s/privacy/disappearing/default", "{\"durationSeconds\":86400}", Success, async c => True((await c.Privacy.SetDefaultDisappearingTimerAsync("s", new(86400))).Data.Success));
        Console.WriteLine("PASS 40 native typed account/group operations");
    }
    internal static async Task Messaging(string method, string path, string? body, string response, Func<MessagingClient, Task> invoke)
    {
        using var fixture = new WireFixture { Authorization = "Bearer " + Key };
        var serving = fixture.ServeAsync(method, path, body, response);
        using var client = new MessagingClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0, Timeout = TimeSpan.FromSeconds(3) });
        try { await invoke(client); await serving; }
        catch { await serving; throw; }
    }
    internal static void Equal<T>(T actual, T expected) { if (!EqualityComparer<T>.Default.Equals(actual, expected)) throw new Exception("Typed response value differs."); }
    internal static void True(bool actual) => Equal(actual, true);
}
