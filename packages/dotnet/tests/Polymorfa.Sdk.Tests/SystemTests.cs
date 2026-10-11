using Polymorfa.Sdk;

internal static class SystemTests
{
    public static async Task RunAsync()
    {
        await System("/messaging/info/status", """{"status":"ok","uptime":"5m","version":"2026-09-22","env":"production"}""", async c => ResourceTests.Equal((await c.StatusAsync()).Data.Uptime, "5m"));
        await System("/messaging/info/version", """{"version":"2026-09-22","buildTime":"2026-09-22T00:00:00Z","env":"production","apiVersion":"2026-09-22","minSupportedVersion":"2026-09-22"}""", async c => ResourceTests.Equal((await c.VersionAsync()).Data.ApiVersion, "2026-09-22"));
        await System("/health", """{"status":"ok","checks":{"storage":{"status":"ok"},"queue":{"status":"ok","error":null}}}""", async c => ResourceTests.Equal((await c.HealthAsync()).Data.Checks["queue"].Status, "ok"));
        await System("/ping", """{"status":"ok"}""", async c => ResourceTests.Equal((await c.PingAsync()).Data.Status, "ok"));
        var key = "pmfa_pt_" + new string('a', 93) + "A";
        using var fixture = new WireFixture { Authorization = "Bearer " + key };
        var serve = fixture.ServeAsync("GET", "/messaging/bridge/route", null, """{"wsUrl":"wss://bridge.polymorfa.com/ws","region":"BR","kind":"production","signal":"customer","tokenKind":"project","expiresAt":1726170122}""");
        using var bridge = new BridgeClient(Credential.ProjectToken(key), new() { BaseUrl = fixture.Url });
        ResourceTests.Equal((await bridge.Routes.ResolveAsync()).Data.Region, "BR"); await serve;
        try { using var wrong = new BridgeClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72))); throw new Exception("Wrong Bridge principal accepted"); } catch (PolymorfaConfigurationException) { }
        Console.WriteLine("PASS credential-free System probes and project-token Bridge discovery");
    }
    private static async Task System(string path, string response, Func<SystemClient, Task> invoke)
    {
        using var fixture = new WireFixture();
        var serve = fixture.ServeAsync("GET", path, null, response, absentHeader: "authorization");
        using var client = new SystemClient(new() { BaseUrl = fixture.Url });
        await invoke(client); await serve;
    }
}
