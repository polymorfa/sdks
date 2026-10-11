using System.Net;
using System.Net.Sockets;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;

internal sealed class WireFixture : IDisposable
{
    private readonly TcpListener listener = new(IPAddress.Loopback, 0);
    public Uri Url { get; }
    private readonly X509Certificate2? certificate;
    public string? Authorization { get; init; }
    public IReadOnlyDictionary<string, string>? ExpectedHeaders { get; init; }
    public int FragmentBytes { get; init; }
    public IReadOnlyList<string> AbsentHeaders { get; init; } = [];
    public IReadOnlyList<string> RequiredHeaders { get; init; } = [];
    public WireFixture(X509Certificate2? certificate = null) { this.certificate = certificate; listener.Start(); Url = new($"{(certificate is null ? "http" : "https")}://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}"); }
    public async Task ServeAsync(string method, string path, string? body, string response, int status = 200, IReadOnlyDictionary<string, string>? responseHeaders = null, string? absentHeader = null, IReadOnlyDictionary<string, string>? expectedHeaders = null)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        using var connection = await listener.AcceptTcpClientAsync(timeout.Token);
        await using Stream stream = certificate is null ? connection.GetStream() : new SslStream(connection.GetStream());
        if (stream is SslStream tls) await tls.AuthenticateAsServerAsync(new SslServerAuthenticationOptions { ServerCertificate = certificate }, timeout.Token);
        var bytes = new List<byte>(); var one = new byte[1];
        while (true)
        {
            if (await stream.ReadAsync(one, timeout.Token) == 0) throw new Exception("Request ended before headers.");
            bytes.Add(one[0]); if (bytes.Count > 65536) throw new Exception("Request headers too large.");
            if (bytes.Count >= 4 && bytes[^4] == 13 && bytes[^3] == 10 && bytes[^2] == 13 && bytes[^1] == 10) break;
        }
        var lines = Encoding.ASCII.GetString(bytes.ToArray()).Split("\r\n");
        if (lines[0] != $"{method} {path} HTTP/1.1") throw new Exception($"Unexpected native request line: {lines[0]}");
        var headers = lines.Skip(1).Where(line => line.Contains(':')).Select(line => line.Split(':', 2)).ToDictionary(row => row[0], row => row[1].Trim(), StringComparer.OrdinalIgnoreCase);
        if (Authorization is not null && (!headers.TryGetValue("authorization", out var credential) || credential != Authorization)) throw new Exception("Native authorization header differs.");
        if (absentHeader is not null && headers.ContainsKey(absentHeader)) throw new Exception("Sensitive header reached storage.");
        foreach (var expectedHeader in expectedHeaders ?? ExpectedHeaders ?? new Dictionary<string, string>())
            if (!headers.TryGetValue(expectedHeader.Key, out var value) || value != expectedHeader.Value) throw new Exception("Native header differs: " + expectedHeader.Key);
        foreach (var absent in AbsentHeaders) if (headers.ContainsKey(absent)) throw new Exception("Unexpected native header: " + absent);
        foreach (var required in RequiredHeaders) if (!headers.TryGetValue(required, out var requiredValue) || string.IsNullOrEmpty(requiredValue)) throw new Exception("Missing native header: " + required);
        var length = headers.TryGetValue("content-length", out var rawLength) ? int.Parse(rawLength) : 0;
        var input = new byte[length]; await stream.ReadExactlyAsync(input, timeout.Token);
        if (body is null) { if (length != 0) throw new Exception("Unexpected native body."); }
        else
        {
            if (body.StartsWith("bytes:", StringComparison.Ordinal)) { if (!input.SequenceEqual(Convert.FromBase64String(body[6..]))) throw new Exception("Native binary request differs."); }
            else { using var actual = JsonDocument.Parse(input); using var expected = JsonDocument.Parse(body);
            if (!EqualJson(actual.RootElement, expected.RootElement)) throw new Exception("Native JSON request shape differs."); }
        }
        var output = Encoding.UTF8.GetBytes(response);
        var contentType = responseHeaders?.GetValueOrDefault("content-type") ?? "application/json";
        var responseText = $"HTTP/1.1 {status} Fixture\r\ncontent-type: {contentType}\r\ncontent-length: {output.Length}\r\nconnection: close\r\nx-request-id: req_native\r\n";
        foreach (var header in responseHeaders ?? new Dictionary<string, string>()) if (header.Key != "content-type") responseText += $"{header.Key}: {header.Value}\r\n";
        await stream.WriteAsync(Encoding.ASCII.GetBytes(responseText + "\r\n"), timeout.Token);
        if (FragmentBytes > 0)
            for (var offset = 0; offset < output.Length; offset += FragmentBytes)
            {
                await stream.WriteAsync(output.AsMemory(offset, Math.Min(FragmentBytes, output.Length - offset)), timeout.Token);
                await Task.Delay(1, timeout.Token);
            }
        else await stream.WriteAsync(output, timeout.Token);
    }
    internal static bool EqualJson(JsonElement left, JsonElement right)
    {
        if (left.ValueKind != right.ValueKind) return false;
        if (left.ValueKind == JsonValueKind.Object) { var l = left.EnumerateObject().ToDictionary(p => p.Name, p => p.Value); var r = right.EnumerateObject().ToDictionary(p => p.Name, p => p.Value); return l.Count == r.Count && l.All(p => r.TryGetValue(p.Key, out var v) && EqualJson(p.Value, v)); }
        if (left.ValueKind == JsonValueKind.Array) { var l = left.EnumerateArray().ToArray(); var r = right.EnumerateArray().ToArray(); return l.Length == r.Length && l.Zip(r).All(p => EqualJson(p.First, p.Second)); }
        return left.ValueKind == JsonValueKind.String ? left.GetString() == right.GetString() : left.GetRawText() == right.GetRawText();
    }
    public void Dispose() => listener.Stop();
}
