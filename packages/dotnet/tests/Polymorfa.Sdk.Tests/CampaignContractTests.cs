using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Polymorfa.Sdk;

internal static class CampaignContractTests
{
    internal const string A = "11111111-1111-4111-8111-111111111111";
    internal const string B = "22222222-2222-4222-8222-222222222222";
    internal const string C = "33333333-3333-4333-8333-333333333333";
    internal const string Phone = "+15551234567";
    internal static Credential OrganizationKey() => Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k");
    internal const string Profile = "{\"id\":\"" + A + "\",\"phone\":\"+15551234567\",\"revision\":1,\"tags\":[\"lead\"],\"attributes\":{\"empty\":null,\"ok\":false,\"score\":1.5},\"provenance\":null,\"createdAt\":0,\"updatedAt\":1}";
    internal const string Consent = "{\"id\":\"" + B + "\",\"profileRevision\":1,\"createdAt\":0,\"purpose\":\"campaigns\",\"allowed\":false,\"source\":\"api\",\"reference\":\"supplied\",\"assertedAt\":0}";
    internal const string Job = "{\"id\":\"" + A + "\",\"state\":\"queued\",\"totalValid\":1,\"invalidCount\":1,\"invalidSamples\":[{\"row\":2,\"reason\":\"invalid_phone\"}],\"conflictSamples\":[{\"row\":3,\"reason\":\"quota\"}],\"processedValid\":0,\"createdCount\":0,\"updatedCount\":0,\"conflictCount\":1,\"createdAt\":0,\"updatedAt\":1,\"completedAt\":null}";
    internal const string Definition = "{\"entryNodeId\":\"entry\",\"nodes\":[{\"id\":\"entry\",\"edges\":[{\"match\":{\"kind\":\"keyword\",\"value\":\"yes\"},\"to\":\"done\"}],\"send\":{\"kind\":\"text\",\"text\":\"Hello\"}},{\"id\":\"done\",\"edges\":[]}]}";
    internal const string Flow = "{\"id\":\"" + A + "\",\"flowKey\":\"" + B + "\",\"revision\":1,\"name\":\"Welcome\",\"definition\":" + Definition + ",\"createdAt\":0}";
    internal const string Assignment = "{\"campaignId\":\"" + C + "\",\"replyFlowId\":null}";
    internal const string Test = "{\"id\":\"" + A + "\",\"campaignId\":\"" + C + "\",\"status\":\"sent\",\"from\":{\"sessionId\":\"" + B + "\",\"phone\":\"+15551234567\"},\"to\":\"+15551234567\",\"messageId\":null,\"variables\":{\"ok\":\"false\",\"score\":\"1\"},\"createdAt\":0}";
    internal const string Links = "[{\"key\":\"welcome\",\"url\":\"https://example.test/welcome\",\"uniqueOpens\":0,\"totalOpens\":2}]";
    internal const string Approval = "{\"id\":\"" + A + "\",\"campaignId\":\"" + C + "\",\"action\":\"launch\",\"status\":\"pending\",\"reasons\":[\"agent_request\"],\"recipientCount\":3,\"scheduledAt\":null,\"requestedBy\":{\"type\":\"api_key\",\"id\":\"" + B + "\"},\"requestedAt\":0,\"expiresAt\":1,\"decidedBy\":null,\"decidedAt\":null,\"operationId\":null}";
    internal const string Stop = "{\"teamId\":\"" + A + "\",\"enabled\":false,\"locale\":null,\"revision\":0,\"textRevision\":1,\"acknowledgement\":null,\"updatedAt\":null}";
    internal const string Custody = "{\"signalModeDefault\":null,\"effectiveSignalMode\":\"zero_knowledge\",\"revision\":0}";
    internal const string Retarget = "{\"id\":\"" + A + "\",\"name\":\"Again\",\"source\":\"campaign\",\"recipientCount\":3,\"fileId\":null,\"columns\":null,\"sampleRow\":null,\"mapping\":null,\"createdAt\":0,\"updatedAt\":1,\"sourceCampaignId\":\"" + C + "\",\"outcome\":\"not_replied\",\"matchedCount\":3,\"optedOutCount\":0}";
    private static readonly IReadOnlyDictionary<string, string> CsvHeaders = new Dictionary<string, string> { ["content-type"] = "text/csv; charset=utf-8", ["polymorfa-next-cursor"] = "next", ["content-disposition"] = "attachment; filename*=UTF-8''r%C3%A9cipients.csv", ["x-trace-id"] = "trace", ["idempotent-replayed"] = "true" };
    internal static string Envelope(string value, bool success = false) => "{" + (success ? "\"success\":true," : "") + "\"data\":" + value + "}";
    internal static CampaignReplyFlowDefinition Graph(string text = "Hello", string keyword = "yes") => new("entry", [new("entry", [new(new CampaignReplyKeyword(keyword), "done")], new CampaignReplyText(text)), new("done", [])]);
    private static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static int checks;
    private static async Task Wire<T>(string method, string path, string? body, string response, Func<OrganizationClient, MessagingClient, Task<ApiResponse<T>>> call, Action<T> verify, IReadOnlyDictionary<string, string>? headers = null, int status = 200, string version = "2026-10-14")
    {
        using var fixture = new WireFixture { Authorization = "Bearer pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k", ExpectedHeaders = new Dictionary<string, string> { ["polymorfa-version"] = version } };
        var serving = fixture.ServeAsync(method, path, body, response, status, headers);
        using var org = new OrganizationClient(OrganizationKey(), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0 });
        using var messaging = new MessagingClient(OrganizationKey(), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0 });
        ApiResponse<T> result;
        try { result = await call(org, messaging); }
        catch { if (serving.IsFaulted) await serving; throw; }
        await serving;
        Check(result.Metadata.Status == status && result.Metadata.RequestId == "req_native", "Contract metadata lost.");
        if (headers?.ContainsKey("x-trace-id") == true) Check(result.Metadata.Headers["x-trace-id"] == "trace" && result.Metadata.Headers["idempotent-replayed"] == "true" && result.Metadata.Headers.ContainsKey("content-disposition"), "Success safe headers lost.");
        if (body is not null && path == "/platform/audience-profile-imports") Check(fixture.CapturedBody.Length <= 14 * 1024 * 1024, "Actual import wire quota exceeded.");
        verify(result.Data); checks++;
    }
    private static async Task Invalid(Func<OrganizationClient, MessagingClient, Task> call)
    {
        using var fixture = new WireFixture();
        using var org = new OrganizationClient(OrganizationKey(), new() { BaseUrl = fixture.Url });
        using var messaging = new MessagingClient(Credential.ClientToken("pmfa_ct_" + new string('c', 64)), new() { BaseUrl = fixture.Url });
        try { await call(org, messaging); throw new Exception("Invalid input accepted."); }
        catch (PolymorfaConfigurationException) { Check(!fixture.Pending, "Invalid input reached TCP."); checks++; }
    }
    public static async Task LargeImportAsync()
    {
        var encoded = Convert.ToBase64String(Encoding.UTF8.GetBytes(new string('\uffff', 3495253) + "x"));
        await Wire("POST", "/platform/audience-profile-imports", "{\"replayKey\":\"large\",\"csvBase64\":\"" + encoded + "\"}", Envelope(Job), (o, _) => o.AudienceProfiles.Imports.CreateAsync(new("large", encoded)), r => Check(r.Data.State == "queued", "Import state differs."));
        Console.WriteLine("PASS exact 10 MiB plus-rich CSV import over TCP");
    }
    public static async Task RunAsync()
    {
        checks = 0;
        await RoutesAsync();
        await BoundViewsAsync();
        await ValidationAsync();
        await ResponsesAsync();
        await RetryAsync();
        await LargeImportAsync();
        Console.WriteLine($"PASS campaign contract {checks} TCP and pre-I/O checks");
    }
    internal static async Task RoutesAsync()
    {
        await Wire("GET", "/platform/audience-profiles?cursor=" + B + "&limit=1", null, "{\"data\":[" + Profile + "],\"page\":{\"nextCursor\":\"" + B + "\",\"hasMore\":true}}", (o, _) => o.AudienceProfiles.ListAsync(new(B, 1)), r => Check(r.Data[0].Attributes.Count == 3 && r.Data[0].Attributes["empty"].Kind == JsonValueKind.Null && r.Data[0].Attributes["ok"].BooleanValue == false && r.Data[0].Attributes["score"].NumberValue == 1.5 && r.Data[0].Provenance is null && r.Page.HasMore && r.Page.NextCursor == B, "Profile page differs."));
        await Wire("GET", "/platform/audience-profiles/%2B15551234567", null, Envelope(Profile), (o, _) => o.AudienceProfiles.RetrieveAsync(Phone), r => Check(r.Data.Id == A && r.Data.Phone == Phone && r.Data.Revision == 1 && r.Data.Tags.Single() == "lead" && r.Data.CreatedAt == 0 && r.Data.UpdatedAt == 1, "Profile fields differ."));
        var profileBody = "{\"tags\":[\"lead\"],\"attributes\":{\"empty\":null,\"ok\":false,\"score\":1.5},\"expectedRevision\":1,\"provenance\":{\"source\":\"form\",\"reference\":\"form_1\"},\"consent\":{\"purpose\":\"campaigns\",\"allowed\":false,\"source\":\"api\",\"reference\":\"supplied\",\"assertedAt\":0}}";
        await Wire("PUT", "/platform/audience-profiles/%2B15551234567", profileBody, Envelope(Profile), (o, _) => o.AudienceProfiles.PutAsync(Phone, new(["lead"], new Dictionary<string, AudienceProfileAttributeValue> { ["empty"] = AudienceProfileAttributeValue.Null, ["ok"] = false, ["score"] = 1.5 }, 1, new(AudienceProfileSource.Form, "form_1"), new("campaigns", false, AudienceProfileSource.Api, "supplied", 0))), r => Check(r.Data.Attributes.ContainsKey("empty"), "Explicit null attribute lost."));
        await Wire("DELETE", "/platform/audience-profiles/%2B15551234567?expectedRevision=1", null, "{\"data\":{\"deleted\":true,\"phone\":\"+15551234567\",\"revision\":2}}", (o, _) => o.AudienceProfiles.DeleteAsync(Phone, 1), r => Check(r.Data.Deleted && r.Data.Revision == 2 && r.Data.Phone == Phone, "Delete result differs."));
        await Wire("GET", "/platform/audience-profiles/%2B15551234567/consent?limit=1", null, "{\"data\":[" + Consent + "],\"page\":{\"nextCursor\":null,\"hasMore\":false}}", (o, _) => o.AudienceProfiles.ListConsentAsync(Phone, new(Limit: 1)), r => Check(!r.Page.HasMore && r.Page.NextCursor is null && r.Data[0] is { Id: B, ProfileRevision: 1, CreatedAt: 0, Purpose: "campaigns", Allowed: false, Source: AudienceProfileSource.Api, Reference: "supplied", AssertedAt: 0 }, "Consent fields differ."));
        await Wire("POST", "/platform/audience-profile-imports", "{\"replayKey\":\"import_1\",\"csvBase64\":\"YSxiCg==\",\"mapping\":{\"phone\":\"phone\",\"tags\":\"tags\",\"attributes\":\"attributes\"}}", Envelope(Job), (o, _) => o.AudienceProfiles.Imports.CreateAsync(new("import_1", "YSxiCg==", new("phone", "tags", "attributes"))), r => VerifyJob(r.Data));
        await Wire("GET", "/platform/audience-profile-imports/" + A, null, Envelope(Job), (o, _) => o.AudienceProfiles.Imports.RetrieveAsync(A), r => VerifyJob(r.Data));
        await Wire("DELETE", "/platform/audience-profile-imports/" + A, null, Envelope(Job.Replace("queued", "cancelled")), (o, _) => o.AudienceProfiles.Imports.CancelAsync(A), r => Check(r.Data.State == "cancelled", "Import cancel differs."));
        await Wire("GET", "/platform/campaign-settings", null, "{\"data\":{\"launchApproval\":{\"recipientThreshold\":null}}}", (o, _) => o.Campaigns.GetSettingsAsync(), r => Check(r.Data.LaunchApproval.RecipientThreshold is null, "Null setting lost."));
        await Wire("GET", "/platform/campaign-reply-flows/" + A + "?projectId=" + B, null, Envelope(Flow), (o, _) => o.Campaigns.GetReplyFlowAsync(A, new(B)), r => VerifyFlow(r.Data));
        await Wire("POST", "/platform/campaign-reply-flows", "{\"projectId\":\"" + B + "\",\"name\":\"Welcome\",\"definition\":" + Definition + "}", Envelope(Flow), (o, _) => o.Campaigns.CreateReplyFlowAsync(new(B, "Welcome", Graph())), r => VerifyFlow(r.Data));
        await Wire("PUT", "/platform/campaigns/" + C + "/reply-flow", "{\"projectId\":\"" + B + "\",\"replyFlowId\":null}", Envelope(Assignment), (o, _) => o.Campaigns.SetReplyFlowAsync(C, new(B, null)), r => Check(r.Data.CampaignId == C && r.Data.ReplyFlowId is null, "Detach null lost."));
        await Wire("POST", "/platform/campaigns/" + C + "/test-send", "{\"projectId\":\"" + B + "\",\"sessionId\":\"" + A + "\",\"to\":\"+15551234567\",\"variables\":{\"ok\":false,\"score\":1}}", Envelope(Test), (o, _) => o.Campaigns.TestSendAsync(C, new(B, A, Phone, Variables: new Dictionary<string, CampaignVariableValue> { ["ok"] = false, ["score"] = 1d })), r => VerifyTest(r.Data));
        await Wire("GET", "/platform/campaigns/" + C + "/approvals?projectId=" + B, null, Envelope("[" + Approval + "]"), (o, _) => o.Campaigns.ListLaunchApprovalsAsync(C, new(B)), r => VerifyApproval(r.Data.Single()));
        await Wire("GET", "/platform/campaigns/" + C + "/links?projectId=" + B, null, Envelope(Links), (o, _) => o.Campaigns.LinksAsync(C, new(B)), r => VerifyLinks(r.Data));
        await Wire("GET", "/platform/campaigns/" + C + "/recipients/export?status=failed&reason=missing_variable&limit=1000&projectId=" + B, null, "phone,note\r\n+15551234567,\"=SUM(A1)\"\r\n", (o, _) => o.Campaigns.ExportRecipientsAsync(C, new(B, CampaignExportStatus.Failed, CampaignRecipientFailureReason.MissingVariable, Limit: 1000)), VerifyCsv, CsvHeaders);
        await Wire("POST", "/platform/audiences/from-campaign", "{\"name\":\" Again \",\"campaignId\":\"" + C + "\",\"outcome\":\"not_replied\",\"projectId\":\"" + B + "\"}", Envelope(Retarget), (o, _) => o.Audiences.CreateFromCampaignAsync(new(" Again ", C, CampaignRetargetOutcome.NotReplied, B)), r => Check(r.Data is { Id: A, Name: "Again", Source: "campaign", RecipientCount: 3, FileId: null, Columns: null, SampleRow: null, Mapping: null, CreatedAt: 0, UpdatedAt: 1, SourceCampaignId: C, Outcome: CampaignRetargetOutcome.NotReplied, MatchedCount: 3, OptedOutCount: 0 }, "Retarget fields differ."));
        await Wire("GET", "/platform/optouts/confirmation-settings", null, Envelope(Stop), (o, _) => o.OptOuts.GetConfirmationSettingsAsync(), r => VerifyStop(r.Data));
        await Wire("PUT", "/platform/optouts/confirmation-settings", "{\"teamId\":\"" + A + "\",\"revision\":0,\"enabled\":false,\"locale\":null}", Envelope(Stop), (o, _) => o.OptOuts.UpdateConfirmationSettingsAsync(new(A, 0, false, null)), r => VerifyStop(r.Data));
        await Wire("GET", "/platform/optouts/confirmation-summary", null, "{\"data\":{\"enabled\":false,\"counts\":{\"queued\":0,\"admitted\":1,\"completed\":2,\"failed\":3,\"unknown\":4}}}", (o, _) => o.OptOuts.GetConfirmationSummaryAsync(), r => Check(!r.Data.Enabled && r.Data.Counts is { Queued: 0, Admitted: 1, Completed: 2, Failed: 3, Unknown: 4 }, "Summary fields differ."));
        await Wire("GET", "/platform/projects/" + B + "/signal-custody", null, Envelope(Custody), (o, _) => o.Projects.GetSignalCustodyAsync(B), r => VerifyCustody(r.Data));
        await Wire("PUT", "/platform/projects/" + B + "/signal-custody", "{\"expectedRevision\":0,\"signalModeDefault\":\"standard\"}", Envelope(Custody), (o, _) => o.Projects.UpdateSignalCustodyAsync(B, new(0, SignalCustodyMode.Standard)), r => VerifyCustody(r.Data));
        await Wire("GET", "/platform/projects/" + B + "/customers/" + A + "/signal-custody", null, Envelope(Custody), (o, _) => o.Customers.GetSignalCustodyAsync(A, B), r => VerifyCustody(r.Data));
        await Wire("PUT", "/platform/projects/" + B + "/customers/" + A + "/signal-custody", "{\"expectedRevision\":0,\"signalModeDefault\":null}", Envelope(Custody), (o, _) => o.Customers.UpdateSignalCustodyAsync(A, B, new(0, null)), r => VerifyCustody(r.Data));
        const string prefix = "/messaging/projects/launch%2Feu";
        await Wire("GET", prefix + "/campaign-reply-flows/" + A, null, Envelope(Flow, true), (_, m) => m.Campaigns.GetReplyFlowAsync("launch/eu", A), r => { Check(r.Success, "Success lost."); VerifyFlow(r.Data); });
        await Wire("POST", prefix + "/campaign-reply-flows", "{\"name\":\"Welcome\",\"definition\":" + Definition + "}", Envelope(Flow, true), (_, m) => m.Campaigns.CreateReplyFlowAsync("launch/eu", new("Welcome", Graph())), r => VerifyFlow(r.Data));
        await Wire("PUT", prefix + "/campaigns/" + C + "/reply-flow", "{\"replyFlowId\":null}", Envelope(Assignment, true), (_, m) => m.Campaigns.SetReplyFlowAsync("launch/eu", C, new(null)), r => Check(r.Data.ReplyFlowId is null, "Messaging detach null lost."));
        await Wire("POST", prefix + "/campaigns/" + C + "/test-send", "{\"sessionId\":\"" + A + "\",\"to\":\"+15551234567\"}", Envelope(Test, true), (_, m) => m.Campaigns.TestSendAsync("launch/eu", C, new(A, Phone)), r => VerifyTest(r.Data));
        await Wire("GET", prefix + "/campaigns/" + C + "/links", null, Envelope(Links, true), (_, m) => m.Campaigns.LinksAsync("launch/eu", C), r => VerifyLinks(r.Data));
        await Wire("GET", prefix + "/campaigns/" + C + "/recipients/export?cursor=page%2F2&limit=1", null, "phone,note\r\n+15551234567,\"=SUM(A1)\"\r\n", (_, m) => m.Campaigns.ExportRecipientsAsync("launch/eu", C, new(Cursor: "page/2", Limit: 1)), VerifyCsv, CsvHeaders);
        await Wire("GET", "/platform/campaign-settings", null, "{\"data\":{\"launchApproval\":{\"recipientThreshold\":10}}}", (o, _) => o.Campaigns.GetSettingsAsync(new() { ApiVersion = "2026-09-22" }), r => Check(r.Data.LaunchApproval.RecipientThreshold == 10, "Override response differs."), version: "2026-09-22");
    }
    private static void VerifyJob(AudienceProfileImportJob j) => Check(j is { Id: A, TotalValid: 1, InvalidCount: 1, ProcessedValid: 0, CreatedCount: 0, UpdatedCount: 0, ConflictCount: 1, CreatedAt: 0, UpdatedAt: 1, CompletedAt: null } && j.InvalidSamples.Single() is { Row: 2, Reason: "invalid_phone" } && j.ConflictSamples.Single() is { Row: 3, Reason: "quota" }, "Import fields differ.");
    private static void VerifyFlow(CampaignReplyFlow f) => Check(f is { Id: A, FlowKey: B, Revision: 1, Name: "Welcome", CreatedAt: 0 } && f.Definition.EntryNodeId == "entry" && f.Definition.Nodes.Count == 2 && f.Definition.Nodes[0].Send is CampaignReplyText { Text: "Hello" } && f.Definition.Nodes[0].Edges[0].Match is CampaignReplyKeyword { Value: "yes" }, "Flow fields differ.");
    private static void VerifyTest(CampaignTestSend t) => Check(t is { Id: A, CampaignId: C, Status: "sent", To: Phone, MessageId: null, CreatedAt: 0 } && t.From is { SessionId: B, Phone: Phone } && t.Variables["ok"] == "false" && t.Variables["score"] == "1", "Test fields differ.");
    private static void VerifyApproval(CampaignLaunchApproval a) => Check(a is { Id: A, CampaignId: C, Action: "launch", Status: "pending", RecipientCount: 3, ScheduledAt: null, RequestedAt: 0, ExpiresAt: 1, DecidedBy: null, DecidedAt: null, OperationId: null } && a.Reasons.Single() == "agent_request" && a.RequestedBy is { Type: "api_key", Id: B }, "Approval fields differ.");
    private static void VerifyLinks(IReadOnlyList<CampaignTrackedLinkReport> links) => Check(links.Single() is { Key: "welcome", Url: "https://example.test/welcome", UniqueOpens: 0, TotalOpens: 2 }, "Link fields differ.");
    private static void VerifyStop(StopConfirmationSettings s) => Check(s is { TeamId: A, Enabled: false, Locale: null, Revision: 0, TextRevision: 1, Acknowledgement: null, UpdatedAt: null }, "STOP fields differ.");
    private static void VerifyCustody(SignalCustodyDefault s) => Check(s is { SignalModeDefault: null, EffectiveSignalMode: SignalCustodyMode.ZeroKnowledge, Revision: 0 }, "Custody fields differ.");
    private static void VerifyCsv(CampaignRecipientExportPage p) => Check(p.Csv == "phone,note\r\n+15551234567,\"=SUM(A1)\"\r\n" && p.NextCursor == "next" && p.Filename == "récipients.csv", "CSV bytes/metadata differ.");
    private static async Task BoundViewsAsync()
    {
        // Each alias retains its captured owner, including after a borrowed view is disposed.
        foreach (var credential in new[] { OrganizationKey(), Credential.ProjectToken("pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k") })
        {
            using var fixture = new WireFixture { ExpectedHeaders = new Dictionary<string, string> { ["polymorfa-version"] = "2026-10-14" } };
            using var owning = new ProjectClient(credential, A, new() { BaseUrl = fixture.Url });
            using var retained = owning.Project(A);
            if (credential.Kind == CredentialKind.OrganizationApiKey) { using var other = owning.Project(B); Check(other.ProjectId == B, "Organization rebind changed."); }
            else { try { owning.Project(B); throw new Exception("Project token rebound."); } catch (PolymorfaConfigurationException) { } }
            retained.Dispose();
            async Task Bound<T>(string method, string path, string? body, string reply, Func<Task<ApiResponse<T>>> call, Action<T> verify, bool csv = false)
            {
                var serving = fixture.ServeAsync(method, path, body, reply, responseHeaders: csv ? CsvHeaders : null);
                var result = await call(); await serving; verify(result.Data); Check(result.Metadata.RequestId == "req_native", "Bound metadata lost."); checks++;
            }
            await Bound("GET", "/platform/campaign-reply-flows/" + A + "?projectId=" + A, null, Envelope(Flow), () => retained.Campaigns.GetReplyFlowAsync(A), r => VerifyFlow(r.Data));
            await Bound("POST", "/platform/campaign-reply-flows", "{\"projectId\":\"" + A + "\",\"name\":\"Welcome\",\"definition\":" + Definition + "}", Envelope(Flow), () => retained.Campaigns.CreateReplyFlowAsync(new("Welcome", Graph())), r => VerifyFlow(r.Data));
            await Bound("PUT", "/platform/campaigns/" + C + "/reply-flow", "{\"projectId\":\"" + A + "\",\"replyFlowId\":null}", Envelope(Assignment), () => retained.Campaigns.SetReplyFlowAsync(C, new(null)), r => Check(r.Data.ReplyFlowId is null, "Bound reset lost."));
            await Bound("POST", "/platform/campaigns/" + C + "/test-send", "{\"projectId\":\"" + A + "\",\"sessionId\":\"" + B + "\",\"to\":\"+15551234567\"}", Envelope(Test), () => retained.Campaigns.TestSendAsync(C, new(B, Phone)), r => VerifyTest(r.Data));
            await Bound("GET", "/platform/campaigns/" + C + "/approvals?projectId=" + A, null, Envelope("[" + Approval + "]"), () => retained.Campaigns.ListLaunchApprovalsAsync(C), r => VerifyApproval(r.Data.Single()));
            await Bound("GET", "/platform/campaigns/" + C + "/links?projectId=" + A, null, Envelope(Links), () => retained.Campaigns.LinksAsync(C), r => VerifyLinks(r.Data));
            await Bound("GET", "/platform/campaigns/" + C + "/recipients/export?projectId=" + A, null, "phone,note\r\n+15551234567,\"=SUM(A1)\"\r\n", () => retained.Campaigns.ExportRecipientsAsync(C), VerifyCsv, true);
            await Bound("GET", "/platform/projects/" + A + "/signal-custody", null, Envelope(Custody), () => retained.SignalCustody.RetrieveAsync(), VerifyCustody);
            await Bound("PUT", "/platform/projects/" + A + "/signal-custody", "{\"expectedRevision\":0,\"signalModeDefault\":\"zero_knowledge\"}", Envelope(Custody), () => retained.SignalCustody.UpdateAsync(new(0, SignalCustodyMode.ZeroKnowledge)), VerifyCustody);
            await Bound("GET", "/platform/projects/" + A + "/customers/" + B + "/signal-custody", null, Envelope(Custody), () => retained.SignalCustody.RetrieveCustomerAsync(B), VerifyCustody);
            await Bound("PUT", "/platform/projects/" + A + "/customers/" + B + "/signal-custody", "{\"expectedRevision\":0,\"signalModeDefault\":null}", Envelope(Custody), () => retained.SignalCustody.UpdateCustomerAsync(B, new(0, null)), VerifyCustody);
        }
        using var slot = new WireFixture();
        using var organization = new OrganizationClient(OrganizationKey(), new() { BaseUrl = slot.Url });
        using var first = organization.Project(A); using var second = organization.Project(B);
        foreach (var view in new[] { first, second, first })
        {
            var serving = slot.ServeAsync("GET", "/platform/campaign-reply-flows/" + A + "?projectId=" + view.ProjectId, null, Envelope(Flow));
            VerifyFlow((await view.Campaigns.GetReplyFlowAsync(A)).Data.Data); await serving; checks++;
        }
    }
    private static async Task ValidationAsync()
    {
        foreach (var id in new[] { "", "..", "a/b", "%2F", "11111111111141118111111111111111", A + "\n" })
        {
            await Invalid((o, _) => o.Project(id).Campaigns.GetReplyFlowAsync(A));
            await Invalid((o, _) => o.Campaigns.GetReplyFlowAsync(id, new(A)));
        }
        foreach (var phone in new[] { "15551234567", "+01234567", "+123", "+15551234567\n", "+١٥٥٥١٢٣٤٥٦٧" }) await Invalid((o, _) => o.AudienceProfiles.RetrieveAsync(phone));
        foreach (var limit in new[] { 0, 101 }) await Invalid((o, _) => o.AudienceProfiles.ListAsync(new(Limit: limit)));
        await Invalid((o, _) => o.AudienceProfiles.ListAsync(new("not-uuid")));
        await Invalid((o, _) => o.AudienceProfiles.PutAsync(Phone, null!));
        await Invalid((o, _) => o.AudienceProfiles.PutAsync(Phone, new(["same", "same"], new Dictionary<string, AudienceProfileAttributeValue>())));
        await Invalid((o, _) => o.AudienceProfiles.PutAsync(Phone, new([new string('é', 25)], new Dictionary<string, AudienceProfileAttributeValue>())));
        await Invalid((o, _) => o.AudienceProfiles.PutAsync(Phone, new(["control\u007f"], new Dictionary<string, AudienceProfileAttributeValue>())));
        await Invalid((o, _) => o.AudienceProfiles.PutAsync(Phone, new([], new Dictionary<string, AudienceProfileAttributeValue> { ["x"] = "\0" })));
        await Invalid((o, _) => o.AudienceProfiles.PutAsync(Phone, new([], new Dictionary<string, AudienceProfileAttributeValue> { ["x"] = default })));
        await Invalid((o, _) => o.AudienceProfiles.PutAsync(Phone, new([], new Dictionary<string, AudienceProfileAttributeValue>(), ExpectedRevision: 0)));
        await Invalid((o, _) => o.AudienceProfiles.DeleteAsync(Phone, 0));
        foreach (var csv in new[] { "", "YQ", "YR==", "YQ==\n", "_w==", "/w==", "AA==", "YQ===" }) await Invalid((o, _) => o.AudienceProfiles.Imports.CreateAsync(new("valid", csv)));
        await Invalid((o, _) => o.AudienceProfiles.Imports.CreateAsync(new("bad space", "YQ==")));
        foreach (var name in new[] { "phone ", "\ufeffphone", "\u001cphone", "\u0085phone", "phone" }) await Invalid((o, _) => o.AudienceProfiles.Imports.CreateAsync(new("valid", "YQ==", new(name, "phone", "attrs"))));
        await Invalid((o, _) => o.Projects.UpdateSignalCustodyAsync(A, null!));
        await Invalid((o, _) => o.Customers.UpdateSignalCustodyAsync(A, B, null!));
        await Invalid((o, _) => o.Customers.GetSignalCustodyAsync(null!, B));
        await Invalid((o, _) => o.Project(A).SignalCustody.RetrieveCustomerAsync(null!));
        await Invalid((o, _) => o.Project(A).SignalCustody.UpdateCustomerAsync(null!, new(0, null)));
        await Invalid((o, _) => o.Projects.UpdateSignalCustodyAsync(A, new(0, (SignalCustodyMode)900)));
        await Invalid((o, _) => o.Customers.UpdateSignalCustodyAsync(A, B, new(-1, null)));
        await Invalid((o, _) => o.OptOuts.UpdateConfirmationSettingsAsync(new(A, 0, true, null)));
        await Invalid((o, _) => o.OptOuts.UpdateConfirmationSettingsAsync(new(A, 2147483647, false, null)));
        await Invalid((o, _) => o.OptOuts.UpdateConfirmationSettingsAsync(new(A, 0, false, (StopConfirmationLocale)900)));
        await Invalid((o, _) => o.Campaigns.SetReplyFlowAsync(C, new(A, "bad")));
        await Invalid((o, _) => o.Campaigns.SetReplyFlowAsync(C, null!));
        await Invalid((o, _) => o.Campaigns.GetReplyFlowAsync(A, null!));
        await Invalid((o, _) => o.Campaigns.ExportRecipientsAsync(C, new(A, Cursor: "page", Status: CampaignExportStatus.Read)));
        await Invalid((o, _) => o.Campaigns.ExportRecipientsAsync(C, new(A, Status: CampaignExportStatus.Read, Limit: 1)));
        await Invalid((o, _) => o.Campaigns.ExportRecipientsAsync(C, new(A, Limit: 0)));
        await Invalid((o, _) => o.Campaigns.ExportRecipientsAsync(C, new(A, Status: (CampaignExportStatus)900)));
        foreach (var value in new[] { new string('a', 33), string.Concat(Enumerable.Repeat("😀", 17)) }) await Invalid((o, _) => o.Campaigns.TestSendAsync(C, new(A, B, value)));
        await Invalid((o, _) => o.Campaigns.TestSendAsync(C, new(A, B, Phone, Variables: new Dictionary<string, CampaignVariableValue> { ["x"] = default })));
        await Invalid((o, _) => o.Campaigns.TestSendAsync(C, new(A, B, Phone, Variables: new Dictionary<string, CampaignVariableValue> { ["x"] = new string('x', 1025) })));
        await Invalid((o, _) => o.Campaigns.CreateReplyFlowAsync(new(A, new string('é', 65), Graph())));
        foreach (var keyword in new[] { new string('é', 33), "bad\u0085", "bad\n" }) await Invalid((o, _) => o.Campaigns.CreateReplyFlowAsync(new(A, "name", Graph(keyword: keyword))));
        foreach (var text in new[] { "\ufeff", "\t\r\n", "bad\u0085", new string('x', 4097) }) await Invalid((o, _) => o.Campaigns.CreateReplyFlowAsync(new(A, "name", Graph(text))));
        await Invalid((o, _) => o.Campaigns.CreateReplyFlowAsync(new(A, "name", new("entry", [new("entry", []), new("entry", [])]))));
        await Invalid((o, _) => o.Campaigns.CreateReplyFlowAsync(new(A, "name", new("entry", [new("entry", [], new CampaignReplyButtons("body", [new("x", "one"), new("x", "two")])), new("done", [])]))));
        await Invalid((o, _) => o.Campaigns.TestSendAsync(C, new(A, B, Phone), new() { IdempotencyKey = new string('é', 128) }));
        await Invalid((o, _) => o.Audiences.CreateFromCampaignAsync(new("\ufeff", C, CampaignRetargetOutcome.Replied)));
        await Invalid((o, _) => o.Audiences.CreateFromCampaignAsync(new("name", C, (CampaignRetargetOutcome)900)));
        // All six new Messaging methods refuse Client principals before HTTP.
        await Invalid((_, m) => m.Campaigns.GetReplyFlowAsync("launch", A));
        await Invalid((_, m) => m.Campaigns.CreateReplyFlowAsync("launch", new("name", Graph())));
        await Invalid((_, m) => m.Campaigns.SetReplyFlowAsync("launch", C, new(null)));
        await Invalid((_, m) => m.Campaigns.TestSendAsync("launch", C, new(A, Phone)));
        await Invalid((_, m) => m.Campaigns.LinksAsync("launch", C));
        await Invalid((_, m) => m.Campaigns.ExportRecipientsAsync("launch", C));
        foreach (var value in new[] { "\ud800", "\udfff", "x\ud800y" })
        {
            await Invalid((o, _) => o.Campaigns.CreateReplyFlowAsync(new(A, value, Graph())));
            await Invalid((o, _) => o.Campaigns.CreateReplyFlowAsync(new(A, "name", Graph(value))));
            await Invalid((o, _) => o.Campaigns.TestSendAsync(C, new(A, B, value)));
            await Invalid((o, _) => o.AudienceProfiles.PutAsync(Phone, new([value], new Dictionary<string, AudienceProfileAttributeValue>())));
            await Invalid((o, _) => o.Campaigns.TestSendAsync(C, new(A, B, Phone, Variables: new Dictionary<string, CampaignVariableValue> { ["x"] = value })));
            await Invalid((o, _) => o.AudienceProfiles.PutAsync(Phone, new([], new Dictionary<string, AudienceProfileAttributeValue> { ["x"] = value })));
        }
        await Invalid((o, _) => o.AudienceProfiles.PutAsync(Phone, new([], new Dictionary<string, AudienceProfileAttributeValue> { ["\ud800"] = "value" })));
        var once = new OnePassList<string>(["lead"]);
        await Wire("PUT", "/platform/audience-profiles/%2B15551234567", "{\"tags\":[\"lead\"],\"attributes\":{}}", Envelope(Profile), (o, _) => o.AudienceProfiles.PutAsync(Phone, new(once, new Dictionary<string, AudienceProfileAttributeValue>())), r => Check(r.Data.Revision == 1, "Single capture failed."));
        var oneGraph = new CampaignReplyFlowDefinition("entry", new OnePassList<CampaignReplyFlowNode>(Graph().Nodes));
        await Wire("POST", "/platform/campaign-reply-flows", "{\"projectId\":\"" + A + "\",\"name\":\"Welcome\",\"definition\":" + Definition + "}", Envelope(Flow), (o, _) => o.Campaigns.CreateReplyFlowAsync(new(A, "Welcome", oneGraph)), r => VerifyFlow(r.Data));
        await UnionAndQuotaAsync();
    }
    private sealed class OnePassList<T>(IReadOnlyList<T> values) : IReadOnlyList<T>
    {
        private bool enumerated;
        public int Count => values.Count;
        public T this[int index] => values[index];
        public IEnumerator<T> GetEnumerator() { if (enumerated) throw new Exception("Caller list enumerated twice."); enumerated = true; return values.GetEnumerator(); }
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    }
    private static async Task UnionAndQuotaAsync()
    {
        CampaignReplyFlowSend[] sends = [new CampaignReplyText(" \r\n\ttext"), new CampaignReplyButtons("body", [new("one", " ")], "footer"), new CampaignReplyList("body", " ", [new("one", "title", "description")], "footer"), new CampaignReplyForm(A, "body", "go", "SCREEN_1", "footer")];
        CampaignReplyFlowMatch[] matches = [new CampaignReplyKeyword("İ"), new CampaignReplyChoice(CampaignReplyChoiceKind.Button, "one"), new CampaignReplyChoice(CampaignReplyChoiceKind.List, "one"), new CampaignReplySubmission()];
        var wireSends = new[] { "{\"kind\":\"text\",\"text\":\" \\r\\n\\ttext\"}", "{\"kind\":\"buttons\",\"body\":\"body\",\"buttons\":[{\"id\":\"one\",\"text\":\" \"}],\"footer\":\"footer\"}", "{\"kind\":\"list\",\"body\":\"body\",\"buttonText\":\" \",\"rows\":[{\"id\":\"one\",\"title\":\"title\",\"description\":\"description\"}],\"footer\":\"footer\"}", "{\"kind\":\"flow_form\",\"flowId\":\"" + A + "\",\"body\":\"body\",\"buttonText\":\"go\",\"screen\":\"SCREEN_1\",\"footer\":\"footer\"}" };
        var wireMatches = new[] { "{\"kind\":\"keyword\",\"value\":\"İ\"}", "{\"kind\":\"choice\",\"replyKind\":\"button\",\"id\":\"one\"}", "{\"kind\":\"choice\",\"replyKind\":\"list\",\"id\":\"one\"}", "{\"kind\":\"flow_submission\"}" };
        for (var i = 0; i < sends.Length; i++)
        {
            var definition = "{\"entryNodeId\":\"entry\",\"nodes\":[{\"id\":\"entry\",\"send\":" + wireSends[i] + ",\"edges\":[{\"match\":" + wireMatches[i] + ",\"to\":\"done\"}]},{\"id\":\"done\",\"edges\":[]}]}";
            var index = i;
            await Wire("POST", "/platform/campaign-reply-flows", "{\"projectId\":\"" + A + "\",\"name\":\"union\",\"definition\":" + definition + "}", Envelope(Flow.Replace(Definition, definition)), (o, _) => o.Campaigns.CreateReplyFlowAsync(new(A, "union", new("entry", [new("entry", [new(matches[index], "done")], sends[index]), new("done", [])]))), r => Check(r.Data.Definition.Nodes[0].Send!.GetType() == sends[index].GetType() && r.Data.Definition.Nodes[0].Edges[0].Match.GetType() == matches[index].GetType(), "Union variant lost."));
        }
        // Attribute quota uses semantic JSON: control escapes and JS number spelling.
        var attrs = new Dictionary<string, AudienceProfileAttributeValue>();
        for (var i = 0; i < 5; i++) attrs["c" + i] = new string('\u0001', 256);
        attrs["one"] = 1d; attrs["large"] = 1e20; attrs["zero"] = -0d;
        // Independent compact representation, including JSON.stringify(1e20).
        var prefix = "{" + string.Join(',', Enumerable.Range(0, 5).Select(i => "\"c" + i + "\":\"" + string.Concat(Enumerable.Repeat("\\u0001", 256)) + "\"")) + ",\"one\":1,\"large\":100000000000000000000,\"zero\":0,\"tail\":\"";
        var tail = new string('x', 8192 - Encoding.UTF8.GetByteCount(prefix + "\"}")); attrs["tail"] = tail;
        // Each string is <=256 bytes, so construct remaining bytes with escaped controls.
        var target = tail.Length; var controlTail = new string('\u0001', target / 6) + new string('x', target % 6); attrs["tail"] = controlTail;
        var expectedAttrs = prefix + string.Concat(Enumerable.Repeat("\\u0001", target / 6)) + new string('x', target % 6) + "\"}";
        var expectedWire = expectedAttrs.Replace("100000000000000000000", "1E+20").Replace("\"zero\":0", "\"zero\":-0");
        await Wire("PUT", "/platform/audience-profiles/%2B15551234567", "{\"tags\":[],\"attributes\":" + expectedWire + "}", Envelope(Profile), (o, _) => o.AudienceProfiles.PutAsync(Phone, new([], attrs)), r => Check(r.Data.Revision == 1, "Semantic attribute bound rejected."));
        attrs["tail"] = controlTail + "x";
        await Invalid((o, _) => o.AudienceProfiles.PutAsync(Phone, new([], attrs)));
        // Graph normalized-node JSON reaches exactly24KiB, then rejects one more byte.
        var nodes = Enumerable.Range(0, 6).Select(i => new CampaignReplyFlowNode("n" + i, [], new CampaignReplyText("<é😀"))).ToArray();
        var compactNodes = "[" + string.Join(',', Enumerable.Range(0, 6).Select(i => "{\"id\":\"n" + i + "\",\"edges\":[],\"send\":{\"text\":\"<é😀\",\"kind\":\"text\"}}")) + "]";
        var remaining = 24576 - Encoding.UTF8.GetByteCount(compactNodes);
        for (var i = 0; i < nodes.Length; i++) { var add = Math.Min(4089, remaining); nodes[i] = nodes[i] with { Send = new CampaignReplyText("<é😀" + new string('x', add)) }; remaining -= add; }
        Check(remaining == 0, "Independent graph boundary fixture invalid.");
        // Expected bytes are built independently from public inputs, not from SDK serialization.
        var rawNodes = "[" + string.Join(',', nodes.Select(n => "{\"id\":\"" + n.Id + "\",\"edges\":[],\"send\":{\"kind\":\"text\",\"text\":\"" + ((CampaignReplyText)n.Send!).Text + "\"}}")) + "]";
        await Wire("POST", "/platform/campaign-reply-flows", "{\"projectId\":\"" + A + "\",\"name\":\"quota\",\"definition\":{\"entryNodeId\":\"n0\",\"nodes\":" + rawNodes + "}}", Envelope(Flow), (o, _) => o.Campaigns.CreateReplyFlowAsync(new(A, "quota", new("n0", nodes))), r => VerifyFlow(r.Data));
        nodes[^1] = nodes[^1] with { Send = new CampaignReplyText(((CampaignReplyText)nodes[^1].Send!).Text + "x") };
        await Invalid((o, _) => o.Campaigns.CreateReplyFlowAsync(new(A, "quota", new("n0", nodes))));
    }
    private static async Task ResponsesAsync()
    {
        async Task Malformed(string path, string response, Func<OrganizationClient, MessagingClient, Task> call, int status = 200, string mime = "application/json")
        {
            using var fixture = new WireFixture();
            var serving = fixture.ServeAsync("GET", path, null, response, status, new Dictionary<string, string> { ["content-type"] = mime });
            using var org = new OrganizationClient(OrganizationKey(), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0 });
            using var msg = new MessagingClient(OrganizationKey(), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0 });
            try { await call(org, msg); throw new Exception("Malformed success accepted: " + path); }
            catch (PolymorfaServerException error) { Check(error.Code == "invalid_response" && error.Status == status && error.RequestId == "req_native", "Malformed response classification differs."); checks++; }
            await serving;
        }
        // Remove every required top-level property independently. Required null remains required.
        var models = new (string Path, string Fixture, Func<OrganizationClient, MessagingClient, Task> Call)[]
        {
            ("/platform/audience-profiles/%2B15551234567", Profile, (o, _) => o.AudienceProfiles.RetrieveAsync(Phone)),
            ("/platform/audience-profile-imports/" + A, Job, (o, _) => o.AudienceProfiles.Imports.RetrieveAsync(A)),
            ("/platform/campaign-reply-flows/" + A + "?projectId=" + B, Flow, (o, _) => o.Campaigns.GetReplyFlowAsync(A, new(B))),
            ("/platform/optouts/confirmation-settings", Stop, (o, _) => o.OptOuts.GetConfirmationSettingsAsync()),
            ("/platform/projects/" + B + "/signal-custody", Custody, (o, _) => o.Projects.GetSignalCustodyAsync(B))
        };
        foreach (var model in models)
        {
            var data = JsonNode.Parse(model.Fixture)!.AsObject();
            foreach (var key in data.Select(p => p.Key).ToArray())
            {
                var changed = data.DeepClone().AsObject(); changed.Remove(key);
                await Malformed(model.Path, Envelope(changed.ToJsonString()), model.Call);
                if (data[key] is not null) { changed = data.DeepClone().AsObject(); changed[key] = null; await Malformed(model.Path, Envelope(changed.ToJsonString()), model.Call); }
            }
            await Malformed(model.Path, "{\"data\":null}", model.Call);
            await Malformed(model.Path, "{}", model.Call);
        }
        Func<OrganizationClient, MessagingClient, Task> list = (o, _) => o.AudienceProfiles.ListAsync();
        foreach (var bad in new[] { "null", "{}", "{\"data\":[],\"page\":null}", "{\"data\":null,\"page\":{\"nextCursor\":null,\"hasMore\":false}}", "{\"data\":[],\"page\":{\"hasMore\":false}}", "{\"data\":[],\"page\":{\"nextCursor\":null,\"hasMore\":0}}" }) await Malformed("/platform/audience-profiles", bad, list);
        foreach (var bad in new[] { "{\"success\":false,\"data\":" + Flow + "}", "{\"data\":" + Flow + "}", "{\"success\":true,\"data\":null}" }) await Malformed("/messaging/projects/launch/campaign-reply-flows/" + A, bad, (_, m) => m.Campaigns.GetReplyFlowAsync("launch", A));
        await Malformed("/platform/campaign-reply-flows/" + A + "?projectId=" + B, Envelope(Flow.Replace("\"kind\":\"text\"", "\"kind\":\"unknown\"")), (o, _) => o.Campaigns.GetReplyFlowAsync(A, new(B)));
        await Malformed("/platform/campaign-reply-flows/" + A + "?projectId=" + B, Envelope(Flow.Replace("\"kind\":\"text\",\"text\":\"Hello\"", "\"kind\":\"buttons\",\"body\":\"hello\",\"buttons\":[],\"footer\":null")), (o, _) => o.Campaigns.GetReplyFlowAsync(A, new(B)));
        await Malformed("/platform/projects/" + B + "/signal-custody", Envelope(Custody.Replace("zero_knowledge", "unknown_mode")), (o, _) => o.Projects.GetSignalCustodyAsync(B));
        // A normalized keyword may expand beyond outbound64 UTF8 bytes. Response contract is64 UTF16 units.
        var normalized = string.Concat(Enumerable.Repeat("i\u0307", 32));
        await Wire("GET", "/platform/campaign-reply-flows/" + A + "?projectId=" + B, null, Envelope(Flow.Replace("yes", normalized)), (o, _) => o.Campaigns.GetReplyFlowAsync(A, new(B)), r => Check(((CampaignReplyKeyword)r.Data.Definition.Nodes[0].Edges[0].Match).Value == normalized, "Normalized keyword changed."));
        await Malformed("/platform/campaign-reply-flows/" + A + "?projectId=" + B, Envelope(Flow.Replace("yes", normalized + "x")), (o, _) => o.Campaigns.GetReplyFlowAsync(A, new(B)));
        await Malformed("/platform/audience-profiles/%2B15551234567", Envelope(Profile.Replace("+15551234567", "\\ud800")), (o, _) => o.AudienceProfiles.RetrieveAsync(Phone));
        foreach (var replacement in new[] { ("yes", "\\ud800"), ("keyword", "\\ud800") }) await Malformed("/platform/campaign-reply-flows/" + A + "?projectId=" + B, Envelope(Flow.Replace(replacement.Item1, replacement.Item2)), (o, _) => o.Campaigns.GetReplyFlowAsync(A, new(B)));
        await Malformed("/platform/audience-profiles/%2B15551234567", Envelope(Profile.Replace("1.5", "\"\\ud800\"")), (o, _) => o.AudienceProfiles.RetrieveAsync(Phone));
        await Malformed("/platform/audience-profiles/%2B15551234567", Envelope(Profile.Replace("\"revision\":1", "\"revision\":999999999999999999999999999999999999")), (o, _) => o.AudienceProfiles.RetrieveAsync(Phone));
        var oversizedNodes = "[" + string.Join(',', Enumerable.Range(0, 6).Select(i => "{\"id\":\"n" + i + "\",\"edges\":[],\"send\":{\"kind\":\"text\",\"text\":\"" + new string('x', 4096) + "\"}}")) + "]";
        await Malformed("/platform/campaign-reply-flows/" + A + "?projectId=" + B, Envelope(Flow.Replace(Definition, "{\"entryNodeId\":\"n0\",\"nodes\":" + oversizedNodes + "}")), (o, _) => o.Campaigns.GetReplyFlowAsync(A, new(B)));

        foreach (var (status, mime, body) in new[] { (200, "text/html", "<html>private</html>"), (200, "application/problem+json", "{\"data\":[]}"), (201, "application/json", "{\"data\":[],\"page\":{\"nextCursor\":null,\"hasMore\":false}}"), (204, "application/json", "") }) await Malformed("/platform/audience-profiles", body, list, status, mime);
        foreach (var (status, mime, body) in new[] { (200, "application/json", "{}"), (200, "text/html", "<html>private</html>"), (204, "text/csv", ""), (302, "text/csv", "") })
        {
            // Redirect responses are rejected by the shared transport as HTTP302, never followed.
            using var fixture = new WireFixture();
            using var sink = new WireFixture();
            var serving = fixture.ServeAsync("GET", "/platform/campaigns/" + C + "/recipients/export?projectId=" + B, null, body, status, new Dictionary<string, string> { ["content-type"] = mime, ["location"] = sink.Url.ToString() });
            using var org = new OrganizationClient(OrganizationKey(), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 0 });
            try { await org.Campaigns.ExportRecipientsAsync(C, new(B)); throw new Exception("Invalid CSV success accepted."); }
            catch (PolymorfaException error)
            {
                Check(error.Status == status && error.RequestId == "req_native" && (status == 302 ? error.GetType() == typeof(PolymorfaException) && error.Code is null : error is PolymorfaServerException && error.Code == "invalid_response"), "CSV failure classification differs.");
                Check(!sink.Pending, "CSV redirect forwarded credentials."); checks++;
            }
            await serving;
        }
        foreach (var (status, code) in new[] { (402, "campaign_approval_required"), (409, "campaign_approval_stale"), (422, "campaign_variables_missing"), (429, "zero_knowledge_session"), (503, "future_remote_code"), (504, "unknown_outcome") })
        {
            using var fixture = new WireFixture();
            var serving = fixture.ServeAsync("GET", "/platform/campaign-settings", null, "{\"error\":{\"code\":\"" + code + "\",\"message\":\"declined\",\"param\":\"variables.name\",\"details\":{\"count\":1}}}", status, new Dictionary<string, string> { ["x-trace-id"] = "trace", ["idempotent-replayed"] = "true", ["content-disposition"] = "attachment; filename=report.csv", ["set-cookie"] = "private", ["x-private"] = "private", ["x-polymorfa-operation-id"] = "op_capture" });
            using var org = new OrganizationClient(OrganizationKey(), new() { BaseUrl = fixture.Url });
            try { await org.Campaigns.GetSettingsAsync(); throw new Exception("Remote error accepted."); }
            catch (PolymorfaException error) { Check(error.Status == status && error.Code == code && error.Param == "variables.name" && error.Metadata is { Attempts: 1 } && error.Metadata.Headers["x-trace-id"] == "trace" && error.Metadata.Headers["idempotent-replayed"] == "true" && error.Metadata.Headers.ContainsKey("content-disposition") && !error.Metadata.Headers.ContainsKey("set-cookie") && !error.Metadata.Headers.ContainsKey("x-private") && error.Details?.GetProperty("count").GetInt32() == 1, "Error fields/metadata lost."); checks++; }
            await serving;
        }
    }
    private static async Task RetryAsync()
    {
        foreach (var messaging in new[] { false, true }) foreach (var caller in new[] { false, true })
            {
                var variables = new Dictionary<string, CampaignVariableValue> { ["name"] = "original" };
                var headers = new Dictionary<string, string> { ["x-fixture"] = "original" };
                string? savedKey = null; byte[]? savedBody = null; var replies = 0;
                WireFixture? fixture = null;
                using (fixture = new WireFixture
                {
                    BeforeResponse = () =>
                {
                    var key = fixture!.CapturedHeaders["idempotency-key"];
                    if (caller) Check(key == "caller-fixed", "Caller key changed."); else Check(Guid.TryParse(key, out _), "Generated key missing.");
                    if (replies++ == 0) { savedKey = key; savedBody = fixture.CapturedBody.ToArray(); variables["name"] = "mutated"; headers["x-fixture"] = "mutated"; }
                    else Check(key == savedKey && fixture.CapturedBody.SequenceEqual(savedBody!) && fixture.CapturedHeaders["x-fixture"] == "original", "Retry snapshot changed.");
                    return Task.CompletedTask;
                }
                })
                {
                    var path = messaging ? "/messaging/projects/launch/campaigns/" + C + "/test-send" : "/platform/campaigns/" + C + "/test-send";
                    var body = "{" + (messaging ? "" : "\"projectId\":\"" + A + "\",") + "\"sessionId\":\"" + B + "\",\"to\":\"+15551234567\",\"variables\":{\"name\":\"original\"}}";
                    var serving = Task.Run(async () => { await fixture.ServeAsync("POST", path, body, "{\"error\":{\"code\":\"service_unavailable\",\"message\":\"retry\"}}", 503, new Dictionary<string, string> { ["retry-after"] = "0" }); await fixture.ServeAsync("POST", path, body, Envelope(Test, messaging)); });
                    using var org = new OrganizationClient(OrganizationKey(), new() { BaseUrl = fixture.Url });
                    using var msg = new MessagingClient(OrganizationKey(), new() { BaseUrl = fixture.Url });
                    var options = new RequestOptions { MaxNetworkRetries = 1, Headers = headers, IdempotencyKey = caller ? "caller-fixed" : null };
                    var metadata = messaging ? (await msg.Campaigns.TestSendAsync("launch", C, new(B, Phone, Variables: variables), options)).Metadata : (await org.Project(A).Campaigns.TestSendAsync(C, new(B, Phone, Variables: variables), options)).Metadata;
                    await serving; Check(metadata.Attempts == 2 && replies == 2, "Test-send retry count differs."); checks++;
                }
            }
        foreach (var retryExplicit in new[] { false, true })
        {
            using var fixture = new WireFixture { ExpectedHeaders = new Dictionary<string, string> { ["idempotency-key"] = "caller-fixed" } };
            var body = "{\"replayKey\":\"import\",\"csvBase64\":\"YQ==\"}";
            var serving = Task.Run(async () => { await fixture.ServeAsync("POST", "/platform/audience-profile-imports", body, "{\"error\":{\"code\":\"service_unavailable\",\"message\":\"retry\"}}", 503, new Dictionary<string, string> { ["retry-after"] = "0" }); if (retryExplicit) await fixture.ServeAsync("POST", "/platform/audience-profile-imports", body, Envelope(Job)); });
            using var org = new OrganizationClient(OrganizationKey(), new() { BaseUrl = fixture.Url, MaxNetworkRetries = 2 });
            try { var result = await org.AudienceProfiles.Imports.CreateAsync(new("import", "YQ=="), new() { IdempotencyKey = "caller-fixed", MaxNetworkRetries = retryExplicit ? 1 : null }); Check(retryExplicit && result.Metadata.Attempts == 2, "Explicit unsafe retry differs."); }
            catch (PolymorfaServerException e) { Check(!retryExplicit && e.Status == 503 && e.Metadata!.Attempts == 1, "Unsafe request replayed by default."); }
            await serving; Check(!fixture.Pending, "Unexpected unsafe replay."); checks++;
        }
        // Cancellation before HTTP and while buffering a finite CSV body.
        using (var fixture = new WireFixture()) using (var cancelled = new CancellationTokenSource())
        using (var org = new OrganizationClient(OrganizationKey(), new() { BaseUrl = fixture.Url }))
        {
            cancelled.Cancel();
            try { await org.Campaigns.ExportRecipientsAsync(C, new(A), new() { CancellationToken = cancelled.Token }); throw new Exception("Pre-cancelled export completed."); }
            catch (PolymorfaCancelledException) { Check(!fixture.Pending, "Pre-cancellation reached HTTP."); checks++; }
        }
        using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        using var cancelBody = new CancellationTokenSource();
        var headersSent = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var server = Task.Run(async () =>
        {
            using var connection = await listener.AcceptTcpClientAsync(timeout.Token);
            await using var stream = connection.GetStream();
            var head = new List<byte>(); var one = new byte[1];
            while (head.Count < 65536) { Check(await stream.ReadAsync(one, timeout.Token) == 1, "Incomplete CSV request."); head.Add(one[0]); if (head.Count >= 4 && head[^4] == 13 && head[^3] == 10 && head[^2] == 13 && head[^1] == 10) break; }
            await stream.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\ncontent-type: text/csv\r\ncontent-length: 1000000\r\nconnection: close\r\nx-request-id: csv_cancel\r\n\r\nphone\r\n"), timeout.Token);
            headersSent.SetResult();
            try { Check(await stream.ReadAsync(one, timeout.Token) == 0, "Cancelled CSV connection stayed open."); } catch (IOException) { }
        });
        using var client = new OrganizationClient(OrganizationKey(), new() { BaseUrl = new Uri("http://127.0.0.1:" + ((IPEndPoint)listener.LocalEndpoint).Port), MaxNetworkRetries = 0 });
        var pending = client.Campaigns.ExportRecipientsAsync(C, new(A), new() { CancellationToken = cancelBody.Token });
        await headersSent.Task.WaitAsync(timeout.Token); cancelBody.Cancel();
        try { await pending; throw new Exception("Body-cancelled CSV completed."); } catch (PolymorfaCancelledException) { checks++; }
        await server;
    }
}
