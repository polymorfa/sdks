using Polymorfa.Sdk;
using static ResourceTests;

internal static class CallsTests
{
    private const string Success = "{\"success\":true}";
    private const string Settings = "{\"success\":true,\"data\":{\"callsEnabled\":true,\"conferenceMode\":false,\"inboundRoute\":\"clients\",\"sipTrunkId\":null,\"sipClaim\":false,\"hostCloudApiCalls\":false,\"revision\":2,\"updatedAt\":null}}";
    public static async Task RunAsync()
    {
        await Messaging("POST", "/messaging/voip/calls", "{\"session\":\"s\",\"to\":\"peer\",\"video\":false}", "{\"success\":true,\"data\":{\"callId\":\"call\",\"session\":\"s\",\"video\":false}}", async c => ResourceTests.Equal((await c.Calls.PlaceAsync(new(Session: "s", To: "peer", Video: false))).Data.Data.CallId, "call"));
        await Messaging("POST", "/messaging/voip/calls/call/accept", "{\"exclusive\":true}", "{\"success\":true,\"data\":{\"answered\":true,\"answeredBy\":\"server\",\"exclusive\":true}}", async c => ResourceTests.Equal((await c.Calls.AcceptAsync("call", new(Exclusive: true))).Data.Data.AnsweredBy, "server"));
        await Messaging("POST", "/messaging/voip/calls/call/reject", null, Success, async c => True((await c.Calls.RejectAsync("call")).Data.Success));
        await Messaging("POST", "/messaging/voip/calls/call/leave", "{\"connectionId\":\"connection1\"}", Success, async c => True((await c.Calls.LeaveAsync("call", new("connection1"))).Data.Success));
        await Messaging("DELETE", "/messaging/voip/calls/call", null, Success, async c => True((await c.Calls.EndAsync("call")).Data.Success));
        await Messaging("POST", "/messaging/voip/calls/call/participants", "{\"to\":\"peer\"}", "{\"success\":true,\"data\":{\"id\":\"peer\",\"audioMuted\":false,\"video\":true,\"state\":\"invited\",\"handRaised\":false}}", async c => True((await c.Calls.AddParticipantAsync("call", new("peer"))).Data.Data.Video));
        await Messaging("POST", "/messaging/voip/calls/call/participants/ring", "{\"to\":\"peer\"}", Success, async c => True((await c.Calls.RingParticipantAsync("call", new("peer"))).Data.Success));
        await Messaging("POST", "/messaging/voip/calls/call/reaction", "{\"connectionId\":\"connection1\",\"emoji\":\"👍\"}", Success, async c => True((await c.Calls.SendReactionAsync("call", new("connection1", "👍"))).Data.Success));
        await Messaging("POST", "/messaging/voip/calls/call/hand", "{\"connectionId\":\"connection1\",\"raised\":true}", Success, async c => True((await c.Calls.SetHandRaisedAsync("call", new("connection1", true))).Data.Success));
        await Messaging("POST", "/messaging/voip/calls/check", "{\"session\":\"s\",\"to\":\"peer\"}", "{\"success\":true,\"data\":{\"allowed\":false,\"refusal\":\"permission_required\",\"permission\":null}}", async c => ResourceTests.Equal((await c.Calls.CheckAsync(new("s", "peer"))).Data.Data.Refusal, "permission_required"));
        await Messaging("GET", "/messaging/s/call-permissions/peer", null, "{\"success\":true,\"data\":{\"status\":\"granted\",\"expiresAt\":null,\"source\":\"user\",\"updatedAt\":null,\"checkedAt\":null,\"fresh\":true,\"actions\":{\"startCall\":{\"allowed\":true,\"limits\":[{\"period\":\"day\",\"maxAllowed\":10,\"used\":2,\"resetsAt\":null}]}},\"conversation\":{\"bsuid\":\"peer\"}}}", async c => ResourceTests.Equal((await c.Calls.RetrieveCallPermissionAsync("s", "peer")).Data.Data.Actions!.StartCall!.Limits[0].Used, 2L));
        await Messaging("GET", "/platform/sessions/s/call-settings", null, Settings, async c => ResourceTests.Equal((await c.Calls.RetrieveCallSettingsAsync("s")).Data.Data.Revision, 2L));
        await Messaging("PUT", "/platform/sessions/s/call-settings", "{\"sipTrunkId\":null,\"expectedRevision\":1}", Settings, async c => ResourceTests.Equal((await c.Calls.UpdateCallSettingsAsync("s", new(SipTrunkId: PatchValue<string>.Set(null), ExpectedRevision: 1))).Data.Data.SipTrunkId, null));
        await Messaging("POST", "/messaging/voip/call-links", "{\"session\":\"s\",\"video\":true}", "{\"success\":true,\"data\":{\"session\":\"s\",\"token\":\"link\",\"url\":\"https://call.whatsapp.com/video/link\",\"video\":true}}", async c => ResourceTests.Equal((await c.Calls.CreateCallLinkAsync(new("s", true))).Data.Data.Token, "link"));
        await Messaging("POST", "/messaging/voip/call-links/preview", "{\"session\":\"s\",\"token\":\"link\"}", "{\"success\":true,\"data\":{\"session\":\"s\",\"video\":true,\"creatorConversationIdentity\":{\"phoneNumber\":\"+15551234567\"},\"approvalRequired\":true,\"isAdmin\":false}}", async c => True((await c.Calls.PreviewCallLinkAsync(new("s", "link"))).Data.Data.ApprovalRequired));
        await Messaging("POST", "/messaging/voip/calls/call/reports", "{\"kind\":\"quality\",\"connectionId\":\"connection1\",\"client\":{\"sdk\":\"polymorfa-dotnet\",\"version\":\"0.1.0\",\"platform\":\"other\"},\"quality\":{\"rttMs\":20,\"candidateType\":\"relay\"}}", Success, async c => True((await c.Calls.ReportAsync("call", new("quality", "connection1", new("polymorfa-dotnet", "0.1.0", "other"), Quality: new(RttMs: 20, CandidateType: "relay")))).Data.Success));
        using var client = new MessagingClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)));
        await Invalid(() => client.Calls.PlaceAsync(new(Session: "s", To: "peer", GroupId: "group")));
        await Invalid(() => client.Calls.PlaceAsync(new(Session: "s", Participants: ["peer", "peer"])));
        await Invalid(() => client.Calls.SendReactionAsync("call", new("connection1", "unsupported")));
        await Invalid(() => client.Calls.SetHandRaisedAsync("call", new("short", true)));
        await Invalid(() => client.Calls.CreateCallLinkAsync(new("s"), new() { IdempotencyKey = "key" }));
        await Invalid(() => client.Calls.UpdateCallSettingsAsync("s", new()));
        await Invalid(() => client.Calls.ReportAsync("call", new("quality", "connection1", new("polymorfa-dotnet", "0.1.0", "other"), Quality: new(RttMs: -1))));
        Console.WriteLine("PASS 16 typed Calls routes, explicit null patch and validation");
    }
    private static async Task Invalid(Func<Task> action) { try { await action(); } catch (PolymorfaValidationException) { return; } throw new Exception("Expected preflight Calls validation."); }
}
