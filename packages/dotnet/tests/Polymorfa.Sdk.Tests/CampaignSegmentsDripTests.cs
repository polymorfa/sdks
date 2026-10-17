using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Polymorfa.Sdk;

// Wire expectations come from contracts/campaign-frequency-cap.json,
// contracts/campaign-segments-drip.json and the pinned TypeScript producer tests.
internal static class CampaignSegmentsDripTests
{
    private const string Project = "11111111-1111-4111-8111-111111111111";
    private const string Id = "22222222-2222-4222-8222-222222222222";
    private const string Key = "pmfa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string RulesJson = """{"match":"all","groups":[{"match":"any","conditions":[{"field":"tag","operator":"contains","value":"vip"},{"field":"attribute","name":"spend","operator":"greater_than","value":100},{"field":"consent","operator":"equals","value":true}]}]}""";
    private static readonly string SegmentJson = "{\"id\":\"" + Id + "\",\"name\":\"VIP\",\"revision\":2,\"rules\":" + RulesJson + ",\"createdAt\":1,\"updatedAt\":2}";
    private const string PreviewJson = """{"matchedCount":4,"optedOutCount":1,"consentWithheldCount":1,"eligibleCount":2,"sample":[{"phone":"+49*******12","tags":["vip"]}],"evaluatedAt":3}""";
    private const string DripStats = """{"enrollment":"continuous","enrolled":3,"enrolledByApi":1,"active":1,"completed":1,"exited":1,"steps":[{"step":0,"entered":3,"waiting":1,"sent":2,"delivered":2,"read":1,"replied":1,"exited":1,"failed":0}]}""";
    private static readonly string EnrollmentJson = "{\"campaignId\":\"" + Id + "\",\"recipientId\":\"" + Project + "\",\"phone\":\"+5511999990000\",\"created\":false,\"status\":\"skipped\",\"enrolledAt\":1800000000000}";
    private static string DripCampaign
    {
        get
        {
            var c = JsonNode.Parse(Adoption41Fixtures.CampaignJson)!.AsObject();
            c["frequencyCap"] = JsonNode.Parse("""{"maxPer24Hours":2,"maxPer7Days":null}""");
            c["drip"] = JsonNode.Parse("""{"enrollment":"audience","exitOnReply":false,"exitOnLinkClick":true}""");
            c["enrollmentOpen"] = false; c["pauseReason"] = null; c["segmentId"] = null;
            c["segmentSnapshot"] = JsonNode.Parse("""{"revision":3,"evaluatedAt":1,"matchedCount":4}""");
            return c.ToJsonString();
        }
    }
    private static string Analytics => CampaignExistingTests.Change(CampaignExistingTests.Change(Adoption41Fixtures.Report, "frequencyCap", JsonNode.Parse("""{"skippedRecipientCount":3}""")), "drip", JsonNode.Parse(DripStats));
    private static string Recipient => JsonNode.Parse(Adoption41Fixtures.Recipient)!.AsObject() is var r ? Set(r, ("status", "skipped"), ("failureReason", "frequency_cap"), ("lastError", "frequency_cap_exceeded"), ("sequenceError", "link_clicked")) : "";
    private static string Set(JsonObject node, params (string Name, string Value)[] values) { foreach (var (name, value) in values) node[name] = value; node["messagesSent"] = 1; return node.ToJsonString(); }
    private static readonly AudienceSegmentRules Rules = new(AudienceSegmentMatch.All, [new(AudienceSegmentMatch.Any, [new AudienceSegmentTagContains("vip"), new AudienceSegmentAttributeCompare("spend", AudienceSegmentCompareOperator.GreaterThan, 100m), new AudienceSegmentConsentEquals(true)])]);
    private static readonly CampaignFrequencyCap Limits = new(2, 5);

    internal static async Task RunAsync()
    {
        Contracts();
        await FrequencyCapAsync();
        await SegmentsAsync();
        Conditions();
        await SentOnceAsync();
        await FailClosedAsync();
        await DripAsync();
        Console.WriteLine("PASS campaign frequency caps, audience segments and drips on both audiences");
    }

    private static void Contracts()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "contracts/campaign-segments-drip.json"))) directory = directory.Parent;
        using var cap = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory!.FullName, "contracts/campaign-frequency-cap.json")));
        using var seg = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory.FullName, "contracts/campaign-segments-drip.json")));
        ResourceTests.Equal(cap.RootElement.GetProperty("commit").GetString(), "e404a727ddb4abf42a8df768a5336fad922cc99a");
        ResourceTests.Equal(seg.RootElement.GetProperty("commit").GetString(), "f46ebd5162453e812dafa76ce02b420ddabe6921");
        var never = new JsonSerializerOptions(HttpTransportJson) { DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never };
        static string[] Keys(JsonElement v) => v.EnumerateObject().Select(p => p.Name).Order().ToArray();
        static string[] Props(JsonElement schema) => schema.GetProperty("properties").EnumerateObject().Select(p => p.Name).Order().ToArray();
        var platform = cap.RootElement.GetProperty("sources").GetProperty("platform").GetProperty("schemas");
        ResourceTests.True(Keys(JsonSerializer.SerializeToElement(new CampaignFrequencyCapSettings(Project, null, null, 0, null), never)).SequenceEqual(Props(platform.GetProperty("CampaignFrequencyCapSettings"))));
        ResourceTests.True(Keys(JsonSerializer.SerializeToElement(new UpdateCampaignFrequencyCapRequest(null, null, 0), HttpTransportJson)).SequenceEqual(Props(platform.GetProperty("UpdateCampaignFrequencyCapInput"))));
        foreach (var reason in platform.GetProperty("CampaignRecipientFailureReason").GetProperty("enum").EnumerateArray())
            ResourceTests.Equal(JsonSerializer.SerializeToElement(JsonSerializer.Deserialize<CampaignRecipientFailureReason>(reason.GetRawText(), HttpTransportJson), HttpTransportJson).GetString(), reason.GetString());
        var schemas = seg.RootElement.GetProperty("sources").GetProperty("platform").GetProperty("schemas");
        foreach (var (name, value) in new (string, JsonElement)[]
        {
            ("AudienceSegment", JsonSerializer.SerializeToElement(JsonSerializer.Deserialize<AudienceSegment>(SegmentJson, HttpTransportJson), HttpTransportJson)),
            ("AudienceSegmentPreview", JsonSerializer.SerializeToElement(JsonSerializer.Deserialize<AudienceSegmentPreview>(PreviewJson, HttpTransportJson), HttpTransportJson)),
            ("CampaignDrip", JsonSerializer.SerializeToElement(new CampaignDrip(CampaignDripEnrollment.Audience, true, false), HttpTransportJson)),
            ("CampaignDripInput", JsonSerializer.SerializeToElement(new CampaignDripInput(CampaignDripEnrollment.Audience, true, false), HttpTransportJson)),
            ("CampaignDripPatch", JsonSerializer.SerializeToElement(new CampaignDripPatch(CampaignDripEnrollment.Audience, true, false), HttpTransportJson)),
            ("CampaignDripStats", JsonSerializer.SerializeToElement(JsonSerializer.Deserialize<CampaignDripStats>(DripStats, HttpTransportJson), HttpTransportJson)),
            ("CampaignEnrollment", JsonSerializer.SerializeToElement(JsonSerializer.Deserialize<CampaignEnrollment>(EnrollmentJson, HttpTransportJson), HttpTransportJson)),
            ("EnrollCampaignContactRequest", JsonSerializer.SerializeToElement(new EnrollPlatformCampaignContactRequest(Project, "+1", new Dictionary<string, JsonElement> { ["a"] = JsonSerializer.SerializeToElement(true) }), HttpTransportJson)),
        })
            if (!Keys(value).SequenceEqual(Props(schemas.GetProperty(name)))) throw new Exception("Native fields differ from the pinned schema: " + name);
        foreach (var source in new[] { "platform", "messaging" })
            ResourceTests.True(!seg.RootElement.GetProperty("sources").GetProperty(source).GetProperty("schemas").GetProperty("CampaignDripPatch").GetRawText().Contains("\"default\"", StringComparison.Ordinal));
        ResourceTests.Equal(seg.RootElement.GetProperty("sources").GetProperty("platform").GetProperty("fields").GetProperty("CampaignMessage.sendWindow").GetProperty("properties").GetProperty("hours").GetProperty("maxItems").GetInt32(), 4);
    }
    private static JsonSerializerOptions HttpTransportJson => new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull };

    private static async Task FrequencyCapAsync()
    {
        const string path = "/platform/campaign-settings/frequency-cap";
        await BillingTests.Organization("GET", path, null, "{\"data\":{\"teamId\":\"" + Project + "\",\"maxPer24Hours\":2,\"maxPer7Days\":5,\"revision\":1,\"updatedAt\":null}}", async c =>
        {
            var read = (await c.Campaigns.GetFrequencyCapAsync()).Data.Data;
            ResourceTests.Equal((read.MaxPer24Hours, read.MaxPer7Days, read.Revision, read.UpdatedAt), ((int?)2, (int?)5, 1L, (long?)null));
        });
        await BillingTests.Organization("PUT", path, """{"maxPer24Hours":2,"maxPer7Days":5,"revision":1}""", "{\"data\":{\"teamId\":\"" + Project + "\",\"maxPer24Hours\":2,\"maxPer7Days\":5,\"revision\":2,\"updatedAt\":1800000000000}}", async c => ResourceTests.Equal((await c.Campaigns.UpdateFrequencyCapAsync(new(2, 5, 1))).Data.Data.UpdatedAt, 1800000000000L));
        await BillingTests.Organization("PUT", path, """{"maxPer24Hours":null,"maxPer7Days":null,"revision":2}""", "{\"data\":{\"teamId\":\"" + Project + "\",\"maxPer24Hours\":null,\"maxPer7Days\":null,\"revision\":3,\"updatedAt\":1800000000000}}", async c => ResourceTests.Equal((await c.Campaigns.UpdateFrequencyCapAsync(new(null, null, 2))).Data.Data.Revision, 3L));
        const string limits = """{"maxPer24Hours":2,"maxPer7Days":5}""";
        await BillingTests.Organization("POST", "/platform/campaigns", "{\"projectId\":\"" + Project + "\",\"name\":\"cap\",\"frequencyCap\":" + limits + "}", Adoption41Fixtures.Envelope(DripCampaign, false), async c => ResourceTests.Equal((await c.Campaigns.CreateAsync(new(Project, "cap") { FrequencyCap = Limits })).Data.Data.FrequencyCap, new CampaignFrequencyCap(2, null)));
        await BillingTests.Organization("PATCH", "/platform/campaigns/c?projectId=" + Project, """{"frequencyCap":null}""", Adoption41Fixtures.Envelope(DripCampaign, false), async c => await c.Campaigns.UpdateAsync("c", new() { FrequencyCap = PatchValue<CampaignFrequencyCap>.Set(null) }, new(Project)));
        await ResourceTests.Messaging("POST", "/messaging/projects/" + Project + "/campaigns", "{\"name\":\"cap\",\"frequencyCap\":" + limits + "}", Adoption41Fixtures.Envelope(DripCampaign), async c => await c.Campaigns.CreateAsync(Project, new("cap") { FrequencyCap = Limits }));
        await ResourceTests.Messaging("PATCH", "/messaging/projects/" + Project + "/campaigns/c", """{"frequencyCap":null}""", Adoption41Fixtures.Envelope(DripCampaign), async c => await c.Campaigns.UpdateAsync(Project, "c", new() { FrequencyCap = PatchValue<CampaignFrequencyCap>.Set(null) }));
        await ResourceTests.Messaging("GET", "/messaging/projects/" + Project + "/campaigns/c/recipients?status=skipped&reason=frequency_cap", null, "{\"success\":true,\"data\":[" + Recipient + "],\"page\":{\"nextCursor\":null,\"hasMore\":false}}", async c => ResourceTests.Equal((await c.Campaigns.ListRecipientsAsync(Project, "c", new("skipped", Reason: CampaignRecipientFailureReason.FrequencyCap))).Data.Data[0].FailureReason, CampaignRecipientFailureReason.FrequencyCap));
        await BillingTests.Organization("GET", "/platform/campaigns/c/recipients?projectId=" + Project + "&status=skipped&reason=frequency_cap", null, "{\"data\":[" + Recipient + "],\"page\":{\"nextCursor\":null,\"hasMore\":false}}", async c => ResourceTests.Equal((await c.Campaigns.RecipientsAsync("c", new(Project, "skipped", Reason: CampaignRecipientFailureReason.FrequencyCap))).Data.Data[0].SequenceError, "link_clicked"));
        await BillingTests.Organization("GET", "/platform/campaigns/c/analytics?projectId=" + Project, null, Adoption41Fixtures.Envelope(Analytics, false), async c => ResourceTests.Equal((await c.Campaigns.AnalyticsAsync("c", new(Project))).Data.Data.FrequencyCap!.SkippedRecipientCount, 3L));
        await ResourceTests.Messaging("GET", "/messaging/projects/" + Project + "/campaigns/c/analytics", null, Adoption41Fixtures.Envelope(Analytics), async c => ResourceTests.Equal((await c.Campaigns.AnalyticsAsync(Project, "c")).Data.Data.Drip!.Steps[0].Exited, 1L));
        await BillingTests.Organization("GET", "/platform/campaigns/c?projectId=" + Project, null, Adoption41Fixtures.Envelope(DripCampaign, false), async c =>
        {
            var campaign = (await c.Campaigns.RetrieveAsync("c", new(Project))).Data.Data!;
            ResourceTests.Equal(campaign.FrequencyCap, new CampaignFrequencyCap(2, null));
            ResourceTests.True(campaign.AdditionalFields is null || !campaign.AdditionalFields.Keys.Any(k => k is "frequencyCap" or "drip" or "enrollmentOpen" or "pauseReason" or "segmentId" or "segmentSnapshot"));
        });
    }

    private static async Task SegmentsAsync()
    {
        await BillingTests.Organization("GET", "/platform/audience-segments?limit=10&cursor=next", null, "{\"data\":[" + SegmentJson + "],\"page\":{\"hasMore\":false,\"nextCursor\":null}}", async c => ResourceTests.Equal((await c.AudienceSegments.ListAsync(new(10, "next"))).Data.Data[0].Revision, 2L));
        await BillingTests.Organization("GET", "/platform/audience-segments/s%2F1", null, "{\"data\":" + SegmentJson + "}", async c =>
        {
            var segment = (await c.AudienceSegments.RetrieveAsync("s/1")).Data.Data;
            if (segment.Rules.Groups[0].Conditions[1] is not AudienceSegmentAttributeCompare { Name: "spend", Operator: AudienceSegmentCompareOperator.GreaterThan, Value: 100m }) throw new Exception("Discriminated condition decode changed.");
        });
        await BillingTests.Organization("POST", "/platform/audience-segments", "{\"name\":\"VIP\",\"rules\":" + RulesJson + "}", "{\"data\":" + SegmentJson + "}", async c => await c.AudienceSegments.CreateAsync(new("VIP", Rules)));
        await BillingTests.Organization("PATCH", "/platform/audience-segments/s", "{\"expectedRevision\":1,\"rules\":" + RulesJson + "}", "{\"data\":" + SegmentJson + "}", async c => await c.AudienceSegments.UpdateAsync("s", new(1) { Rules = Rules }));
        await BillingTests.Organization("GET", "/platform/audience-segments/s/preview", null, "{\"data\":" + PreviewJson.TrimEnd('}') + ",\"revision\":2}}", async c => ResourceTests.Equal((await c.AudienceSegments.PreviewAsync("s")).Data.Data.Revision, 2L));
        await BillingTests.Organization("POST", "/platform/audience-segments/preview", "{\"rules\":" + RulesJson + "}", "{\"data\":" + PreviewJson + "}", async c => ResourceTests.Equal((await c.AudienceSegments.PreviewRulesAsync(Rules)).Data.Data.Sample[0].Phone, "+49*******12"));
        await BillingTests.Organization("DELETE", "/platform/audience-segments/s?expectedRevision=2", null, "{\"data\":{\"deleted\":true,\"id\":\"" + Id + "\"}}", async c => ResourceTests.Equal((await c.AudienceSegments.DeleteAsync("s", 2)).Data.Data.Deleted, true));
        using var bound = new OrganizationClient(Credential.OrganizationApiKey(Key)).Project(Project);
        ResourceTests.True(bound.GetType().GetProperty("AudienceSegments") is null);
    }

    private static void Conditions()
    {
        var all = "{\"match\":\"any\",\"groups\":[{\"match\":\"all\",\"negate\":true,\"conditions\":[{\"field\":\"tag\",\"operator\":\"in\",\"values\":[\"a\",\"b\"]},{\"field\":\"tag\",\"operator\":\"exists\"},{\"field\":\"attribute\",\"name\":\"flag\",\"operator\":\"equals\",\"value\":false},{\"field\":\"attribute\",\"name\":\"zero\",\"operator\":\"equals\",\"value\":0},{\"field\":\"attribute\",\"name\":\"city\",\"operator\":\"contains\",\"value\":\"São\"},{\"field\":\"attribute\",\"name\":\"since\",\"operator\":\"before\",\"value\":\"2026-01-01\"},{\"field\":\"attribute\",\"name\":\"tier\",\"operator\":\"in\",\"values\":[\"gold\",2]},{\"field\":\"attribute\",\"name\":\"spend\",\"operator\":\"less_than\",\"value\":1.5},{\"field\":\"attribute\",\"name\":\"email\",\"operator\":\"exists\"},{\"field\":\"consent\",\"operator\":\"equals\",\"value\":false},{\"field\":\"campaign\",\"campaignId\":\"" + Id + "\",\"outcome\":\"not_replied\"}]}]}";
        var typed = JsonSerializer.Deserialize<AudienceSegmentRules>(all, HttpTransportJson)!;
        ResourceTests.True(typed.Groups[0].Conditions[10] is AudienceSegmentCampaignOutcome { Outcome: "not_replied" });
        using (var a = JsonDocument.Parse(JsonSerializer.Serialize(typed, HttpTransportJson))) using (var b = JsonDocument.Parse(all)) ResourceTests.True(WireFixture.EqualJson(a.RootElement, b.RootElement));
        const string future = """{"match":"all","groups":[{"match":"all","conditions":[{"field":"future","operator":"magic","value":1}]}]}""";
        var unknown = JsonSerializer.Deserialize<AudienceSegmentRules>(future, HttpTransportJson)!;
        ResourceTests.True(unknown.Groups[0].Conditions[0] is AudienceSegmentUnknownCondition);
        using (var a = JsonDocument.Parse(JsonSerializer.Serialize(unknown, HttpTransportJson))) using (var b = JsonDocument.Parse(future)) ResourceTests.True(WireFixture.EqualJson(a.RootElement, b.RootElement));
    }

    /// <summary>A loopback server that answers every connection the same way and counts them.</summary>
    private sealed class Counting : IDisposable
    {
        private readonly TcpListener listener = new(IPAddress.Loopback, 0);
        private readonly CancellationTokenSource stop = new();
        public int Count;
        public readonly List<string> Heads = [];
        public Uri Url { get; }
        public Counting(int status, string body)
        {
            listener.Start(); Url = new($"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}");
            _ = Task.Run(async () =>
            {
                while (!stop.IsCancellationRequested)
                {
                    TcpClient connection;
                    try { connection = await listener.AcceptTcpClientAsync(stop.Token); } catch { return; }
                    using (connection)
                    {
                        var stream = connection.GetStream(); var bytes = new List<byte>(); var one = new byte[1];
                        while (!(bytes.Count >= 4 && bytes[^4] == 13 && bytes[^3] == 10 && bytes[^2] == 13 && bytes[^1] == 10)) { if (await stream.ReadAsync(one) == 0) break; bytes.Add(one[0]); }
                        var head = Encoding.ASCII.GetString(bytes.ToArray()).ToLowerInvariant();
                        lock (Heads) { Heads.Add(head); Count++; }
                        var length = head.Split("\r\n").FirstOrDefault(l => l.StartsWith("content-length:", StringComparison.Ordinal)) is { } h ? int.Parse(h[15..].Trim()) : 0;
                        var rest = new byte[length]; await stream.ReadExactlyAsync(rest);
                        var output = Encoding.UTF8.GetBytes(body);
                        await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 {status} Fixture\r\ncontent-type: application/json\r\ncontent-length: {output.Length}\r\nconnection: close\r\nx-request-id: counted\r\n\r\n"));
                        await stream.WriteAsync(output);
                    }
                }
            });
        }
        public void Dispose() { stop.Cancel(); listener.Stop(); }
    }

    private static async Task SentOnceAsync()
    {
        foreach (var (status, code) in new[] { (409, "conflict"), (403, "feature_unavailable"), (409, "state_conflict"), (503, "unavailable") })
            for (var call = 0; call < 8; call++)
            {
                using var server = new Counting(status, "{\"error\":{\"code\":\"" + code + "\",\"message\":\"Unavailable, deleted segment or evaluation timeout\"}}");
                using var org = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = server.Url, MaxNetworkRetries = 2 });
                using var messaging = new MessagingClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = server.Url, MaxNetworkRetries = 2 });
                var caller = new RequestOptions { Headers = new Dictionary<string, string> { ["x-caller"] = "kept" }, IdempotencyKey = call == 7 ? "caller-key" : null };
                Func<Task> invoke = call switch
                {
                    0 => () => org.Campaigns.UpdateFrequencyCapAsync(new(1, 1, 0), caller),
                    1 => () => org.AudienceSegments.UpdateAsync("s", new(2) { Name = "new" }, caller),
                    2 => () => org.AudienceSegments.CreateAsync(new("n", Rules), caller),
                    3 => () => org.AudienceSegments.DeleteAsync("s", 2, caller),
                    4 => () => org.AudienceSegments.PreviewAsync("s", caller),
                    5 => () => org.AudienceSegments.PreviewRulesAsync(Rules, caller),
                    6 => () => org.Campaigns.EnrollAsync("c", new(Project, "+1"), caller),
                    _ => () => messaging.Campaigns.EnrollAsync(Project, "c", new("+1"), caller),
                };
                try { await invoke(); throw new Exception("Error status accepted"); }
                catch (PolymorfaException error) when (error is not PolymorfaConfigurationException)
                {
                    var expected = status == 409 ? typeof(PolymorfaConflictException) : status == 403 ? typeof(PolymorfaAuthorizationException) : typeof(PolymorfaServerException);
                    if (error.GetType() != expected || error.Code != code || error.Status != status || error.RequestId != "counted") throw new Exception($"Safe error mapping changed: {status} {code} {call}");
                }
                if (server.Count != 1) throw new Exception($"Write or preview {call} replayed on {status}: {server.Count}");
                ResourceTests.True(server.Heads[0].Contains("x-caller: kept", StringComparison.Ordinal));
                ResourceTests.Equal(server.Heads[0].Contains("idempotency-key: caller-key", StringComparison.Ordinal), call == 7);
                if (call == 6) ResourceTests.True(!server.Heads[0].Contains("idempotency-key:", StringComparison.Ordinal));
            }
        using var read = new Counting(503, """{"error":{"code":"unavailable","message":"retry"}}""");
        using var client = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = read.Url, MaxNetworkRetries = 2 });
        try { await client.AudienceSegments.RetrieveAsync("s"); throw new Exception("Unavailable read accepted"); } catch (PolymorfaServerException) { }
        if (read.Count != 3) throw new Exception("Segment reads changed retry policy.");
    }

    private static async Task FailClosedAsync()
    {
        using var fixture = new WireFixture();
        using var client = new OrganizationClient(Credential.OrganizationApiKey(Key), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0 });
        async Task Rejected(Func<Task> action) { try { await action(); } catch (PolymorfaConfigurationException) { return; } throw new Exception("Invalid input accepted before sending."); }
        foreach (var blank in new[] { "", " " }) await Rejected(() => client.AudienceSegments.RetrieveAsync(blank));
        await Rejected(() => client.AudienceSegments.PreviewRulesAsync(new(AudienceSegmentMatch.All, [new(AudienceSegmentMatch.All, [new AudienceSegmentUnknownCondition(JsonSerializer.SerializeToElement(new { field = "future" }))])])));
        await Rejected(() => client.AudienceSegments.PreviewRulesAsync(new(AudienceSegmentMatch.All, [new(AudienceSegmentMatch.All, [new AudienceSegmentAttributeIn("x", [AudienceSegmentValue.Of(true)])])])));
        foreach (var project in new[] { "", "not-a-uuid" }) await Rejected(() => client.Campaigns.EnrollAsync("c", new(project, "+1")));
        var ordinary = new[] { new PlatformCampaignMessage { Source = "later", DelayAfterSec = 86401 } };
        await Rejected(() => client.Campaigns.CreateAsync(new(Project, "o", MessagesArray: ordinary)));
        await Rejected(() => client.Campaigns.CreateAsync(new(Project, "o", MessagesArray: ordinary) { Drip = PatchValue<CampaignDripInput>.Set(null) }));
        await Rejected(() => client.Campaigns.UpdateAsync("c", new() { MessagesArray = [new PlatformCampaignMessage { Source = "later", DelayAfterSec = 2592001 }] }, new(Project)));
        await Task.Delay(25); ResourceTests.True(!fixture.Pending);
    }

    private static async Task DripAsync()
    {
        var steps = new[] { new PlatformCampaignMessage { Source = "hi" }, new PlatformCampaignMessage { Source = "later", DelayAfterSec = 2592000, DelayUnit = CampaignDelayUnit.Days, SendWindow = new CampaignStepWindow(["monday"], [new("09:00", "17:00")]) } };
        await BillingTests.Organization("POST", "/platform/campaigns", "{\"projectId\":\"" + Project + "\",\"name\":\"VIP drip\",\"segmentId\":\"s\",\"drip\":{\"enrollment\":\"continuous\"},\"messagesArray\":[{\"source\":\"hi\"},{\"source\":\"later\",\"delayAfterSec\":2592000,\"delayUnit\":\"days\",\"sendWindow\":{\"days\":[\"monday\"],\"hours\":[{\"start\":\"09:00\",\"end\":\"17:00\"}]}}]}", Adoption41Fixtures.Envelope(DripCampaign, false), async c => await c.Campaigns.CreateAsync(new(Project, "VIP drip", MessagesArray: steps) { SegmentId = "s", Drip = new CampaignDripInput(CampaignDripEnrollment.Continuous) }));
        await BillingTests.Organization("POST", "/platform/campaigns", "{\"projectId\":\"" + Project + "\",\"name\":\"drip\",\"drip\":{},\"messagesArray\":[{\"delayAfterSec\":2592000}]}", Adoption41Fixtures.Envelope(DripCampaign, false), async c => await c.Campaigns.CreateAsync(new(Project, "drip", MessagesArray: [new PlatformCampaignMessage { DelayAfterSec = 2592000 }]) { Drip = new CampaignDripInput() }));
        var audience = new CampaignDripPatch(CampaignDripEnrollment.Audience);
        await BillingTests.Organization("PATCH", "/platform/campaigns/c?projectId=" + Project, """{"drip":{"enrollment":"audience"}}""", Adoption41Fixtures.Envelope(DripCampaign, false), async c => await c.Campaigns.UpdateAsync("c", new() { Drip = audience }, new(Project)));
        await ResourceTests.Messaging("PATCH", "/messaging/projects/" + Project + "/campaigns/c", """{"drip":{"enrollment":"audience"}}""", Adoption41Fixtures.Envelope(DripCampaign), async c => await c.Campaigns.UpdateAsync(Project, "c", new() { Drip = audience }));
        await BillingTests.Organization("PATCH", "/platform/campaigns/c?projectId=" + Project, """{"drip":null,"segmentId":null}""", Adoption41Fixtures.Envelope(DripCampaign, false), async c => await c.Campaigns.UpdateAsync("c", new() { Drip = PatchValue<CampaignDripPatch>.Set(null), SegmentId = PatchValue<string>.Set(null) }, new(Project)));
        await BillingTests.Organization("PATCH", "/platform/campaigns/c?projectId=" + Project, """{"messagesArray":[{"source":"later","delayAfterSec":2592000,"sendWindow":null}]}""", Adoption41Fixtures.Envelope(DripCampaign, false), async c => await c.Campaigns.UpdateAsync("c", new() { MessagesArray = [new PlatformCampaignMessage { Source = "later", DelayAfterSec = 2592000, SendWindow = PatchValue<CampaignStepWindow>.Set(null) }] }, new(Project)));
        await BillingTests.Organization("POST", "/platform/campaigns/c%2F1/enrollments", "{\"projectId\":\"" + Project + "\",\"phone\":\"+5511999990000\"}", "{\"data\":" + EnrollmentJson + "}", async c =>
        {
            var enrolled = (await c.Campaigns.EnrollAsync("c/1", new(Project, "+5511999990000"))).Data.Data;
            ResourceTests.Equal((enrolled.Created, enrolled.EnrolledAt), (false, 1800000000000d));
        });
        await ResourceTests.Messaging("POST", "/messaging/projects/" + Project + "/campaigns/c/enrollments", """{"phone":"+5511999990000","variables":{"vip":true}}""", Adoption41Fixtures.Envelope(EnrollmentJson), async c => ResourceTests.Equal((await c.Campaigns.EnrollAsync(Project, "c", new("+5511999990000", new Dictionary<string, JsonElement> { ["vip"] = JsonSerializer.SerializeToElement(true) }))).Data.Data.Status, "skipped"));
        await ResourceTests.Messaging("GET", "/messaging/projects/" + Project + "/campaigns/c", null, Adoption41Fixtures.Envelope(DripCampaign), async c =>
        {
            var stored = (await c.Campaigns.RetrieveAsync(Project, "c")).Data.Data;
            ResourceTests.Equal((stored.EnrollmentOpen, stored.PauseReason, stored.SegmentId, stored.SegmentSnapshot!.Revision, stored.Drip!.ExitOnLinkClick), ((bool?)false, (string?)null, (string?)null, 3L, true));
        });
    }
}
