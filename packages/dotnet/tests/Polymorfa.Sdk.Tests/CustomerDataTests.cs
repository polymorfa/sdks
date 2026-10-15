using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class CustomerDataTests
{
    private sealed class WrappedTransport(IWhatsAppMediaUploadTransport inner) : IWhatsAppMediaUploadTransport
    {
        internal int Calls;
        public string Name => "wrapped-" + inner.Name;
        public Task<WhatsAppUploadLocation> UploadAsync(string session, WhatsAppEncryptedUploadBody body, CancellationToken cancellation = default)
        {
            Calls++;
            return inner.UploadAsync(session, body, cancellation);
        }
    }
    internal static async Task RunAsync(string root)
    {
        var start = new ProcessStartInfo(Environment.GetEnvironmentVariable("SDK_NODE") ?? "node") { WorkingDirectory = root, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false }; start.ArgumentList.Add("packages/dotnet/tests/Polymorfa.Sdk.Tests/customer-data-server.mjs"); using var server = Process.Start(start)!; string? directory = null;
        try
        {
            using var ready = JsonDocument.Parse(await server.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(15)) ?? throw new Exception("HTTPS peer exited.")); var value = ready.RootElement; directory = value.GetProperty("directory").GetString()!; var port = value.GetProperty("port").GetInt32();
            using var authority = X509Certificate2.CreateFromPem(Encoding.UTF8.GetString(Convert.FromBase64String(value.GetProperty("certificate").GetString()!)));
            void Configure(SocketsHttpHandler handler)
            {
                handler.UseProxy = false; handler.AllowAutoRedirect = true; handler.UseCookies = true; handler.CookieContainer.Add(new Uri("https://mmg.whatsapp.net"), new Cookie("fixture", "synthetic")); handler.Credentials = new NetworkCredential("synthetic", "synthetic");
                handler.ConnectCallback = async (_, token) => { var socket = new Socket(SocketType.Stream, ProtocolType.Tcp); try { await socket.ConnectAsync(new IPEndPoint(IPAddress.Loopback, port), token); return new NetworkStream(socket, ownsSocket: true); } catch { socket.Dispose(); throw; } };
                handler.SslOptions.CertificateChainPolicy = new X509ChainPolicy { TrustMode = X509ChainTrustMode.CustomRootTrust, RevocationMode = X509RevocationMode.NoCheck }; handler.SslOptions.CertificateChainPolicy.CustomTrustStore.Add(authority);
            }
            foreach (var compression in new[] { "zlib", "gzip", "raw" })
            {
                var chunk = await HistoryChunks.DecodeAsync(Convert.FromBase64String(value.GetProperty(compression).GetString()!), 1024); ResourceTests.Equal(chunk.SyncType, 6UL); ResourceTests.Equal(chunk.Conversations[0].LastMessageTimestamp, ulong.MaxValue); ResourceTests.Equal(chunk.Proto.UInt64(211), ulong.MaxValue); ResourceTests.Equal(chunk.Conversations[0].Proto.Text(199), "unknown nested"); ResourceTests.True(chunk.DecodeWith(bytes => bytes.ToArray()).SequenceEqual(Convert.FromBase64String(value.GetProperty("proto").GetString()!)));
            }
            var history = value.GetProperty("history"); byte[] Field(string name) => Convert.FromHexString(history.GetProperty(name).GetString()!);
            var descriptor = new HistoryChunkDescriptor("/history.enc", Field("mediaKey"), Field("fileSha256"), Field("fileEncSha256"), history.GetProperty("fileLength").GetInt64()); var historyOptions = new HistoryChunkOptions { Media = new() { ConfigureHttpHandler = Configure }, MaxInflatedBytes = 1024 };
            ResourceTests.Equal((await HistoryChunks.DownloadAsync(descriptor, historyOptions)).Conversations[0].Name, "private chat");
            try { await HistoryChunks.DownloadAsync(descriptor with { DirectPath = "/history-bad.enc" }, historyOptions); throw new Exception("Unauthenticated history parsed"); } catch (PolymorfaMediaIntegrityException error) { ResourceTests.Equal(error.Code, "media_enc_hash_mismatch"); }
            try { await HistoryChunks.DecodeAsync(Convert.FromBase64String(value.GetProperty("zlib").GetString()!), 1); throw new Exception("Inflation bound ignored"); } catch (PolymorfaMediaIntegrityException error) { ResourceTests.Equal(error.Code, "media_too_large"); }
            try { await HistoryChunks.DecodeAsync("broken"u8.ToArray()); throw new Exception("Invalid compression accepted"); } catch (PolymorfaMediaIntegrityException) { }
            using var cancellation = new CancellationTokenSource(); cancellation.Cancel(); try { await HistoryChunks.DownloadAsync(new HistoryInlinePayload([]), historyOptions with { Media = historyOptions.Media with { CancellationToken = cancellation.Token } }); throw new Exception("Precancel ignored"); } catch (PolymorfaCancelledException) { }
            using var client = new MessagingClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new ClientOptions { BaseUrl = new($"http://127.0.0.1:{value.GetProperty("apiPort").GetInt32()}"), MaxNetworkRetries = 0 });
            var plaintext = Enumerable.Repeat((byte)42, 100).ToArray(); var prepared = await WhatsAppMedia.PrepareUploadAsync(plaintext, new(WhatsAppUploadMediaType.Document)); var relay = await client.WhatsAppMedia.UploadRelayAsync("relay", prepared); ResourceTests.Equal(relay.Info.FileLength, 100L);
            var wrappedRelay = new WrappedTransport(client.WhatsAppMedia.RelayTransport()); var wrappedRelayResult = await client.WhatsAppMedia.UploadAsync("wrapped-relay", prepared, wrappedRelay); ResourceTests.Equal(wrappedRelayResult.Egress, "wrapped-relay"); ResourceTests.Equal(wrappedRelay.Calls, 1);
            var wrappedDirect = new WrappedTransport(client.WhatsAppMedia.DirectTransport(new() { ConfigureHttpHandler = Configure })); var wrappedDirectResult = await client.WhatsAppMedia.UploadAsync("wrapped-direct", prepared, wrappedDirect); ResourceTests.Equal(wrappedDirectResult.Egress, "wrapped-direct"); ResourceTests.Equal(wrappedDirect.Calls, 1);
            foreach (var scenario in new[] { "plain", "retry", "unauthorized", "multipart" }) { var result = await client.WhatsAppMedia.UploadDirectAsync(scenario, prepared, new() { ConfigureHttpHandler = Configure, DocumentPartSize = scenario == "multipart" ? 32 : 1000 }); ResourceTests.Equal(result.Location.DirectPath, "/stored.enc"); }
            try { await client.WhatsAppMedia.UploadDirectAsync("redirect", prepared, new() { ConfigureHttpHandler = Configure }); throw new Exception("Redirect followed"); } catch (PolymorfaException error) { ResourceTests.True(!error.Message.Contains("synthetic-grant", StringComparison.Ordinal)); ResourceTests.True(!error.Message.Contains("secret=fixture", StringComparison.Ordinal)); }
            var reads = 0; Task<Stream> Changed(CancellationToken _) => Task.FromResult<Stream>(new MemoryStream(Enumerable.Repeat((byte)(Interlocked.Increment(ref reads) == 1 ? 1 : 2), 80).ToArray(), writable: false));
            var changed = await WhatsAppMedia.PrepareUploadAsync(Changed, new(WhatsAppUploadMediaType.Document)); long emitted = 0; await using (var body = await changed.OpenAsync()) { var buffer = new byte[7]; try { while (true) { var n = await body.ReadAsync(buffer); if (n == 0) throw new Exception("Changed source accepted"); emitted += n; } } catch (PolymorfaMediaIntegrityException error) { ResourceTests.Equal(error.Code, "media_enc_hash_mismatch"); } }
            ResourceTests.True(emitted < changed.Info.EncryptedLength);
            reads = 0; changed = await WhatsAppMedia.PrepareUploadAsync(Changed, new(WhatsAppUploadMediaType.Document)); try { await client.WhatsAppMedia.UploadDirectAsync("changed", changed, new() { ConfigureHttpHandler = Configure, MaxAttempts = 1, DocumentPartSize = 32 }); throw new Exception("Changed multipart source accepted"); } catch (PolymorfaMediaIntegrityException error) { ResourceTests.Equal(error.Code, "media_enc_hash_mismatch"); }
            reads = 0; changed = await WhatsAppMedia.PrepareUploadAsync(Changed, new(WhatsAppUploadMediaType.Document)); try { await client.WhatsAppMedia.UploadRelayAsync("changed-relay", changed); throw new Exception("Changed relay source accepted"); } catch (PolymorfaMediaIntegrityException error) { ResourceTests.Equal(error.Code, "media_enc_hash_mismatch"); }
            var image = await WhatsAppMedia.PrepareUploadAsync(new byte[20], new(WhatsAppUploadMediaType.Image) { Mimetype = "image/jpeg" }); var imageUpload = await client.WhatsAppMedia.UploadRelayAsync("image", image); var media = WhatsAppMedia.ToSendDescriptor(imageUpload.Info, imageUpload.Location);
            var message = new SendMessageRequest(new(Id: "c"), new DescriptorImageContent(media)); await client.Messages.SendAsync("image", message);
            var serialized = JsonSerializer.Serialize((DescriptorImageContent)message.Content, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }); ResourceTests.True(serialized.Contains("mediaKey", StringComparison.Ordinal));
            ResourceTests.True(media.ToSignalDescriptor(WhatsAppUploadMediaType.Image).MediaKey.SequenceEqual(media.MediaKey)); ResourceTests.True(!media.ToString().Contains(Convert.ToBase64String(media.MediaKey), StringComparison.Ordinal));
            try { (media with { Width = 1 }).Validate(WhatsAppUploadMediaType.Image); throw new Exception("Unpaired dimension accepted"); } catch (PolymorfaConfigurationException) { }
            ResourceTests.True(HistoryProtoMessage.Decode(new byte[] { 0x0b, 0x10, 0x01, 0x0c }).Fields[0].Encoded.SequenceEqual(new byte[] { 0x0b, 0x10, 0x01, 0x0c }));
            var handler = new SocketsHttpHandler(); Configure(handler); handler.UseCookies = false; handler.Credentials = null; using var control = new HttpClient(handler); using var state = JsonDocument.Parse(await control.GetStringAsync("https://mmg.whatsapp.net/state"));
            foreach (var request in state.RootElement.GetProperty("requests").EnumerateArray())
            {
                if (request.GetProperty("boundary").GetString() == "cdn") { ResourceTests.True(!request.GetProperty("authorization").GetBoolean()); ResourceTests.True(!request.GetProperty("cookie").GetBoolean()); ResourceTests.True(!request.GetProperty("path").GetString()!.Contains("/escape", StringComparison.Ordinal)); }
                else { ResourceTests.Equal(request.GetProperty("version").GetString(), "2026-10-14"); if (request.GetProperty("path").GetString()!.Contains("upload-grants", StringComparison.Ordinal)) ResourceTests.True(!Encoding.UTF8.GetString(Convert.FromBase64String(request.GetProperty("body").GetString()!)).Contains("encryptedLength", StringComparison.Ordinal)); }
            }
            ResourceTests.True(state.RootElement.GetProperty("states").EnumerateArray().Where(s => s.GetProperty("name").GetString() == "changed").All(s => s.GetProperty("finals").GetInt32() == 0)); ResourceTests.Equal(state.RootElement.GetProperty("states").EnumerateArray().First(s => s.GetProperty("name").GetString() == "multipart").GetProperty("finals").GetInt32(), 1);
            Console.WriteLine("PASS verified compressed history, full-width protobuf, native ciphertext relay/direct, resume/grant refresh, multipart EOF/source-change gate and credential confinement");
        }
        finally { if (!server.HasExited) server.Kill(entireProcessTree: true); await server.WaitForExitAsync(); if (directory is not null) Directory.Delete(directory, true); }
    }
}
