using Polymorfa.Sdk;

internal static class ProjectSettingsTests
{
    private const string Safe = """{"projectId":"p1","ceiling":{"presence":"dark","typing":"off","reads":"off","pacing":"off","onlineStart":0,"onlineEnd":24},"entitled":false,"entitlementReason":"unavailable"}""";
    private const string Warmup = """{"projectId":"p1","plan":{"enabled":false,"warmupDays":7,"dailyStart":10},"ceiling":500,"curve":[{"day":1,"allowance":10}],"entitled":false,"entitlementReason":null}""";
    private const string Insurance = """{"projectId":"p1","enabled":false,"banInsuranceIncluded":true}""";
    private const string Health = """{"projectId":"p1","version":3,"enabled":false,"threshold":41.5,"sessionAction":"none","slowDownMps":null,"emailNotification":false,"webhookNotification":true,"integrations":{"emailConfigured":false,"webhookConfigured":true}}""";
    private const string HealthInput = """{"version":3,"enabled":false,"threshold":41.5,"sessionAction":"none","slowDownMps":null,"emailNotification":false,"webhookNotification":true}""";
    private static UpdateProjectHealthPolicyRequest HealthRequest => new(3, false, 41.5, "none", null, false, true);
    private const string SessionSafe = """{"session":"s","projectId":"p1","project":{"presence":"dark","typing":"off","reads":"off","pacing":"off","onlineStart":0,"onlineEnd":24},"override":{"presence":"inherit","typing":"inherit","reads":"inherit","pacing":"inherit"},"effective":{"presence":"dark","typing":"off","reads":"off","pacing":"off","onlineStart":0,"onlineEnd":24},"applied":null,"mismatch":false,"entitled":false,"entitlementReason":null}""";
    public static async Task RunAsync()
    {
        await Organization("GET", "/platform/projects/p1/safe-mode", null, Platform(Safe), async c => ResourceTests.True(!(await c.Projects.GetSafeModeAsync("p1")).Data.Data.Entitled));
        await Organization("PUT", "/platform/projects/p1/safe-mode", """{"presence":"dark","onlineStart":0}""", Platform(Safe), async c => ResourceTests.Equal((await c.Projects.UpdateSafeModeAsync("p1", new(Presence: "dark", OnlineStart: 0))).Data.Data.Ceiling.Presence, "dark"));
        await Organization("GET", "/platform/projects/p1/warmup-plan", null, Platform(Warmup), async c => ResourceTests.Equal((await c.Projects.GetWarmupPlanAsync("p1")).Data.Data.Curve[0].Allowance, 10));
        await Organization("PUT", "/platform/projects/p1/warmup-plan", """{"enabled":false,"dailyStart":10}""", Platform(Warmup), async c => ResourceTests.True(!(await c.Projects.UpdateWarmupPlanAsync("p1", new(false, DailyStart: 10))).Data.Data.Plan.Enabled));
        await Organization("GET", "/platform/projects/p1/insurance-evidence", null, Platform(Insurance), async c => ResourceTests.True((await c.Projects.GetInsuranceEvidenceAsync("p1")).Data.Data.BanInsuranceIncluded));
        await Organization("PUT", "/platform/projects/p1/insurance-evidence", """{"enabled":false}""", Platform(Insurance), async c => ResourceTests.True(!(await c.Projects.UpdateInsuranceEvidenceAsync("p1", new(false))).Data.Data.Enabled));
        await Organization("GET", "/platform/projects/p1/health-policy", null, Platform(Health), async c => ResourceTests.Equal((await c.Projects.GetHealthPolicyAsync("p1")).Data.Data.Threshold, 41.5));
        await Organization("PUT", "/platform/projects/p1/health-policy", HealthInput, Platform(Health), async c => ResourceTests.Equal((await c.Projects.UpdateHealthPolicyAsync("p1", HealthRequest)).Data.Data.Version, 3L));
        await Organization("GET", "/platform/projects/p1/hybrid-merge-candidates", null, """{"data":[{"numbers":[{"id":"n1","name":"First","transport":"linked_devices","status":"connected","canBeAbsorbed":true},{"id":"n2","name":"Second","transport":"official_api","status":"connected","canBeAbsorbed":false}],"eligible":false,"ineligibleReason":"hms_enabled"}]}""", async c => ResourceTests.Equal((await c.Projects.ListHybridMergeCandidatesAsync("p1")).Data.Data[0].IneligibleReason, "hms_enabled"));
        await Organization("GET", "/platform/projects/p1/safe-mode", null, Platform(Safe), async c => ResourceTests.Equal((await c.Project("p1").Settings.GetSafeModeAsync()).Data.Data.ProjectId, "p1"));
        await Organization("PUT", "/platform/projects/p1/safe-mode", """{"pacing":"conversation"}""", Platform(Safe), async c => ResourceTests.Equal((await c.Project("p1").Settings.UpdateSafeModeAsync(new(Pacing: "conversation"))).Data.Data.ProjectId, "p1"));
        await Organization("GET", "/platform/projects/p1/warmup-plan", null, Platform(Warmup), async c => ResourceTests.Equal((await c.Project("p1").Settings.GetWarmupPlanAsync()).Data.Data.ProjectId, "p1"));
        await Organization("PUT", "/platform/projects/p1/warmup-plan", "{}", Platform(Warmup), async c => ResourceTests.Equal((await c.Project("p1").Settings.UpdateWarmupPlanAsync(new())).Data.Data.ProjectId, "p1"));
        await Organization("GET", "/platform/projects/p1/insurance-evidence", null, Platform(Insurance), async c => ResourceTests.Equal((await c.Project("p1").Settings.GetInsuranceEvidenceAsync()).Data.Data.ProjectId, "p1"));
        await Organization("PUT", "/platform/projects/p1/insurance-evidence", """{"enabled":true}""", Platform(Insurance), async c => ResourceTests.Equal((await c.Project("p1").Settings.UpdateInsuranceEvidenceAsync(new(true))).Data.Data.ProjectId, "p1"));
        await Organization("GET", "/platform/projects/p1/health-policy", null, Platform(Health), async c => ResourceTests.Equal((await c.Project("p1").Settings.GetHealthPolicyAsync()).Data.Data.ProjectId, "p1"));
        await Organization("PUT", "/platform/projects/p1/health-policy", HealthInput, Platform(Health), async c => ResourceTests.True((await c.Project("p1").Settings.UpdateHealthPolicyAsync(HealthRequest)).Data.Data.SlowDownMps is null));
        await Messaging("GET", "/messaging/projects/p1/safe-mode", null, MessagingEnvelope(Safe), async c => ResourceTests.True(!(await c.BanSafe.GetProjectSafeModeAsync("p1")).Data.Data.Entitled));
        await Messaging("PUT", "/messaging/projects/p1/safe-mode", """{"typing":"off"}""", MessagingEnvelope(Safe), async c => ResourceTests.Equal((await c.BanSafe.UpdateProjectSafeModeAsync("p1", new(Typing: "off"))).Data.Data.ProjectId, "p1"));
        await Messaging("GET", "/messaging/projects/p1/warmup-plan", null, MessagingEnvelope(Warmup), async c => ResourceTests.Equal((await c.BanSafe.GetProjectWarmupPlanAsync("p1")).Data.Data.Ceiling, 500));
        await Messaging("PUT", "/messaging/projects/p1/warmup-plan", """{"enabled":false}""", MessagingEnvelope(Warmup), async c => ResourceTests.Equal((await c.BanSafe.UpdateProjectWarmupPlanAsync("p1", new(false))).Data.Data.ProjectId, "p1"));
        await Messaging("GET", "/messaging/projects/p1/insurance-evidence", null, MessagingEnvelope(Insurance), async c => ResourceTests.True(!(await c.BanSafe.GetProjectInsuranceEvidenceAsync("p1")).Data.Data.Enabled));
        await Messaging("PUT", "/messaging/projects/p1/insurance-evidence", """{"enabled":false}""", MessagingEnvelope(Insurance), async c => ResourceTests.Equal((await c.BanSafe.UpdateProjectInsuranceEvidenceAsync("p1", new(false))).Data.Data.ProjectId, "p1"));
        await Messaging("GET", "/messaging/projects/p1/health-policy", null, MessagingEnvelope(Health), async c => ResourceTests.True((await c.BanSafe.GetProjectHealthPolicyAsync("p1")).Data.Data.Integrations.WebhookConfigured));
        await Messaging("PUT", "/messaging/projects/p1/health-policy", HealthInput, MessagingEnvelope(Health), async c => ResourceTests.True((await c.BanSafe.UpdateProjectHealthPolicyAsync("p1", HealthRequest)).Data.Data.SlowDownMps is null));
        await Messaging("GET", "/messaging/s/safe-mode", null, MessagingEnvelope(SessionSafe), async c => ResourceTests.Equal((await c.BanSafe.GetSessionSafeModeAsync("s")).Data.Data.Override.Presence, "inherit"));
        await Messaging("PUT", "/messaging/s/safe-mode", """{"presence":"inherit"}""", MessagingEnvelope(SessionSafe), async c => ResourceTests.True(!(await c.BanSafe.UpdateSessionSafeModeAsync("s", new(Presence: "inherit"))).Data.Data.Mismatch));
        using var client = new MessagingClient(Credential.ClientToken("pmfa_ct_fixture"));
        try { await client.BanSafe.GetProjectHealthPolicyAsync("p1"); throw new Exception("Client token allowed"); } catch (PolymorfaConfigurationException) { }
        Console.WriteLine("PASS project settings, Hybrid merge metadata, bound project views and all 10 Messaging BanSafe controls");
    }
    private static string Platform(string item) => "{\"data\":" + item + "}";
    private static string MessagingEnvelope(string item) => "{\"success\":true,\"data\":" + item + "}";
    private static Task Organization(string method, string path, string? body, string response, Func<OrganizationClient, Task> invoke) => BillingTests.Organization(method, path, body, response, invoke);
    private static Task Messaging(string method, string path, string? body, string response, Func<MessagingClient, Task> invoke) => ResourceTests.Messaging(method, path, body, response, invoke);
}
