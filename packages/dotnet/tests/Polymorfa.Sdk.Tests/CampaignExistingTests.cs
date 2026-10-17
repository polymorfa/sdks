using System.Text.Json;
using System.Text.Json.Nodes;
using Polymorfa.Sdk;
using static Adoption41Fixtures;

internal static class CampaignExistingTests
{
    internal static int Checks { get; private set; }
    internal static readonly Credential Key = Credential.OrganizationApiKey("pmfa_" + new string('0', 72));
    internal static void Check(bool value, string label) { if (!value) throw new Exception(label); Checks++; }
    internal static ClientOptions Options(WireFixture wire) => new() { BaseUrl = wire.Url, MaxNetworkRetries = 0, Timeout = TimeSpan.FromSeconds(2) };
    internal static async Task Messaging(string method, string path, string? body, string response, Func<MessagingClient, Task> invoke, int status = 200, string version = "2026-09-22", IReadOnlyDictionary<string, string>? headers = null)
    {
        using var wire = new WireFixture { Authorization = "Bearer " + "pmfa_" + new string('0', 72), ExpectedHeaders = new Dictionary<string, string> { ["polymorfa-version"] = version } };
        using var client = new MessagingClient(Key, Options(wire));
        var serve = wire.ServeAsync(method, path, body, response, status, headers);
        await invoke(client); await serve; Checks++;
    }
    internal static async Task Organization(string method, string path, string? body, string response, Func<OrganizationClient, Task> invoke, int status = 200, string version = "2026-09-22", IReadOnlyDictionary<string, string>? headers = null)
    {
        using var wire = new WireFixture { ExpectedHeaders = new Dictionary<string, string> { ["polymorfa-version"] = version } };
        using var client = new OrganizationClient(Key, Options(wire));
        var serve = wire.ServeAsync(method, path, body, response, status, headers);
        await invoke(client); await serve; Checks++;
    }
    internal static async Task NoHttp(Func<MessagingClient, OrganizationClient, Task> action)
    {
        using var wire = new WireFixture(); using var client = new MessagingClient(Key, Options(wire)); using var org = new OrganizationClient(Key, Options(wire));
        try { await action(client, org); throw new Exception("Invalid input accepted."); }
        catch (PolymorfaConfigurationException) { Check(!wire.Pending, "Invalid input reached HTTP."); }
    }
    internal static async Task InvalidResponse(Func<Task> action)
    {
        try { await action(); throw new Exception("Malformed success accepted."); }
        catch (PolymorfaServerException error) { Check(error.Code == "invalid_response" && error.Metadata?.RequestId == "req_native", "Safe malformed metadata missing."); }
    }
    internal static string Change(string json, string name, JsonNode? value, bool remove = false)
    {
        var node = JsonNode.Parse(json)!.AsObject(); if (remove) node.Remove(name); else node[name] = value; return node.ToJsonString();
    }
    internal static async Task RunAsync()
    {
        Checks = 0;
        await CampaignsAsync(); await RequestsAsync(); await ResponsesAsync(); await ReplayAsync();
        Console.WriteLine($"PASS campaign41 {Checks} public TCP/pre-I/O assertions");
    }
    private static async Task CampaignsAsync()
    {
        const string path = "/messaging/projects/support/campaigns";
        await Messaging("GET", path, null, Envelope("[" + CampaignJson + "]"), async c => Check((await c.Campaigns.ListAsync("support")).Data.Data[0].TrackedLinks.Count == 0, "List links"));
        await Messaging("POST", path, "{\"name\":\"Campaign\"}", Envelope(CampaignJson), async c => Check((await c.Campaigns.CreateAsync("support", new("Campaign"))).Data.Data.FollowUp is null, "Create required-null"));
        await Messaging("GET", path + "/c", null, Envelope(CampaignJson), async c => Check((await c.Campaigns.RetrieveAsync("support", "c")).Data.Data.ExperimentOutcome is null, "Retrieve required-null"));
        foreach (var field in new[] { "templateId", "variableMapping", "trackedLinks" })
        {
            var input = field switch { "templateId" => new UpdateCampaignRequest { TemplateId = PatchValue<string>.Set(null) }, "variableMapping" => new UpdateCampaignRequest { VariableMapping = PatchValue<CampaignVariableMapping>.Set(null) }, _ => new UpdateCampaignRequest { TrackedLinks = PatchValue<IReadOnlyList<CampaignTrackedLink>>.Set(null) } };
            await Messaging("PATCH", path + "/c", "{\"" + field + "\":null}", Envelope(CampaignJson), async c => { await c.Campaigns.UpdateAsync("support", "c", input); });
        }
        var operation = Change(CampaignJson, "operationId", JsonValue.Create("op"));
        await Messaging("POST", path + "/c/launch", "{\"skipMissingVariables\":false}", Envelope(operation), async c => Check((await c.Campaigns.LaunchAsync("support", "c", new(SkipMissingVariables: false))).Data.Data.OperationId == "op", "Launch operation"));
        await Messaging("POST", path + "/c/reschedule", "{\"scheduledAt\":null}", Envelope(operation), async c => { await c.Campaigns.RescheduleAsync("support", "c", new(null)); });
        await Messaging("POST", path + "/c/pause", null, Envelope(operation), async c => { await c.Campaigns.PauseAsync("support", "c"); });
        await Messaging("POST", path + "/c/resume", null, Envelope(operation), async c => { await c.Campaigns.ResumeAsync("support", "c"); });
        await Messaging("POST", path + "/c/stop", null, Envelope(Change(CampaignJson, "operationId", null)), async c => Check((await c.Campaigns.StopAsync("support", "c")).Data.Data.OperationId is null, "Stop null operation"));
        await Messaging("GET", path + "/c/analytics", null, Envelope(Report), async c => { var r = (await c.Campaigns.AnalyticsAsync("support", "c")).Data.Data; Check(r.AverageResponseTimeMs is null && r.MinResponseTimeMs is null && r.MaxResponseTimeMs is null && r.Experiment is null && r.FollowUps.Total == 0, "Messaging report"); });
        await Organization("GET", "/platform/campaigns?projectId=" + Project, null, Envelope("[" + CampaignJson + "]", false), async c => { await c.Campaigns.ListAsync(new(Project)); });
        await Organization("POST", "/platform/campaigns", "{\"projectId\":\"" + Project + "\",\"name\":\"Campaign\"}", Envelope(CampaignJson, false), async c => { await c.Campaigns.CreateAsync(new(Project, "Campaign")); });
        await Organization("GET", "/platform/campaigns/c?projectId=" + Project, null, "{\"data\":null}", async c => Check((await c.Campaigns.RetrieveAsync("c", new(Project))).Data.Data is null, "Nullable Platform retrieve"));
        foreach (var body in new UpdatePlatformCampaignRequest?[] { null, new(), new() { AdditionalFields = new Dictionary<string, JsonElement> { ["future"] = JsonSerializer.SerializeToElement(false) } } })
            await Organization("PATCH", "/platform/campaigns/c?projectId=" + Project, body is null ? null : body.AdditionalFields is null ? "{}" : "{\"future\":false}", Envelope(CampaignJson, false), async c => { await c.Campaigns.UpdateAsync("c", body, new(Project)); });
        await Organization("POST", "/platform/campaigns/c/launch", "{\"projectId\":\"" + Project + "\",\"scheduledAt\":0.5,\"skipMissingVariables\":false}", "{\"data\":{\"id\":\"c\",\"status\":\"queued\",\"operationId\":\"op\",\"future\":false}}", async c => { var r = (await c.Campaigns.LaunchAsync("c", new(Project, 0.5, false))).Data.Data; Check(r.Id == "c" && r.Status == "queued" && r.OperationId == "op" && !r.AdditionalFields!["future"].GetBoolean(), "Typed open launch result"); });
        await Organization("GET", "/platform/campaigns/c/analytics?projectId=" + Project, null, Envelope(Report, false), async c => Check((await c.Campaigns.AnalyticsAsync("c", new(Project))).Data.Data.FollowUps.NextDueAt is null, "Platform report"));
        var reasons = Enum.GetValues<CampaignRecipientFailureReason>();
        foreach (var reason in reasons)
        {
            var wireReason = JsonSerializer.SerializeToElement(reason).GetString()!;
            var row = Change(Recipient, "failureReason", JsonValue.Create(wireReason));
            row = Change(row, "nextMessageAt", JsonValue.Create(0.5));
            var page = "{\"success\":true,\"data\":[" + row + "],\"page\":{\"nextCursor\":null,\"hasMore\":false}}";
            await Messaging("GET", path + "/c/recipients?status=queued&cursor=next&limit=100&reason=" + wireReason, null, page, async c => { var r = (await c.Campaigns.ListRecipientsAsync("support", "c", new("queued", "next", 100, reason))).Data.Data[0]; Check(r.NextMessageAt == 0.5 && r.FailureReason == reason && r.MessagesSent == 0, "Fractional Messaging recipient"); });
        }
        await Organization("GET", "/platform/campaigns/c/recipients?projectId=" + Project + "&status=queued&cursor=next&limit=1&reason=other", null, "{\"data\":[" + Recipient + "],\"page\":{\"nextCursor\":null}}", async c => Check((await c.Campaigns.RecipientsAsync("c", new(Project, "queued", "next", 1, CampaignRecipientFailureReason.Other))).Data.Data[0].NextMessageAt is null, "Platform recipient"));
    }
    private static async Task RequestsAsync()
    {
        foreach (var key in new[] { "projectId", "id", "name", "followUp" })
            foreach (var value in new object?[] { null, Project, false, 0 })
                await NoHttp(async (_, c) => { await c.Campaigns.UpdateAsync("c", new() { AdditionalFields = new Dictionary<string, JsonElement> { [key] = JsonSerializer.SerializeToElement(value) } }, new(Project)); });
        await NoHttp(async (_, c) => { await c.Campaigns.UpdateAsync("c", new() { AdditionalFields = new Dictionary<string, JsonElement> { ["id"] = default } }, new(Project)); });
        await NoHttp(async (c, _) => { await c.Campaigns.UpdateAsync("support", "c", new()); });
        await NoHttp(async (_, c) => { await c.Campaigns.LaunchAsync("c", new("bad")); });
        await NoHttp(async (c, _) => { await c.Campaigns.ListRecipientsAsync("s", "c", new(Reason: (CampaignRecipientFailureReason)999)); });
        await NoHttp(async (c, _) => { await c.Campaigns.ListRecipientsAsync("s", "c", new(Limit: 101)); });
        await NoHttp(async (c, _) => { await c.Campaigns.ListRecipientsAsync("s", "c", new(Cursor: new string('x', 257))); });
        await NoHttp(async (_, c) => { await c.Campaigns.LaunchAsync("c", new(Project, double.NaN)); });
        await NoHttp(async (_, c) => { await c.Campaigns.UpdateAsync("c", new() { AdditionalFields = new Dictionary<string, JsonElement> { ["\ud800"] = JsonSerializer.SerializeToElement(false) } }, new(Project)); });
        var once = new SinglePassMessages();
        await Organization("POST", "/platform/campaigns", "{\"projectId\":\"" + Project + "\",\"name\":\"Campaign\",\"messagesArray\":[{}]}", Envelope(CampaignJson, false), async c => { await c.Campaigns.CreateAsync(new(Project, "Campaign", MessagesArray: once)); });
        Check(once.Enumerations == 1, "Caller messages enumerated once");
        var mapping = new CampaignVariableMapping { ["0"] = new(), ["__proto__"] = new("source.key", "fallback") };
        await Messaging("POST", "/messaging/projects/s/campaigns", "{\"name\":\"Campaign\",\"variableMapping\":{\"0\":{},\"__proto__\":{\"source\":\"source.key\",\"fallback\":\"fallback\"}},\"trackedLinks\":[{\"key\":\"a\",\"url\":\"HTTPS://Example.test\"},{\"key\":\"b\",\"url\":\"HTTPS://Example.test\"}]}", Envelope(CampaignJson), async c => { await c.Campaigns.CreateAsync("s", new("Campaign", VariableMapping: mapping, TrackedLinks: new[] { new CampaignTrackedLink("a", "HTTPS://Example.test"), new CampaignTrackedLink("b", "HTTPS://Example.test") })); });
        foreach (var bad in new[] { new CampaignVariableMapping { ["bad key"] = new() }, new CampaignVariableMapping { ["x"] = new("bad key") }, new CampaignVariableMapping { ["x"] = new(Fallback: "\ufeff\u00a0") }, new CampaignVariableMapping { ["x"] = new(Fallback: new string('x', 1025)) }, new CampaignVariableMapping(Enumerable.Range(0, 51).ToDictionary(i => "k" + i, _ => new CampaignVariableBinding())) })
            await NoHttp(async (c, _) => { await c.Campaigns.CreateAsync("s", new("Campaign", VariableMapping: bad)); });
        await NoHttp(async (c, _) => { await c.Campaigns.CreateAsync("s", new("Campaign", VariableMapping: PatchValue<CampaignVariableMapping>.Set(null))); });
        foreach (var url in new[] { "http://example.test", "https://user:pass@example.test", "https://127.0.0.1", "https://example.local.", "https://example.internal.", "https://example.localhost", "https://localhost", "https://example.123", "https://example.test/\u00a0", "https://example.test/" + new string('x', 2048), "https://example.test/" + new string('é', 400) })
            await NoHttp(async (c, _) => { await c.Campaigns.CreateAsync("s", new("Campaign", TrackedLinks: new[] { new CampaignTrackedLink("a", url) })); });
        await NoHttp(async (c, _) => { await c.Campaigns.CreateAsync("s", new("Campaign", TrackedLinks: new[] { new CampaignTrackedLink("a", "https://example.test"), new CampaignTrackedLink("a", "https://example.invalid") })); });
        foreach (var (text, allowed) in new[] { ("A synthetic follow-up.", true), ("{{ link:offer}}", false), ("{{LiNk:offer}}", false), ("{{\u00a0link:offer}}", false), ("{{\ufefflink:offer}}", false), ("{{\u202flink:offer}}", false), ("{{\u0085link:offer}}", true), ("{{lin\u212a:offer}}", true), ("{{link\u017f:offer}}", true) })
        {
            var request = new UpdateCampaignRequest { FollowUp = new CampaignFollowUp(new CampaignFollowUpText(text)) };
            if (allowed) await Messaging("PATCH", "/messaging/projects/s/campaigns/c", JsonSerializer.Serialize(new { followUp = new { message = new { type = "text", text } } }), Envelope(CampaignJson), async c => { await c.Campaigns.UpdateAsync("s", "c", request); });
            else await NoHttp(async (c, _) => { await c.Campaigns.UpdateAsync("s", "c", request); });
        }
        foreach (var follow in new[] { new CampaignFollowUp(new CampaignFollowUpText("x"), DelaySeconds: 604800), new CampaignFollowUp(new CampaignFollowUpText("x"), ExpirySeconds: 86400), new CampaignFollowUp(new CampaignFollowUpText("x"), DelaySeconds: 59), new CampaignFollowUp(new CampaignFollowUpText("x"), ExpirySeconds: 2592001) })
            await NoHttp(async (c, _) => { await c.Campaigns.UpdateAsync("s", "c", new() { FollowUp = follow }); });
        var open = new PlatformCampaignMessage { Source = new string('x', 4097), DelayAfterSec = 0, Buttons = Enumerable.Range(0, 4).Select(_ => new PlatformCampaignButton("reply", "")).ToArray(), Media = new("image", "") { AdditionalFields = new Dictionary<string, JsonElement> { ["future"] = JsonSerializer.SerializeToElement(false) } } };
        await Organization("POST", "/platform/campaigns", JsonSerializer.Serialize(new { projectId = Project, name = "Campaign", messagesArray = new object[] { new { }, new { source = new string('x', 4097), delayAfterSec = 0, buttons = Enumerable.Range(0, 4).Select(_ => new { kind = "reply", label = "" }), media = new { kind = "image", url = "", future = false } } } }), Envelope(CampaignJson, false), async c => { await c.Campaigns.CreateAsync(new(Project, "Campaign", MessagesArray: [new(), open])); });
        await NoHttp(async (_, c) => { await c.Campaigns.CreateAsync(new(Project, "Campaign", Variants: PatchValue<IReadOnlyList<CampaignVariant>>.Set(null))); });
        await NoHttp(async (_, c) => { await c.Campaigns.CreateAsync(new(Project, "Campaign", MessagesArray: Enumerable.Range(0, 11).Select(_ => new PlatformCampaignMessage()).ToArray())); });
        await NoHttp(async (_, c) => { await c.Campaigns.CreateAsync(new(Project, "Campaign", MessagesArray: [new() { Version = 3 }])); });
        await NoHttp(async (c, _) => { await c.Campaigns.CreateAsync("s", new("Campaign", VariableMapping: new CampaignVariableMapping { ["x"] = new(Source: PatchValue<string>.Set(null)) })); });
        await NoHttp(async (_, c) => { await c.Campaigns.CreateAsync(new(Project, "Campaign", MessagesArray: [new() { AdditionalFields = new Dictionary<string, JsonElement> { ["source"] = JsonSerializer.SerializeToElement("injected") } }])); });
        await NoHttp(async (_, c) => { await c.Campaigns.CreateAsync(new(Project, "Campaign", MessagesArray: [new() { Media = new("image", "url") { AdditionalFields = new Dictionary<string, JsonElement> { ["kind"] = JsonSerializer.SerializeToElement("video") } } }])); });
        var variants = new[] { new CampaignVariant("a", new string(' ', 50) + "A" + new string(' ', 50), 50, new(2, "source")), new CampaignVariant("b", "B", 50, new(2, "source")) };
        await Messaging("POST", "/messaging/projects/s/campaigns", JsonSerializer.Serialize(new { name = "Campaign", variants = new[] { new { key = "a", label = variants[0].Label, weight = 50, blueprint = new { version = 2, source = "source" } }, new { key = "b", label = "B", weight = 50, blueprint = new { version = 2, source = "source" } } } }), Envelope(CampaignJson), async c => { await c.Campaigns.CreateAsync("s", new("Campaign", Variants: variants)); });
        await NoHttp(async (_, c) => { await c.Campaigns.CreateAsync(new(Project, "Campaign", Variants: variants)); });
        variants[0] = variants[0] with { Label = "A", Blueprint = new(3, "source") };
        await NoHttp(async (c, _) => { await c.Campaigns.CreateAsync("s", new("Campaign", Variants: variants)); });
        await NoHttp(async (c, _) => { await c.Campaigns.CreateAsync("s", new InjectedCreate("Campaign")); });
        await NoHttp(async (c, _) => { await c.Campaigns.UpdateAsync("s", "c", new() { Name = "\ud800" }); });
    }
    private sealed class SinglePassMessages : IReadOnlyList<PlatformCampaignMessage>
    {
        internal int Enumerations;
        public int Count => 1;
        public PlatformCampaignMessage this[int index] => index == 0 ? new() : throw new IndexOutOfRangeException();
        public IEnumerator<PlatformCampaignMessage> GetEnumerator() { if (++Enumerations > 1) throw new Exception("Caller collection enumerated twice"); yield return new(); }
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    }
    private sealed record InjectedCreate(string Name) : CreateCampaignRequest(Name) { [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.Never)] public string? ProjectId => null; [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.Never)] public string? Id => null; }
    private static async Task ResponsesAsync()
    {
        foreach (var field in new[] { "trackedLinks", "experimentOutcome", "followUp", "sendWindow", "recipientCount" })
            await Messaging("GET", "/messaging/projects/s/campaigns/c", null, Envelope(Change(CampaignJson, field, null, true)), c => InvalidResponse(async () => { await c.Campaigns.RetrieveAsync("s", "c"); }));
        foreach (var field in new[] { "averageResponseTimeMs", "minResponseTimeMs", "maxResponseTimeMs", "experiment", "followUps", "sentCount" })
            await Organization("GET", "/platform/campaigns/c/analytics?projectId=" + Project, null, Envelope(Change(Report, field, null, true), false), c => InvalidResponse(async () => { await c.Campaigns.AnalyticsAsync("c", new(Project)); }));
        var links = new JsonArray(Enumerable.Range(0, 6).Select(i => (JsonNode)new JsonObject { ["key"] = "k" + i, ["url"] = "https://example.test/normalized" }).ToArray());
        var full = Change(CampaignJson, "trackedLinks", links); full = Change(full, "followUp", JsonNode.Parse("{\"message\":{\"type\":\"text\",\"text\":\"ok\"}}")); full = Change(full, "variableMapping", null);
        await Organization("GET", "/platform/campaigns/c?projectId=" + Project, null, Envelope(full, false), async c => { var value = (await c.Campaigns.RetrieveAsync("c", new(Project))).Data.Data!; Check(value.TrackedLinks.Count == 6 && value.VariableMapping is null && value.FollowUp!.DelaySeconds is null, "Stored links or sparse follow-up"); });
        foreach (var field in new[] { "failureReason", "messagesSent", "nextMessageAt", "sequenceError", "followUp" })
            await Messaging("GET", "/messaging/projects/s/campaigns/c/recipients", null, "{\"success\":true,\"data\":[" + Change(Recipient, field, null, true) + "],\"page\":{\"nextCursor\":null,\"hasMore\":false}}", c => InvalidResponse(async () => { await c.Campaigns.ListRecipientsAsync("s", "c"); }));
        await Organization("GET", "/platform/campaigns/c/recipients?projectId=" + Project, null, "{\"data\":[" + Change(Recipient, "nextMessageAt", JsonValue.Create(0.5)) + "],\"page\":{\"nextCursor\":null}}", c => InvalidResponse(async () => { await c.Campaigns.RecipientsAsync("c", new(Project)); }));
        foreach (var (status, code) in new[] { (409, "campaign_approval_stale"), (422, "campaign_variables_missing"), (400, "future_code"), (404, "not_found") })
            await Organization("POST", "/platform/campaigns/c/launch", "{\"projectId\":\"" + Project + "\"}", "{\"error\":{\"code\":\"" + code + "\",\"message\":\"Synthetic\",\"param\":\"variables\"}}", async c => { try { await c.Campaigns.LaunchAsync("c", new(Project)); throw new Exception("Remote denial accepted"); } catch (PolymorfaException e) { Check(e.Status == status && e.Code == code && e.Param == "variables" && e.Metadata!.Headers["x-trace-id"] == "safe", "Remote metadata"); } }, status, headers: new Dictionary<string, string> { ["x-trace-id"] = "safe", ["idempotent-replayed"] = "false", ["set-cookie"] = "secret" });
    }
    private static async Task ReplayAsync()
    {
        for (var route = 0; route < 4; route++)
        {
            using var wire = new WireFixture { AbsentHeaders = ["idempotency-key"] }; using var messaging = new MessagingClient(Key, Options(wire)); using var org = new OrganizationClient(Key, Options(wire));
            var path = route switch { 0 => "/messaging/projects/s/campaigns/c/recipients", 1 => "/platform/campaigns/c/recipients", 2 => "/platform/audiences", _ => "/platform/audiences/a/members" };
            var body = route switch { 0 => "{\"recipients\":[]}", 1 => "{\"projectId\":\"" + Project + "\",\"recipients\":[]}", 2 => "{\"name\":\"A\",\"members\":[]}", _ => "{\"members\":[]}" };
            var serve = wire.ServeAsync("POST", path, body, "{\"error\":{\"code\":\"unknown_effect\",\"message\":\"Synthetic\"}}", 503);
            try
            {
                var options = new RequestOptions { MaxNetworkRetries = 1 };
                switch (route)
                {
                    case 0: await messaging.Campaigns.AddRecipientsAsync("s", "c", new([]), options); break;
                    case 1: await org.Campaigns.AddRecipientsAsync("c", new(Project, []), options); break;
                    case 2: await org.Audiences.CreateAsync(CreateAudienceRequest.FromMembers("A", []), options); break;
                    case 3: await org.Audiences.AddMembersAsync("a", new([]), options); break;
                }
                throw new Exception("Uncertain write succeeded");
            }
            catch (PolymorfaServerException e) { Check(e.Code == "unknown_effect" && e.Metadata?.Attempts == 1, "No key means one unsafe attempt"); }
            await serve; Check(!wire.Pending, "No second unsafe attempt");
        }
        for (var route = 0; route < 4; route++)
        {
            using var wire = new WireFixture(); using var messaging = new MessagingClient(Key, Options(wire)); using var org = new OrganizationClient(Key, Options(wire));
            var members = new List<CampaignRecipientInput> { new("+15550001111") }; var headers = new Dictionary<string, string> { ["x-snapshot"] = "before" };
            var options = new RequestOptions { IdempotencyKey = "caller-key", MaxNetworkRetries = 1, Headers = headers };
            var path = route switch { 0 => "/messaging/projects/s/campaigns/c/recipients", 1 => "/platform/campaigns/c/recipients", 2 => "/platform/audiences", _ => "/platform/audiences/a/members" };
            var body = route switch { 0 => "{\"recipients\":[{\"phone\":\"+15550001111\"}]}", 1 => "{\"projectId\":\"" + Project + "\",\"recipients\":[{\"phone\":\"+15550001111\"}]}", 2 => "{\"name\":\"A\",\"members\":[{\"phone\":\"+15550001111\"}]}", _ => "{\"members\":[{\"phone\":\"+15550001111\"}]}" };
            async Task Serve()
            {
                await wire.ServeAsync("POST", path, body, "{\"error\":{\"code\":\"temporary\",\"message\":\"Synthetic\"}}", 503);
                var first = wire.CapturedBody.ToArray(); members.Clear(); headers["x-snapshot"] = "after";
                var result = route < 2 ? Added : route == 2 ? "{\"id\":\"a\",\"name\":\"A\",\"source\":\"api\",\"recipientCount\":0,\"createdAt\":0,\"updatedAt\":0,\"duplicateCount\":0,\"invalidCount\":0,\"invalidRows\":[]}" : "{\"listId\":\"a\",\"added\":0,\"recipientCount\":0,\"duplicateCount\":0,\"invalidCount\":0,\"invalidRows\":[]}";
                await wire.ServeAsync("POST", path, body, Envelope(result, route == 0), expectedHeaders: new Dictionary<string, string> { ["idempotency-key"] = "caller-key", ["x-snapshot"] = "before" });
                Check(first.SequenceEqual(wire.CapturedBody), "Retry bytes changed");
            }
            var server = Serve();
            switch (route)
            {
                case 0: await messaging.Campaigns.AddRecipientsAsync("s", "c", new(members), options); break;
                case 1: await org.Campaigns.AddRecipientsAsync("c", new(Project, members), options); break;
                case 2: await org.Audiences.CreateAsync(CreateAudienceRequest.FromMembers("A", members), options); break;
                case 3: await org.Audiences.AddMembersAsync("a", new(members), options); break;
            }
            await server; Check(!wire.Pending, "Extra replay");
        }
    }
}
