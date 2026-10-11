using Polymorfa.Sdk;

internal static class ProjectPairingTests
{
    private const string Id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    public static async Task RunAsync()
    {
        await Messaging("GET", "/messaging/support/pair/qr?format=json", null, """{"success":true,"data":{"qr":null,"event":"connected"}}""", async c => ResourceTests.Equal((await c.Sessions.QrAsync("support")).Data.Data.Qr, null));
        await Messaging("POST", "/messaging/support/pair/code", """{"phone":"15550001111"}""", """{"success":true,"data":{"code":"12345678"}}""", async c => ResourceTests.Equal((await c.Sessions.RequestPairingCodeAsync("support", new("15550001111"))).Data.Data.Code, "12345678"));
        await Messaging("POST", "/messaging/support/calls/c1/reject", """{"from":"15550001111@s.whatsapp.net"}""", """{"success":true,"data":{"requestId":"req1"}}""", async c => ResourceTests.Equal((await c.Calls.RejectIncomingAsync("support", "c1", new("15550001111@s.whatsapp.net"))).Data.Data!.Value.GetProperty("requestId").GetString(), "req1"));
        await Messaging("GET", "/platform/sessions/support/me", null, """{"success":true,"data":{"id":"u1","pushName":"Support","phoneNumber":"+15550001111"}}""", async c => ResourceTests.Equal((await c.Sessions.AccountAsync("support")).Data.Data.PushName, "Support"));
        await Messaging("POST", "/platform/sessions/support/restart", null, """{"success":true,"message":"Restart admitted","operationId":"op1"}""", async c => ResourceTests.Equal((await c.Sessions.RestartAsync("support")).Data.OperationId, "op1"));
        await Messaging("POST", "/platform/sessions/support/logout", null, """{"success":true,"message":"Logout admitted","operationId":"op2"}""", async c => ResourceTests.Equal((await c.Sessions.LogoutAsync("support")).Data.OperationId, "op2"));
        await Organization("GET", "/platform/projects", null, """{"data":[{"_id":"p1","_creationTime":9007199254740993,"orgId":"o1","name":"Support","slug":"support","icon":{"type":"emoji","value":"☎"},"defaultTier":"standard","isActive":true,"stage":"testing","activeSessions":1,"totalSessions":2,"totalMessages":3,"lastActivity":null,"iconUrl":null}]}""", async c => ResourceTests.Equal((await c.Projects.ListAsync()).Data.Data[0].CreationTime, 9007199254740993L));
        await Organization("POST", "/platform/projects", """{"name":"Support","defaultTier":"standard"}""", """{"data":{"id":"p1","orgId":"o1","name":"Support","slug":"support","icon":{"type":"emoji","value":"☎"},"defaultTier":"standard","isActive":true,"stage":"testing"}}""", async c => ResourceTests.Equal((await c.Projects.CreateAsync(new("Support", DefaultTier: "standard"))).Data.Data.Stage, "testing"));
        await Organization("POST", "/platform/projects/" + Id + "/promote", """{"business":{"name":"Support","website":"https://example.com","supportEmail":"support@example.com"}}""", """{"data":{"id":"p1","orgId":"o1","name":"Support","slug":"support","stage":"production","operationId":"op1","enrollmentStatus":"pending","billingMode":"pay_as_you_go"}}""", async c => ResourceTests.Equal((await c.Projects.RequestProductionEnrollmentAsync(Id, new(new("Support", "https://example.com", "support@example.com")))).Data.Data.EnrollmentStatus, "pending"));
        await Organization("POST", "/platform/projects/" + Id + "/production-enrollments/" + Id + "/approve", null, """{"data":{"operationId":"op1","action":"approve","accepted":true}}""", async c => ResourceTests.True((await c.Projects.ApproveProductionEnrollmentAsync(Id, Id)).Data.Data.Accepted));
        await Organization("POST", "/platform/projects/" + Id + "/production-enrollments/" + Id + "/cancel", null, """{"data":{"operationId":"op1","action":"cancel","accepted":true}}""", async c => ResourceTests.True((await c.Projects.CancelProductionEnrollmentAsync(Id, Id)).Data.Data.Accepted));
        Console.WriteLine("PASS typed projects, enrollment, pairing, account and incoming call rejection paths");
    }
    private static Task Messaging(string method, string path, string? body, string response, Func<MessagingClient, Task> invoke) => ResourceTests.Messaging(method, path, body, response, invoke);
    private static Task Organization(string method, string path, string? body, string response, Func<OrganizationClient, Task> invoke) => BillingTests.Organization(method, path, body, response, invoke);
}
