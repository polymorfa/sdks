using System.Text.Json;
using System.Text.Json.Serialization;
using Polymorfa.Sdk;

internal static class CampaignFollowUpTests
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
    private const string Report = """{"total":12,"waiting":1,"scheduled":2,"sending":3,"sent":4,"delivered":5,"read":6,"replied":7,"cancelled":8,"expired":9,"failed":10,"unknown":11,"nextDueAt":9007199254740993}""";
    private const string Summary = """{"id":"follow-up","numberId":"number","status":"outcome_unknown","anchorKind":"read","firstDeliveredAt":9007199254740993,"firstReadAt":9007199254740994,"dueAt":null,"expiresAt":9007199254740995,"sentAt":null,"deliveredAt":null,"readAt":null,"repliedAt":null,"reason":"wait_expired","commandId":null}""";
    public static async Task RunAsync()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "contracts/campaign-follow-ups.json"))) directory = directory.Parent;
        using var contract = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory!.FullName, "contracts/campaign-follow-ups.json")));
        var schemas = contract.RootElement.GetProperty("sources").GetProperty("platform").GetProperty("schemas");
        ResourceTests.Equal(schemas.GetProperty("CampaignFollowUp").GetProperty("required")[0].GetString(), "message");
        foreach (var status in schemas.GetProperty("CampaignFollowUpSummary").GetProperty("properties").GetProperty("status").GetProperty("enum").EnumerateArray())
        {
            var typed = JsonSerializer.Deserialize<CampaignFollowUpStatus>(status.GetRawText(), Json);
            ResourceTests.Equal(JsonSerializer.SerializeToElement(typed, Json).GetString(), status.GetString());
        }
        var summaryJson = JsonSerializer.SerializeToElement(JsonSerializer.Deserialize<CampaignFollowUpSummary>(Summary, Json), new JsonSerializerOptions(Json) { DefaultIgnoreCondition = JsonIgnoreCondition.Never });
        var summaryKeys = schemas.GetProperty("CampaignFollowUpSummary").GetProperty("properties").EnumerateObject().Select(p => p.Name).Order().ToArray();
        ResourceTests.True(summaryJson.EnumerateObject().Select(p => p.Name).Order().SequenceEqual(summaryKeys));
        var report = JsonSerializer.Deserialize<CampaignFollowUpReport>(Report, Json)!;
        ResourceTests.Equal(report.NextDueAt, 9007199254740993L);
        var reportKeys = JsonSerializer.SerializeToElement(report, Json).EnumerateObject().Select(p => p.Name).Order().ToArray();
        var schemaKeys = schemas.GetProperty("CampaignFollowUpReport").GetProperty("properties").EnumerateObject().Select(p => p.Name).Order().ToArray();
        ResourceTests.True(reportKeys.SequenceEqual(schemaKeys));
        foreach (var (followUp, expected) in new (CampaignFollowUp, string)[]
        {
            (new(new CampaignFollowUpText("Hello {{name}}")), """{"message":{"type":"text","text":"Hello {{name}}"}}"""),
            (new(new CampaignFollowUpTemplate("11111111-1111-4111-8111-111111111111"), 60, 86400), """{"message":{"type":"template","templateId":"11111111-1111-4111-8111-111111111111"},"delaySeconds":60,"expirySeconds":86400}""")
        })
        {
            await ResourceTests.Messaging("POST", "/messaging/projects/support/campaigns", "{\"name\":\"Customers\",\"followUp\":" + expected + "}", Adoption41Fixtures.Envelope(CampaignExistingTests.Change(Adoption41Fixtures.CampaignJson.Replace("\"c\"", "\"c1\""), "followUp", System.Text.Json.Nodes.JsonNode.Parse(expected))), async c =>
            {
                var response = await c.Campaigns.CreateAsync("support", new("Customers", FollowUp: followUp));
                ResourceTests.Equal(response.Data.Data.FollowUp!.DelaySeconds, followUp.DelaySeconds);
                ResourceTests.Equal(response.Data.Data.FollowUp.ExpirySeconds, followUp.ExpirySeconds);
                ResourceTests.Equal(response.Data.Data.FollowUp.Message, followUp.Message);
            });
            await BillingTests.Organization("POST", "/platform/campaigns", "{\"projectId\":\"11111111-1111-4111-8111-111111111111\",\"name\":\"Customers\",\"followUp\":" + expected + "}", Adoption41Fixtures.Envelope(CampaignExistingTests.Change(Adoption41Fixtures.CampaignJson.Replace("\"c\"", "\"c1\""), "followUp", System.Text.Json.Nodes.JsonNode.Parse(expected)), false), async c => ResourceTests.Equal((await c.Campaigns.CreateAsync(new("11111111-1111-4111-8111-111111111111", "Customers", FollowUp: followUp))).Data.Data.FollowUp!.Message, followUp.Message));
        }
        foreach (var followUp in new CampaignFollowUp?[] { null, new(new CampaignFollowUpText("Only a follow-up edit")) })
        {
            var expected = "{\"followUp\":" + JsonSerializer.Serialize(followUp, Json) + "}";
            await ResourceTests.Messaging("PATCH", "/messaging/projects/support/campaigns/c1", expected, Adoption41Fixtures.Envelope(Adoption41Fixtures.CampaignJson.Replace("\"c\"", "\"c1\"")), async c => ResourceTests.Equal((await c.Campaigns.UpdateAsync("support", "c1", new() { FollowUp = PatchValue<CampaignFollowUp>.Set(followUp) })).Data.Data.Id, "c1"));
            await BillingTests.Organization("PATCH", "/platform/campaigns/c1?projectId=p1", expected, Adoption41Fixtures.Envelope(Adoption41Fixtures.CampaignJson.Replace("\"c\"", "\"c1\""), false), async c => ResourceTests.Equal((await c.Campaigns.UpdateAsync("c1", new() { FollowUp = PatchValue<CampaignFollowUp>.Set(followUp) }, new("p1"))).Data.Data.Id, "c1"));
        }
        var recipient = CampaignExistingTests.Change(Adoption41Fixtures.Recipient, "followUp", System.Text.Json.Nodes.JsonNode.Parse(Summary));
        await ResourceTests.Messaging("GET", "/messaging/projects/support/campaigns/c1/recipients", null, "{\"success\":true,\"data\":[" + recipient + "],\"page\":{\"nextCursor\":null,\"hasMore\":false}}", async c => CheckSummary((await c.Campaigns.ListRecipientsAsync("support", "c1", new())).Data.Data[0].FollowUp!));
        await BillingTests.Organization("GET", "/platform/campaigns/c1/recipients?projectId=11111111-1111-4111-8111-111111111111", null, "{\"data\":[" + recipient + "],\"page\":{\"nextCursor\":null,\"hasMore\":false}}", async c => CheckSummary((await c.Campaigns.RecipientsAsync("c1", new("11111111-1111-4111-8111-111111111111"))).Data.Data[0].FollowUp!));
        var analytics = CampaignExistingTests.Change(Adoption41Fixtures.Report, "followUps", System.Text.Json.Nodes.JsonNode.Parse(Report));
        await ResourceTests.Messaging("GET", "/messaging/projects/support/campaigns/c1/analytics", null, "{\"success\":true,\"data\":" + analytics + "}", async c => ResourceTests.Equal((await c.Campaigns.AnalyticsAsync("support", "c1")).Data.Data.FollowUps, report));
        await BillingTests.Organization("GET", "/platform/campaigns/c1/analytics?projectId=p1", null, "{\"data\":" + analytics + "}", async c => ResourceTests.Equal((await c.Campaigns.AnalyticsAsync("c1", new("p1"))).Data.Data.FollowUps, report));
        ResourceTests.Equal(JsonSerializer.Deserialize<Campaign>("{}", Json)!.FollowUp, null);
        ResourceTests.Equal(JsonSerializer.Deserialize<Campaign>("{\"followUp\":null}", Json)!.FollowUp, null);
        ResourceTests.Equal(JsonSerializer.Deserialize<CampaignFollowUpSummary>(Summary.Replace("\"read\"", "null"), Json)!.AnchorKind, null);
        foreach (var malformed in new[] { "{\"type\":\"image\",\"text\":\"bad\"}", "{\"type\":\"template\"}" })
        {
            try { JsonSerializer.Deserialize<CampaignFollowUpMessage>(malformed, Json); throw new Exception("Invalid follow-up union accepted"); }
            catch (JsonException) { }
        }
        // Endpoint response presence is checked by CampaignExistingTests over TCP.
        using var server = new WireFixture { Authorization = "Bearer pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" };
        var served = server.ServeAsync("POST", "/messaging/projects/support/campaigns", """{"name":"Customers","followUp":{"message":{"type":"text","text":"Hello"}}}""", """{"error":{"code":"feature_unavailable","message":"Follow-ups require enrollment"}}""", 403);
        using var client = new MessagingClient(Credential.OrganizationApiKey("pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), new() { BaseUrl = server.Url, MaxNetworkRetries = 0 });
        try { await client.Campaigns.CreateAsync("support", new("Customers", FollowUp: new CampaignFollowUp(new CampaignFollowUpText("Hello")))); throw new Exception("Unavailable follow-up accepted"); }
        catch (PolymorfaException error) { if (error.Status != 403 || error.Code != "feature_unavailable") throw new Exception($"Expected enrollment denial, received {error.Status} {error.Code}: {error.Message}", error); }
        await served;
        Console.WriteLine("PASS receipt-timed follow-ups: both audiences, sparse defaults, null removal, receipt times, reports, statuses and enrollment denial");
    }
    private static void CheckSummary(CampaignFollowUpSummary summary)
    {
        ResourceTests.Equal(summary.Status, CampaignFollowUpStatus.OutcomeUnknown);
        ResourceTests.Equal(summary.AnchorKind, CampaignFollowUpAnchorKind.Read);
        ResourceTests.Equal(summary.FirstDeliveredAt, 9007199254740993L);
        ResourceTests.Equal(summary.FirstReadAt, 9007199254740994L);
        ResourceTests.Equal(summary.ExpiresAt, 9007199254740995L);
        ResourceTests.Equal(summary.DueAt, null); ResourceTests.Equal(summary.CommandId, null);
        ResourceTests.Equal(summary.Reason, "wait_expired");
    }
}
