using System.Text.Json.Nodes;
using Polymorfa.Sdk;
using static ResourceTests;

internal static class ConnectionContractsTests
{
    private const string Root = """{"success":true,"data":{"connectionId":"stable-session-id","name":"Support","tenantId":"team","type":"whatsapp","method":"hybrid","phoneNumberId":"meta-phone-id","testMode":false,"status":"connected","createdAt":"2026-09-22","updatedAt":"2026-09-22"}}""";
    internal static async Task RunAsync()
    {
        foreach (var (wire, method) in new[] { ("linked_device", ConnectionMethod.LinkedDevice), ("cloud_api", ConnectionMethod.CloudApi), ("hybrid", ConnectionMethod.Hybrid) })
        {
            var response = JsonNode.Parse(Root)!; response["data"]!["method"] = wire;
            await BillingTests.Team("GET", "/platform/connections/stable-session-id", null, response.ToJsonString(), async client =>
            {
                var value = (await client.Connections.RetrieveAsync("stable-session-id")).Data.Data;
                ResourceTests.Equal(value.ConnectionId, "stable-session-id"); ResourceTests.Equal(value.Type, ConnectionType.WhatsApp); ResourceTests.Equal(value.Method, method); ResourceTests.Equal(value.PhoneNumberId, "meta-phone-id");
            });
        }
        foreach (var field in new[] { "type", "method", "connectionId" })
        {
            var response = JsonNode.Parse(Root)!;
            if (field == "type") response["data"]![field] = "linked_device";
            else response["data"]!.AsObject().Remove(field);
            await BillingTests.Team("GET", "/platform/connections/stable-session-id", null, response.ToJsonString(), async client =>
            {
                try { await client.Connections.RetrieveAsync("stable-session-id"); } catch (PolymorfaServerException error) when (error.Code == "invalid_response") { return; }
                throw new Exception("Old account shape accepted.");
            });
        }
        await Messaging("POST", "/messaging/quicklinks", """{"configuration":{"testing":{"configuration":{"accountType":"business_app","primaryPlatform":"ios"}}}}""", """{"success":true,"data":{"purpose":"initial","connectionGoal":"single","id":"link","url":"https://example.invalid/link","connection":"stable-session-id","expiresAt":null}}""", async client =>
        {
            var result = await client.QuickLinks.CreateAsync(new(Configuration: new(Testing: new(Configuration: new(AccountType: TestingAccountType.BusinessApp, PrimaryPlatform: TestingPrimaryPlatform.Ios)))));
            ResourceTests.Equal(result.Data.Data.Connection, "stable-session-id");
        });
        await Messaging("GET", "/messaging/quicklinks/availability?projectId=project&connection=stable-session-id", null, """{"success":true,"data":{"allowed":true,"addMethod":"linked_devices","methods":[{"kind":"official_api","status":"connected","enabled":true}],"resumeQuickLinkId":null}}""", async client => ResourceTests.Equal((await client.QuickLinks.AvailabilityAsync("project", "stable-session-id")).Data.Data.Methods[0].Kind, "official_api"));
        Console.WriteLine("PASS Connection root scalar methods, preserved selectors, old-shape refusal, Testing primaryPlatform and QuickLink method availability.");
    }
}
