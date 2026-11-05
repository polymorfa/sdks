using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Polymorfa.Example.Maui.Bridge;

static void Check(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
foreach (var url in new[] { "http://example.com/", "https://user:password@example.com/", "https://example.com/path", "https://example.com/?x=1", "https://example.com/#fragment", "file:///" })
{
    try { using var invalid = new ApplicationBridge(new(url)); throw new Exception("Unsafe URL accepted"); }
    catch (ArgumentException) { }
}
using var listener = new TcpListener(IPAddress.Loopback, 0);
listener.Start();
var origin = new Uri($"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/");
using var stop = new CancellationTokenSource();
var requests = new List<(string Method, string Path, Dictionary<string, string> Headers, string Body)>();
var redirect = false;
var oversized = false;
var unauthorized = false;
var delay = false;
var html = false;
var server = Task.Run(async () =>
{
    try
    {
        while (!stop.IsCancellationRequested)
        {
            using var socket = await listener.AcceptTcpClientAsync(stop.Token);
            await using var stream = socket.GetStream();
            using var reader = new StreamReader(stream, Encoding.UTF8, false, 1024, leaveOpen: true);
            var first = (await reader.ReadLineAsync(stop.Token))!.Split(' ');
            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            while (await reader.ReadLineAsync(stop.Token) is { Length: > 0 } line) { var colon = line.IndexOf(':'); headers[line[..colon]] = line[(colon + 1)..].Trim(); }
            var bodyChars = new char[headers.TryGetValue("Content-Length", out var size) ? int.Parse(size) : 0];
            if (bodyChars.Length > 0) await reader.ReadBlockAsync(bodyChars, stop.Token);
            var body = new string(bodyChars);
            lock (requests) requests.Add((first[0], first[1], headers, body));
            var status = 200;
            var extra = "";
            var content = "{}";
            if (first[1] == "/example/login")
            {
                Check(first[0] == "POST" && headers.GetValueOrDefault("Origin") == origin.GetLeftPart(UriPartial.Authority), "Native login origin/method");
                status = body == "password=fixture-only" ? 204 : 401;
                if (status == 204) extra = "Set-Cookie: app-session=opaque-fixture; HttpOnly; SameSite=Strict; Path=/\r\n";
                content = "";
            }
            else if (first[1] == "/example/config") content = "{\"apiBaseUrl\":\"https://api.polymorfa.com\"}";
            else
            {
                Check(headers.GetValueOrDefault("Cookie") == "app-session=opaque-fixture", "Application cookie must remain native and attached only to trusted host");
                if (first[0] == "POST") Check(headers.GetValueOrDefault("Origin") == origin.GetLeftPart(UriPartial.Authority), "Exact app-owned Origin");
                if (unauthorized) status = 401;
                else if (redirect) { status = 302; extra = "Location: https://example.com/steal\r\n"; }
                else if (first[1] == "/api/polymorfa/token") content = "{\"value\":\"pmfa_ct_fixture_only\",\"audience\":\"browser\"}";
                else if (first[1] == "/api/polymorfa/history/conversations") content = "{\"data\":[],\"nextCursor\":null}";
                else if (first[1] == "/example/logout") { status = 204; content = ""; }
            }
            Check(!headers.ContainsKey("Authorization") && !body.Contains("pmfa_at_") && !body.Contains("pmfa_pt_"), "Device must not contain or transmit server SDK credentials");
            if (html) content = "<html>proxy error with private operator information</html>";
            var contentType = html ? "text/html" : "application/json";
            var bytes = Encoding.UTF8.GetBytes(content);
            var length = oversized ? 1048577 : bytes.Length;
            await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 {status} Fixture\r\nContent-Type: {contentType}\r\nContent-Length: {length}\r\nConnection: close\r\n{extra}\r\n"), stop.Token);
            if (delay) await Task.Delay(300, stop.Token);
            await stream.WriteAsync(bytes, stop.Token);
        }
    }
    catch (OperationCanceledException) { }
});
try
{
    using var bridge = new ApplicationBridge(origin);
    Check((await bridge.RequestAsync("token")).Status == 401 && requests.Count == 0, "No unauthenticated token request");
    Check(!await bridge.LoginAsync("wrong") && !bridge.IsAuthenticated, "Invalid application sign-in");
    Check(await bridge.LoginAsync("fixture-only") && bridge.IsAuthenticated, "Native cookie sign-in");
    var config = await bridge.RequestAsync("config");
    Check(config.Status == 200 && config.Body.Contains("apiBaseUrl"), "Trusted API config");
    var grant = await bridge.RequestAsync("token");
    Check(grant.Status == 200 && grant.Body.Contains("pmfa_ct_fixture_only") && !JsonSerializer.Serialize(grant).Contains("opaque-fixture"), "Only scoped browser grant crosses bridge");
    Check((await bridge.RequestAsync("conversations")).Body.Contains("nextCursor"), "App-owned authorized history");
    Check((await bridge.RequestAsync("connect")).Status == 200, "App-owned authorized connect");
    var before = requests.Count;
    foreach (var action in new[] { "https://example.com/", "../token", "token?session=foreign", "/api/polymorfa/token", "Token" })
    {
        try { await bridge.RequestAsync(action); throw new Exception("Unknown action accepted"); } catch (ArgumentException) { }
    }
    Check(requests.Count == before, "Unknown paths rejected before network");
    redirect = true;
    Check((await bridge.RequestAsync("token")).Status == 502, "Redirect must not leak native cookie");
    redirect = false; html = true;
    var invalidBody = await bridge.RequestAsync("token");
    Check(invalidBody.Status == 502 && invalidBody.Body.Contains("invalid_response") && !invalidBody.Body.Contains("private operator"), "HTML upstream response must become safe error");
    html = false; oversized = true;
    try { await bridge.RequestAsync("token"); throw new Exception("Oversized response accepted"); } catch (InvalidDataException) { }
    oversized = false; delay = true;
    using (var cancellation = new CancellationTokenSource(50))
    { try { await bridge.RequestAsync("token", cancellation.Token); throw new Exception("Cancellation ignored"); } catch (OperationCanceledException) { } }
    delay = false;
    await Task.Delay(350);
    using (var shortBridge = new ApplicationBridge(origin, TimeSpan.FromMilliseconds(100)))
    {
        Check(await shortBridge.LoginAsync("fixture-only"), "Bounded bridge login");
        delay = true;
        var started = DateTimeOffset.UtcNow;
        try { await shortBridge.RequestAsync("token"); throw new Exception("Header-only deadline ignored body stall"); } catch (OperationCanceledException) { }
        Check(DateTimeOffset.UtcNow - started < TimeSpan.FromSeconds(1), "Deadline covers delayed response body");
        delay = false;
        await Task.Delay(350);
    }
    unauthorized = true;
    Check((await bridge.RequestAsync("token")).Status == 401 && !bridge.IsAuthenticated, "Server revocation clears native auth");
    unauthorized = false;
    Check(await bridge.LoginAsync("fixture-only"), "Fresh app sign-in");
    Check((await bridge.RequestAsync("logout")).Status == 204 && !bridge.IsAuthenticated, "Server and native logout");
    before = requests.Count;
    Check((await bridge.RequestAsync("token")).Status == 401 && requests.Count == before, "Logout fences future native token reads");
    Console.WriteLine("Native TCP app auth/cookie/origin/grant/history/connect/revocation/logout, URL confinement, redirect/size/cancellation checks passed.");
}
finally { stop.Cancel(); listener.Stop(); await server; }
if (args is ["--live", var liveUrl])
{
    using var live = new ApplicationBridge(new(liveUrl));
    Check(await live.LoginAsync("local-example-only"), "Live ASP app login");
    Check((await live.RequestAsync("token")).Status == 200, "Live ASP scoped grant");
    Check((await live.RequestAsync("conversations")).Status == 200, "Live ASP app history");
    Check((await live.RequestAsync("logout")).Status == 204 && (await live.RequestAsync("token")).Status == 401, "Live ASP logout boundary");
    Console.WriteLine("Live ASP native cookie bridge login/token/history/logout passed.");
}
