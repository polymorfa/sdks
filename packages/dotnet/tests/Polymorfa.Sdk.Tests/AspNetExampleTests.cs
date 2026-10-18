using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;
using System.Net.Http.Json;

internal static class AspNetExampleTests
{
    public static async Task RunAsync(string root)
    {
        using var wire = new WireFixture(); var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(); var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop(); var origin = $"http://127.0.0.1:{port}";
        var password = Guid.NewGuid().ToString("N");
        var info = new ProcessStartInfo("dotnet") { WorkingDirectory = Path.Combine(root, "packages/dotnet/examples/aspnet-core"), RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        info.ArgumentList.Add(Path.Combine(info.WorkingDirectory, "bin/Release/net8.0/Polymorfa.Example.AspNet.dll"));
        info.Environment["ASPNETCORE_URLS"] = origin; info.Environment["ASPNETCORE_ENVIRONMENT"] = "Development"; info.Environment["POLYMORFA_SESSION"] = "support"; info.Environment["POLYMORFA_API_KEY"] = "pmfa_" + new string('a', 72); info.Environment["POLYMORFA_API_BASE_URL"] = wire.Url.ToString(); info.Environment["POLYMORFA_EXAMPLE_PASSWORD"] = password; info.Environment["POLYMORFA_RECIPIENT"] = "+15550001234"; info.Environment["POLYMORFA_WEBHOOK_SECRET"] = "local-test-signing-key";
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
            using var history = await client.GetAsync("/api/polymorfa/conversation", deadline.Token); ResourceTests.Equal(history.StatusCode, HttpStatusCode.OK); using var h = JsonDocument.Parse(await history.Content.ReadAsStringAsync(deadline.Token)); ResourceTests.Equal(h.RootElement.GetProperty("messages").GetArrayLength(), 0);
            serving = wire.ServeAsync("POST", "/messaging/quicklinks", """{"purpose":"add_connection","session":"support","connectionGoal":"hybrid","addConnection":"linked_devices"}""", """{"success":true,"data":{"id":"q","url":"https://example.test/q","purpose":"add_connection","session":"support","connectionGoal":"hybrid","addConnection":"linked_devices","expiresAt":null}}""");
            using (var connect = await client.PostAsync("/api/polymorfa/connect", new StringContent("{\"session\":\"attacker\"}"), deadline.Token)) ResourceTests.Equal(connect.StatusCode, HttpStatusCode.OK);
            await serving;
            var key = "ad87d91a-32fc-48ab-aa00-5973d1e9f98d";
            async Task<HttpResponseMessage> Send(string body) { using var request = new HttpRequestMessage(HttpMethod.Post,"/api/polymorfa/send"){Content=new StringContent(body,Encoding.UTF8,"application/json")};request.Headers.Add("Idempotency-Key",key);return await client.SendAsync(request,deadline.Token); }
            using (var fixedTarget=await Send("""{"text":"Native send","recipient":"foreign"}""")) ResourceTests.Equal(fixedTarget.StatusCode,HttpStatusCode.BadRequest);
            serving=wire.ServeAsync("POST","/messaging/support/messages/send","""{"conversation":{"phoneNumber":"+15550001234"},"content":{"text":"Native send"}}""","""{"success":true,"data":{"id":"message-out","timestamp":"2026-10-18T10:00:00.750Z","status":"sent","type":"text","conversation":{"id":"canonical-peer"},"whatsapp_ids":{"linked_devices":"wire-out"}}}""",expectedHeaders:new Dictionary<string,string>{{"idempotency-key",key}});
            using (var sent=await Send("""{"text":"Native send"}""")) ResourceTests.Equal(sent.StatusCode,HttpStatusCode.OK);
            await serving;
            using (var same=await Send("""{"text":"Native send"}""")) ResourceTests.Equal(same.StatusCode,HttpStatusCode.OK);
            ResourceTests.True(!wire.Pending);
            using (var changed=await Send("""{"text":"Changed"}""")) ResourceTests.Equal(changed.StatusCode,HttpStatusCode.Conflict);
            using var payload=JsonDocument.Parse("""{"id":"message-in","conversation":{"id":"canonical-peer"},"fromMe":false,"isGroup":false,"timestamp":1792317601,"text":"Independent reply","type":"text","pushName":"Test peer","whatsapp_ids":{"linked_devices":"wire-in"}}""");
            var fixture=Webhooks.CreateFixture(new UnknownWebhookEvent(new WebhookEnvelope("event-1","support","2026-10-18T10:00:01Z","message.received",payload.RootElement.Clone())),"local-test-signing-key");
            async Task<HttpResponseMessage> Webhook(string signature) { using var request=new HttpRequestMessage(HttpMethod.Post,"/webhooks/polymorfa"){Content=new ByteArrayContent(fixture.Body)};request.Headers.Add("x-webhook-signature",signature);return await client.SendAsync(request,deadline.Token); }
            using (var bad=await Webhook("bad")) ResourceTests.Equal(bad.StatusCode,HttpStatusCode.Unauthorized);
            for(var i=0;i<2;i++) {using var received=await Webhook(fixture.Signature);ResourceTests.Equal(received.StatusCode,HttpStatusCode.NoContent);}
            var snapshot=await client.GetFromJsonAsync<JsonElement>("/api/polymorfa/conversation",deadline.Token);
            ResourceTests.Equal(snapshot.GetProperty("messages")[0].GetProperty("text").GetString(),"Native send");ResourceTests.Equal(snapshot.GetProperty("messages")[1].GetProperty("text").GetString(),"Independent reply");ResourceTests.Equal(snapshot.GetProperty("receivedEvents").GetInt32(),1);
            using var reload=await client.GetAsync("/",deadline.Token);
            var after=await client.GetFromJsonAsync<JsonElement>("/api/polymorfa/conversation",deadline.Token);ResourceTests.Equal(after.GetRawText(),snapshot.GetRawText());
            using var logout = await client.PostAsync("/example/logout", new StringContent("{}"), deadline.Token); ResourceTests.Equal(logout.StatusCode, HttpStatusCode.NoContent);
            using var replay = new HttpClient(new HttpClientHandler { UseCookies = false }) { BaseAddress = new(origin) }; replay.DefaultRequestHeaders.Add("Origin", origin); replay.DefaultRequestHeaders.Add("Cookie", cookie.Split(';')[0]); using var revoked = await replay.PostAsync("/api/polymorfa/token", new StringContent("{}"), deadline.Token); ResourceTests.Equal(revoked.StatusCode, HttpStatusCode.Unauthorized);
            using (var deniedHistory=await client.GetAsync("/api/polymorfa/conversation",deadline.Token)) ResourceTests.Equal(deniedHistory.StatusCode,HttpStatusCode.Unauthorized);
            using (var deniedSend=await Send("""{"text":"Native send"}""")) ResourceTests.Equal(deniedSend.StatusCode,HttpStatusCode.Unauthorized);
            Console.WriteLine("PASS native send, signed reply, replay, reload, and actual ASP.NET example auth, trusted token scope, origin denial, forged-cookie rejection, no-store history and logout revocation");
        }
        finally { if (!app.HasExited) app.Kill(); await app.WaitForExitAsync(); await output; await errors; }
    }
}
