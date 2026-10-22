using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;
using static CampaignExistingTests;

internal static class Media41Tests
{
    private sealed class Wrapper(Func<string, WhatsAppEncryptedUploadBody, Task<WhatsAppUploadLocation>> upload) : IWhatsAppMediaUploadTransport
    {
        public string Name => "custom-direct-name-is-not-authority";
        public Task<WhatsAppUploadLocation> UploadAsync(string session, WhatsAppEncryptedUploadBody body, CancellationToken cancellation = default) => upload(session, body);
    }
    internal static async Task RunAsync()
    {
        await PrincipalAsync(); await StickerAsync();
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "contracts/fixtures/whatsapp-media.json"))) directory = directory.Parent;
        var root = directory?.FullName ?? throw new Exception("Physical media fixtures missing");
        var peerPath = Path.Combine(root, "packages/dotnet/tests/Polymorfa.Sdk.Tests/customer-data-server.mjs");
        if (!File.Exists(peerPath)) peerPath = Path.Combine(root, "customer-data-server.mjs");
        var start = new ProcessStartInfo(Environment.GetEnvironmentVariable("SDK_NODE") ?? "node") { WorkingDirectory = root, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false }; start.ArgumentList.Add(peerPath);
        using var peer = Process.Start(start) ?? throw new Exception("Cannot launch synthetic peer");
        try
        {
            using var ready = JsonDocument.Parse(await peer.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(20)) ?? throw new Exception("Peer exited"));
            var value = ready.RootElement; var port = value.GetProperty("port").GetInt32();
            using var authority = X509Certificate2.CreateFromPem(Encoding.UTF8.GetString(Convert.FromBase64String(value.GetProperty("certificate").GetString()!)));
            void Configure(SocketsHttpHandler handler)
            {
                handler.UseProxy = false;
                handler.ConnectCallback = async (_, token) => { var socket = new Socket(SocketType.Stream, ProtocolType.Tcp); try { await socket.ConnectAsync(new IPEndPoint(IPAddress.Loopback, port), token); return new NetworkStream(socket, true); } catch { socket.Dispose(); throw; } };
                handler.SslOptions.CertificateChainPolicy = new X509ChainPolicy { TrustMode = X509ChainTrustMode.CustomRootTrust, RevocationMode = X509RevocationMode.NoCheck }; handler.SslOptions.CertificateChainPolicy.CustomTrustStore.Add(authority);
            }
            using var handler = new SocketsHttpHandler(); Configure(handler); using var control = new HttpClient(handler);
            var url = new Uri("http://127.0.0.1:" + value.GetProperty("apiPort").GetInt32());
            using var server = new MessagingClient(Key, new() { BaseUrl = url, MaxNetworkRetries = 0 });
            using var scoped = new MessagingClient(Credential.ClientToken("pmfa_ct_Zml4dHVyZQ"), new() { BaseUrl = url, MaxNetworkRetries = 0 });
            foreach (var kind in Enum.GetValues<WhatsAppUploadMediaType>())
            {
                var plaintext = Enumerable.Range(0, 100).Select(i => (byte)i).ToArray(); using var source = new MemoryStream(plaintext);
                var prepared = await WhatsAppMedia.PrepareUploadAsync(source, new(kind) { MediaKey = Enumerable.Repeat((byte)7, 32).ToArray() });
                Check(source.CanRead && source.Position == plaintext.Length, "Explicit preparation leaves source open at EOF");
                var relayName = "relay41-" + kind; var directName = "direct41-" + kind;
                var relay = await scoped.WhatsAppMedia.UploadAsync(relayName, prepared, scoped.WhatsAppMedia.RelayTransport());
                var direct = await server.WhatsAppMedia.UploadDirectAsync(directName, prepared, new() { ConfigureHttpHandler = Configure, MaxAttempts = 1 });
                var relayBytes = await control.GetByteArrayAsync("https://mmg.whatsapp.net/stored/" + relayName);
                var directBytes = await control.GetByteArrayAsync("https://mmg.whatsapp.net/stored/" + directName);
                Check(relayBytes.SequenceEqual(directBytes) && relayBytes.LongLength == prepared.Info.EncryptedLength && SHA256.HashData(relayBytes).SequenceEqual(prepared.Info.FileEncSha256), "Independent stored ciphertext/hash/length " + kind);
                Check(relay.Info.MediaType == kind && direct.Info.FileLength == plaintext.Length && source.CanRead, "Media identity/source ownership " + kind);
            }
            using var state = JsonDocument.Parse(await control.GetStringAsync("https://mmg.whatsapp.net/state"));
            foreach (var request in state.RootElement.GetProperty("requests").EnumerateArray().Where(r => r.GetProperty("boundary").GetString() == "api"))
            {
                var path = request.GetProperty("path").GetString()!;
                if (!path.Contains("41-", StringComparison.Ordinal)) continue;
                var kind = path.Contains("Ptt", StringComparison.Ordinal) ? "voice" : path.Contains("Audio", StringComparison.Ordinal) ? "voice" : path.Contains("Document", StringComparison.Ordinal) ? "file" : path.Contains("Image", StringComparison.Ordinal) ? "image" : path.Contains("Video", StringComparison.Ordinal) ? "video" : "sticker";
                if (path.Contains("upload-grants", StringComparison.Ordinal))
                {
                    using var body = JsonDocument.Parse(Convert.FromBase64String(request.GetProperty("body").GetString()!));
                    Check(body.RootElement.GetProperty("type").GetString() == kind && !body.RootElement.TryGetProperty("encryptedLength", out _) && body.RootElement.EnumerateObject().Count() == (kind == "voice" ? 3 : 2), "Exact grant shape");
                    if (kind == "voice") Check(body.RootElement.GetProperty("ptt").GetBoolean() == path.Contains("Ptt", StringComparison.Ordinal), "PTT grant false/true");
                }
                else
                {
                    Check(path.Contains("type=" + kind, StringComparison.Ordinal), "Relay type mapping");
                    if (kind == "voice") Check(path.Contains("ptt=" + (path.Contains("Ptt", StringComparison.Ordinal) ? "true" : "false"), StringComparison.Ordinal), "PTT relay false/true");
                }
            }
            Console.WriteLine("PASS media41 six actual encrypt/direct/Client relay uploads and independent stored ciphertext retrieval");
        }
        finally { if (!peer.HasExited) peer.Kill(true); await peer.WaitForExitAsync(); }
    }
    private static async Task PrincipalAsync()
    {
        var opens = 0; var disposals = 0;
        Task<Stream> Open(CancellationToken _) { opens++; return Task.FromResult<Stream>(new OwnedStream(() => disposals++)); }
        var prepared = await WhatsAppMedia.PrepareUploadAsync(Open, new(WhatsAppUploadMediaType.Image));
        Check(opens == 1 && disposals == 1, "Explicit preparation owns initial factory source");
        using var wire = new WireFixture(); using var c = new MessagingClient(Credential.ClientToken("pmfa_ct_Zml4dHVyZQ"), Options(wire));
        foreach (var call in new Func<Task>[] { async () => { await c.WhatsAppMedia.UploadDirectAsync("s", prepared); }, async () => { var t = c.WhatsAppMedia.DirectTransport(); await c.WhatsAppMedia.UploadAsync("s", prepared, t); }, async () => { await c.WhatsAppMedia.UploadAsync("s", prepared, new Wrapper(async (s, _) => (await c.WhatsAppMedia.UploadDirectAsync(s, prepared)).Location)); } })
        {
            try { await call(); throw new Exception("Client direct accepted"); } catch (PolymorfaConfigurationException) { Check(opens == 1 && disposals == 1 && !wire.Pending, "Client direct no further source/grant/storage"); }
        }
        var customCalls = 0;
        var custom = new Wrapper(async (_, body) => { customCalls++; await using var stream = await body.OpenAsync(); using var output = new MemoryStream(); await stream.CopyToAsync(output); Check(output.Length == body.EncryptedLength && SHA256.HashData(output.ToArray()).SequenceEqual(body.FileEncSha256), "Ciphertext-only custom body"); return new("/custom", "https://example.test/custom"); });
        await c.WhatsAppMedia.UploadAsync("s", prepared, custom);
        Check(customCalls == 1 && opens == 2 && disposals == 2 && !wire.Pending, "Custom transport works with direct in its name");
    }
    private sealed class OwnedStream(Action closed) : MemoryStream(new byte[32])
    {
        protected override void Dispose(bool disposing) { if (disposing) closed(); base.Dispose(disposing); }
    }
    private static async Task StickerAsync()
    {
        var media = new WhatsAppMediaSendDescriptor("/sticker.enc", new byte[32], new byte[32], new byte[32], 100, "image/webp", "https://mmg.whatsapp.net/sticker.enc") { Width = 64, Height = 64, MediaKeyTimestamp = 1 };
        foreach (var animated in new[] { false, true })
        {
            const string hash = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
            var body = "{\"conversation\":{\"id\":\"c\"},\"content\":{\"sticker\":{\"directPath\":\"/sticker.enc\",\"mediaKey\":\"" + hash + "\",\"fileSha256\":\"" + hash + "\",\"fileEncSha256\":\"" + hash + "\",\"fileLength\":100,\"mimeType\":\"image/webp\",\"url\":\"https://mmg.whatsapp.net/sticker.enc\",\"width\":64,\"height\":64,\"mediaKeyTimestamp\":1,\"isAnimated\":" + animated.ToString().ToLowerInvariant() + "}}}";
            var response = "{\"success\":true,\"data\":{\"id\":\"9007199254740993123\",\"whatsapp_ids\":{\"linked_devices\":\"wa\"},\"conversation\":{\"id\":\"c\"},\"timestamp\":\"2026-10-14\",\"status\":\"sent\",\"type\":\"sticker\"}}";
            await Messaging("POST", "/messaging/s/messages/send", body, response, async c => Check((await c.Messages.SendAsync("s", new(new(Id: "c"), new StickerContent(media with { IsAnimated = animated })))).Data.Data.Id == "9007199254740993123", "19-digit message Id"), version: "2026-10-14");
            await Messaging("POST", "/messaging/s/messages/send", body, response, async c => { await c.Messages.SendAsync("s", new(new(Id: "c"), new StickerContent(media with { IsAnimated = animated })), new() { ApiVersion = "2026-09-22" }); });
        }
        foreach (var bad in new WhatsAppMediaSendDescriptor?[] { null, media with { Caption = "no" }, media with { MimeType = "image/png" }, media with { Width = 0 }, media with { Height = null }, media with { Seconds = 1 }, media with { Thumbnail = new byte[1] }, media with { Waveform = new byte[64] }, media with { Filename = "x" }, media with { Ptt = false } })
            await NoHttp(async (c, _) => { await c.Messages.SendAsync("s", new(new(Id: "c"), new StickerContent(bad!))); });
    }
}
