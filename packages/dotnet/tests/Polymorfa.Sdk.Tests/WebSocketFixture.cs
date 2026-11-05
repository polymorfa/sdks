using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

internal sealed class WebSocketFixture : IDisposable
{
    private readonly TcpListener listener = new(IPAddress.Loopback, 0);
    private readonly List<TcpClient> connections = [];
    public Uri Url { get; }
    public WebSocketFixture() { listener.Start(); Url = new($"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}"); }
    public async Task<WebSocket> AcceptAsync(string path, string? protocol = null)
    {
        using var bound = new CancellationTokenSource(TimeSpan.FromSeconds(5)); var client = await listener.AcceptTcpClientAsync(bound.Token); connections.Add(client); var stream = client.GetStream(); var bytes = new List<byte>(); var one = new byte[1];
        while (true) { if (await stream.ReadAsync(one, bound.Token) == 0) throw new Exception("WebSocket handshake ended"); bytes.Add(one[0]); if (bytes.Count > 65536) throw new Exception("Handshake too large"); if (bytes.Count >= 4 && bytes[^4] == 13 && bytes[^3] == 10 && bytes[^2] == 13 && bytes[^1] == 10) break; }
        var lines = Encoding.ASCII.GetString(bytes.ToArray()).Split("\r\n"); ResourceTests.Equal(lines[0], $"GET {path} HTTP/1.1"); var headers = lines.Skip(1).Where(x => x.Contains(':')).Select(x => x.Split(':', 2)).ToDictionary(x => x[0], x => x[1].Trim(), StringComparer.OrdinalIgnoreCase);
        ResourceTests.True(!headers.ContainsKey("authorization") && !headers.ContainsKey("cookie")); ResourceTests.Equal(headers.GetValueOrDefault("sec-websocket-protocol"), protocol);
        var hash = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
        var response = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + hash + "\r\n" + (protocol is null ? "" : "Sec-WebSocket-Protocol: " + protocol + "\r\n") + "\r\n"; await stream.WriteAsync(Encoding.ASCII.GetBytes(response), bound.Token);
        return WebSocket.CreateFromStream(stream, true, protocol, TimeSpan.Zero);
    }
    public static async Task<(WebSocketMessageType Type, byte[] Bytes)> ReceiveAsync(WebSocket socket)
    {
        using var bound = new CancellationTokenSource(TimeSpan.FromSeconds(5)); var bytes = new byte[8192]; using var output = new MemoryStream(); ValueWebSocketReceiveResult part; do { part = await socket.ReceiveAsync(bytes.AsMemory(), bound.Token); output.Write(bytes, 0, part.Count); } while (!part.EndOfMessage); return (part.MessageType, output.ToArray());
    }
    public static async Task<JsonElement> ReceiveJsonAsync(WebSocket socket) { var frame = await ReceiveAsync(socket); ResourceTests.Equal(frame.Type, WebSocketMessageType.Text); using var doc = JsonDocument.Parse(frame.Bytes); return doc.RootElement.Clone(); }
    public static async Task TextAsync(WebSocket socket, string json, bool fragmented = false)
    {
        var bytes = Encoding.UTF8.GetBytes(json); if (fragmented) { var half = bytes.Length / 2; await socket.SendAsync(bytes.AsMemory(0, half), WebSocketMessageType.Text, false, CancellationToken.None); await socket.SendAsync(bytes.AsMemory(half), WebSocketMessageType.Text, true, CancellationToken.None); } else await socket.SendAsync(bytes.AsMemory(), WebSocketMessageType.Text, true, CancellationToken.None);
    }
    public void Dispose() { listener.Stop(); foreach (var c in connections) c.Dispose(); }
}
