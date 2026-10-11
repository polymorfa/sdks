using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

internal static class AspNetExampleTests
{
    public static async Task RunAsync(string root)
    {
        using var wire = new WireFixture(); var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(); var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop(); var origin = $"http://127.0.0.1:{port}";
        var password = Guid.NewGuid().ToString("N");
        var info = new ProcessStartInfo("dotnet") { WorkingDirectory = Path.Combine(root, "packages/dotnet/examples/aspnet-core"), RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        info.ArgumentList.Add(Path.Combine(info.WorkingDirectory, "bin/Release/net8.0/Polymorfa.Example.AspNet.dll"));
        info.Environment["ASPNETCORE_URLS"] = origin; info.Environment["ASPNETCORE_ENVIRONMENT"] = "Development"; info.Environment["POLYMORFA_SESSION"] = "support"; info.Environment["POLYMORFA_API_KEY"] = "pmfa_" + new string('a', 72); info.Environment["POLYMORFA_API_BASE_URL"] = wire.Url.ToString(); info.Environment["POLYMORFA_EXAMPLE_PASSWORD"] = password;
        using var app = Process.Start(info) ?? throw new Exception("Cannot launch ASP.NET example."); var output = app.StandardOutput.ReadToEndAsync(); var errors = app.StandardError.ReadToEndAsync();
        try
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(20)); using var client = new HttpClient(new HttpClientHandler { CookieContainer = new(), AllowAutoRedirect = false }) { BaseAddress = new(origin), Timeout = TimeSpan.FromSeconds(5) };
            for (var attempt = 0; ; attempt++) try { using var ready = await client.GetAsync("/example/config", deadline.Token); if (ready.IsSuccessStatusCode) break; if (attempt > 100) throw new Exception("Example did not start."); await Task.Delay(50, deadline.Token); } catch (HttpRequestException) { await Task.Delay(50, deadline.Token); }
            using (var blazor = await client.GetAsync("/blazor/", deadline.Token)) ResourceTests.Equal(blazor.StatusCode, HttpStatusCode.OK);
            using (var globalization = await client.GetAsync("/blazor/_framework/icudt_EFIGS.dat", deadline.Token)) { ResourceTests.Equal(globalization.StatusCode, HttpStatusCode.OK); ResourceTests.True((await globalization.Content.ReadAsByteArrayAsync(deadline.Token)).Length > 0); }
            client.DefaultRequestHeaders.Add("Origin", origin);
            using (var anonymous = await client.PostAsync("/api/polymorfa/token", new StringContent("{}"), deadline.Token)) ResourceTests.Equal(anonymous.StatusCode, HttpStatusCode.Unauthorized);
            using (var wrong = await client.PostAsync("/example/login", new FormUrlEncodedContent(new Dictionary<string, string> { ["password"] = "wrong" }), deadline.Token)) ResourceTests.Equal(wrong.StatusCode, HttpStatusCode.Unauthorized);
            using var login = await client.PostAsync("/example/login", new FormUrlEncodedContent(new Dictionary<string, string> { ["password"] = password, ["session"] = "attacker", ["user"] = "attacker" }), deadline.Token); ResourceTests.Equal(login.StatusCode, HttpStatusCode.NoContent); var cookie = login.Headers.GetValues("set-cookie").Single(); ResourceTests.True(cookie.Contains("httponly", StringComparison.OrdinalIgnoreCase));
            using var denied = new HttpClient(new HttpClientHandler { UseCookies = false }) { BaseAddress = new(origin) }; denied.DefaultRequestHeaders.Add("Origin", origin); denied.DefaultRequestHeaders.Add("Cookie", "polymorfa-example=forged"); using (var forged = await denied.PostAsync("/api/polymorfa/token", new StringContent("{}"), deadline.Token)) ResourceTests.Equal(forged.StatusCode, HttpStatusCode.Unauthorized);
            client.DefaultRequestHeaders.Remove("Origin"); client.DefaultRequestHeaders.Add("Origin", "https://other.example"); using (var crossOrigin = await client.PostAsync("/api/polymorfa/token", new StringContent("{}"), deadline.Token)) ResourceTests.Equal(crossOrigin.StatusCode, HttpStatusCode.Forbidden); client.DefaultRequestHeaders.Remove("Origin"); client.DefaultRequestHeaders.Add("Origin", origin);
            var serving = wire.ServeAsync("POST", "/platform/client-tokens", "{\"ephemeralId\":\"example:example-operator\",\"session\":\"support\",\"ttlSeconds\":300}", "{\"success\":true,\"data\":{\"token\":\"pmfa_ct_fixture\",\"expiresAt\":\"2099-10-11T00:00:00Z\"}}");
            using var token = await client.PostAsync("/api/polymorfa/token", new StringContent("{\"session\":\"attacker\",\"ephemeralId\":\"attacker\"}", Encoding.UTF8, "application/json"), deadline.Token); ResourceTests.Equal(token.StatusCode, HttpStatusCode.OK); using var grant = JsonDocument.Parse(await token.Content.ReadAsStringAsync(deadline.Token)); ResourceTests.Equal(grant.RootElement.GetProperty("grant").GetProperty("session").GetString(), "support"); ResourceTests.Equal(token.Headers.CacheControl?.NoStore, true); await serving;
            using var history = await client.GetAsync("/api/polymorfa/history/conversations", deadline.Token); ResourceTests.Equal(history.StatusCode, HttpStatusCode.OK); using var h = JsonDocument.Parse(await history.Content.ReadAsStringAsync(deadline.Token)); ResourceTests.Equal(h.RootElement.GetProperty("data").GetArrayLength(), 0);
            using var logout = await client.PostAsync("/example/logout", new StringContent("{}"), deadline.Token); ResourceTests.Equal(logout.StatusCode, HttpStatusCode.NoContent);
            using var replay = new HttpClient(new HttpClientHandler { UseCookies = false }) { BaseAddress = new(origin) }; replay.DefaultRequestHeaders.Add("Origin", origin); replay.DefaultRequestHeaders.Add("Cookie", cookie.Split(';')[0]); using var revoked = await replay.PostAsync("/api/polymorfa/token", new StringContent("{}"), deadline.Token); ResourceTests.Equal(revoked.StatusCode, HttpStatusCode.Unauthorized);
            Console.WriteLine("PASS actual ASP.NET example auth, trusted token scope, origin denial, forged-cookie rejection, no-store history and logout revocation");
        }
        finally { if (!app.HasExited) app.Kill(); await app.WaitForExitAsync(); await output; await errors; }
    }
}
