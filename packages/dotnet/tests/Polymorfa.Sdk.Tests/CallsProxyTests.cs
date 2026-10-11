using System.Net;
using System.Net.Sockets;
using System.Text;
using Polymorfa.Sdk;

internal static class CallsProxyTests
{
    public static async Task RunAsync()
    {
        using var fixture = new WebSocketFixture(); using var bound = new CancellationTokenSource(TimeSpan.FromSeconds(10)); var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        try
        {
            var proxy = new WebProxy($"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}");
            var forwarding = Task.Run(async () =>
            {
                using var inbound = await listener.AcceptTcpClientAsync(bound.Token); await using var stream = inbound.GetStream(); var header = new List<byte>(); var one = new byte[1];
                while (true) { if (await stream.ReadAsync(one, bound.Token) == 0) throw new Exception("proxy request ended"); header.Add(one[0]); if (header.Count > 65536) throw new Exception("proxy header exceeded bound"); if (header.Count >= 4 && header[^4] == 13 && header[^3] == 10 && header[^2] == 13 && header[^1] == 10) break; }
                var text = Encoding.ASCII.GetString(header.ToArray()); var connect = text.StartsWith($"CONNECT 127.0.0.2:{fixture.Url.Port} HTTP/1.1\r\n");
                if (!connect) ResourceTests.True(text.StartsWith($"GET http://127.0.0.2:{fixture.Url.Port}/voip/ws HTTP/1.1\r\n")); ResourceTests.True(!text.Contains("pmfa_ct_fixture"));
                using var target = new TcpClient(); await target.ConnectAsync(IPAddress.Loopback, fixture.Url.Port, bound.Token); await using var output = target.GetStream(); if (connect) await stream.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 200 Connection Established\r\n\r\n"), bound.Token);
                else await output.WriteAsync(Encoding.ASCII.GetBytes(text.Replace($"GET http://127.0.0.2:{fixture.Url.Port}/voip/ws HTTP/1.1", "GET /voip/ws HTTP/1.1")), bound.Token);
                await Task.WhenAny(stream.CopyToAsync(output, bound.Token), output.CopyToAsync(stream, bound.Token));
            }, bound.Token);
            var opening = CallsSocket.OpenLifecycleAsync(new("pmfa_ct_fixture"), new() { BaseUrl = new($"http://127.0.0.2:{fixture.Url.Port}"), Proxy = proxy, Heartbeat = TimeSpan.Zero }, cancellationToken: bound.Token);
            var accept = fixture.AcceptAsync("/voip/ws");
            if (await Task.WhenAny(accept, forwarding, opening) == forwarding) await forwarding;
            if (opening.IsFaulted) await opening;
            using var peer = await accept; var auth = await WebSocketFixture.ReceiveJsonAsync(peer); ResourceTests.Equal(auth.GetProperty("token").GetString(), "pmfa_ct_fixture"); await WebSocketFixture.TextAsync(peer, "{\"type\":\"ready\",\"session\":\"support\",\"participant\":\"client:user\"}"); await using var socket = await opening;
            ResourceTests.True(socket.Connected); await socket.DisposeAsync(); await forwarding.WaitAsync(bound.Token);
            Console.WriteLine("PASS native Calls HTTP proxy and first-frame credential custody");
        }
        finally { listener.Stop(); bound.Cancel(); }
    }
}
