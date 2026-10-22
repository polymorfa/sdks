using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class MediaStreamTests
{
    public static async Task RunAsync(string root)
    {
        using var vectors = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "contracts/fixtures/whatsapp-media.json")));
        foreach (var vector in vectors.RootElement.GetProperty("fixtures").EnumerateArray())
        {
            byte[] Hex(string field) => Convert.FromHexString(vector.GetProperty(field).GetString()!);
            var keys = WhatsAppMedia.DeriveKeys(Hex("mediaKey"), vector.GetProperty("kind").GetString()!);
            var encrypted = Hex("encrypted"); var plaintext = Hex("plaintext");
            foreach (var mode in Enum.GetValues<MediaVerifyMode>())
                foreach (var fragment in new[] { 1, 2, 7, 15, 16, 17, 26, 37, 4096 })
                {
                    var options = new WhatsAppMediaOptions { Verify = mode };
                    using var backend = new WhatsAppMediaDecryptor(keys, Hex("fileSha256"), Hex("fileEncSha256"), options);
                    using var output = new MemoryStream();
                    for (var offset = 0; offset < encrypted.Length; offset += fragment)
                    {
                        var chunk = backend.Update(encrypted.AsSpan(offset, Math.Min(fragment, encrypted.Length - offset)));
                        if (mode == MediaVerifyMode.BeforeRelease && chunk.Length != 0) throw new Exception("Default backend released plaintext before verification.");
                        output.Write(chunk);
                    }
                    output.Write(backend.Complete()); Bytes(output.ToArray(), plaintext);
                    var source = new Fragmented(encrypted, fragment);
                    await using var body = await WhatsAppMedia.DecryptStreamAsync(source, keys, Hex("fileSha256"), Hex("fileEncSha256"), options);
                    Bytes(await ReadAll(body), plaintext); True(source.Disposed);
                }
            foreach (var mode in Enum.GetValues<MediaVerifyMode>())
            {
                var corrupt = encrypted.ToArray(); corrupt[^1] ^= 1;
                await Failure(corrupt, keys, mode, "media_enc_hash_mismatch", enc: Hex("fileEncSha256"));
                await Failure(corrupt, keys, mode, "media_mac_mismatch");
                await Failure(encrypted, keys, mode, "media_hash_mismatch", plain: new byte[32]);
                await Failure(encrypted[..^1], keys, mode, "media_invalid_ciphertext");
                await Failure(new byte[10], keys, mode, "media_too_short");
                await Failure(encrypted, keys, mode, "media_too_large", max: 1);
                // Invalid padding with a valid independently constructed MAC.
                using var aes = Aes.Create(); aes.Key = keys.CipherKey;
                var invalidBlock = new byte[16]; // final byte zero is invalid PKCS7
                var cipher = aes.EncryptCbc(invalidBlock, keys.Iv, PaddingMode.None);
                var tag = HMACSHA256.HashData(keys.MacKey, keys.Iv.Concat(cipher).ToArray())[..10];
                await Failure(cipher.Concat(tag).ToArray(), keys, mode, "media_invalid_padding");
                using var lengthGuard = new WhatsAppMediaDecryptor(keys, options: new() { Verify = mode }, fileLength: 0);
                try { lengthGuard.Update(encrypted); lengthGuard.Complete(); throw new Exception("Declared length bound ignored."); } catch (PolymorfaMediaIntegrityException e) when (e.Code == "media_too_large") { }
            }
            var closed = new Fragmented(encrypted, 1);
            var unopened = await WhatsAppMedia.DecryptStreamAsync(closed, keys); await unopened.DisposeAsync(); True(closed.Disposed);
            var leave = new Fragmented(encrypted, 1); await using (var body = await WhatsAppMedia.DecryptStreamAsync(leave, keys, leaveOpen: true)) await ReadAll(body); True(!leave.Disposed); leave.Dispose();
            Console.WriteLine($"PASS media stream vector {vector.GetProperty("kind").GetString()} in both verification modes and nine fragment sizes");
        }
        var first = vectors.RootElement.GetProperty("fixtures")[0];
        byte[] FirstHex(string field) => Convert.FromHexString(first.GetProperty(field).GetString()!);
        var firstKeys = WhatsAppMedia.DeriveKeys(FirstHex("mediaKey"), "image");
        using (var cancellation = new CancellationTokenSource())
        {
            var pending = new Pending(); await using var body = await WhatsAppMedia.DecryptStreamAsync(pending, firstKeys, options: new() { CancellationToken = cancellation.Token });
            var read = body.ReadAsync(new byte[32]).AsTask(); await pending.Started.Task.WaitAsync(TimeSpan.FromSeconds(2)); cancellation.Cancel();
            try { await read; throw new Exception("Pending read ignored cancellation."); } catch (PolymorfaCancelledException) { }
            True(pending.Disposed);
        }
        var timeoutSource = new Pending(); await using (var body = await WhatsAppMedia.DecryptStreamAsync(timeoutSource, firstKeys, options: new() { Timeout = TimeSpan.FromMilliseconds(25) }))
        { try { await ReadAll(body); throw new Exception("Pending read ignored timeout."); } catch (PolymorfaTimeoutException) { } }
        True(timeoutSource.Disposed);
        var disposedPending = new Pending(); var disposedBody = await WhatsAppMedia.DecryptStreamAsync(disposedPending, firstKeys); var disposedRead = disposedBody.ReadAsync(new byte[16]).AsTask(); await disposedPending.Started.Task; await disposedBody.DisposeAsync(); try { await disposedRead; throw new Exception("Disposed body continued reading."); } catch (PolymorfaCancelledException) { }
        True(disposedPending.Disposed);
        var io = new Broken(); await using (var body = await WhatsAppMedia.DecryptStreamAsync(io, firstKeys)) { try { await ReadAll(body); throw new Exception("IO failure ignored."); } catch (PolymorfaConnectionException e) { True(!e.Message.Contains("private")); } }
        True(io.Disposed);
        await NativeCdn(root, vectors.RootElement.GetProperty("fixtures"));
        Console.WriteLine("PASS media streaming limits, MAC/hashes/padding, cancellation, timeout, disposal and trusted HTTPS CDN ownership");
    }
    private static async Task Failure(byte[] encrypted, WhatsAppMediaKeys keys, MediaVerifyMode mode, string code, byte[]? plain = null, byte[]? enc = null, long max = 256 * 1024 * 1024)
    {
        var source = new Fragmented(encrypted, 7); await using var body = await WhatsAppMedia.DecryptStreamAsync(source, keys, plain, enc, new() { Verify = mode, MaxBytes = max });
        var emitted = 0; var buffer = new byte[5];
        try { while (true) { var n = await body.ReadAsync(buffer); if (n == 0) break; emitted += n; } throw new Exception($"Expected {code}."); }
        catch (PolymorfaMediaIntegrityException e) when (e.Code == code) { if (mode == MediaVerifyMode.BeforeRelease) True(emitted == 0); if (mode == MediaVerifyMode.Streaming && code == "media_hash_mismatch") True(emitted > 0); }
        True(source.Disposed);
    }
    private static async Task NativeCdn(string root, JsonElement vectors)
    {
        var start = new ProcessStartInfo(Environment.GetEnvironmentVariable("SDK_NODE") ?? "node") { WorkingDirectory = root, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        start.ArgumentList.Add("packages/dotnet/tests/Polymorfa.Sdk.Tests/media-cdn-server.mjs"); start.ArgumentList.Add("contracts/fixtures/whatsapp-media.json");
        using var server = Process.Start(start) ?? throw new Exception("Cannot start HTTPS peer."); string? directory = null;
        try
        {
            using var ready = JsonDocument.Parse(await server.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(15)) ?? throw new Exception("HTTPS peer exited."));
            var port = ready.RootElement.GetProperty("port").GetInt32(); directory = ready.RootElement.GetProperty("directory").GetString()!;
            using var authority = X509Certificate2.CreateFromPem(System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(ready.RootElement.GetProperty("certificate").GetString()!)));
            void Configure(SocketsHttpHandler handler)
            {
                handler.UseProxy = false;
                handler.AllowAutoRedirect = true; handler.UseCookies = true; handler.CookieContainer.Add(new Uri("https://mmg.whatsapp.net"), new Cookie("fixture", "synthetic"));
                handler.Credentials = new NetworkCredential("synthetic", "synthetic");
                handler.ConnectCallback = async (_, token) => { var socket = new Socket(SocketType.Stream, ProtocolType.Tcp); try { await socket.ConnectAsync(new IPEndPoint(IPAddress.Loopback, port), token); return new NetworkStream(socket, ownsSocket: true); } catch { socket.Dispose(); throw; } };
                handler.SslOptions.CertificateChainPolicy = new X509ChainPolicy { TrustMode = X509ChainTrustMode.CustomRootTrust, RevocationMode = X509RevocationMode.NoCheck };
                handler.SslOptions.CertificateChainPolicy.CustomTrustStore.Add(authority);
            }
            var options = new WhatsAppMediaOptions { ConfigureHttpHandler = Configure };
            var first = vectors[0]; var descriptor = WhatsAppMedia.Decode(first.GetProperty("descriptor").GetString()!, "image");
            Bytes((await WhatsAppMedia.DownloadAsync(descriptor, options)).Bytes, Convert.FromHexString(first.GetProperty("plaintext").GetString()!));
            var untrusted = options with { ConfigureHttpHandler = handler => { Configure(handler); handler.SslOptions.CertificateChainPolicy = null; } };
            try { await using var rejected = await WhatsAppMedia.DownloadStreamAsync(descriptor with { DirectPath = null }, untrusted); throw new Exception("Untrusted TLS was accepted."); } catch (PolymorfaConnectionException) { }
            foreach (var vector in vectors.EnumerateArray())
            {
                var kind = vector.GetProperty("kind").GetString()!;
                var message = new LinkedDeviceMessagePayload("message", new(null, null), new("conversation"), false, 0, "", false, kind, Media: vector.GetProperty("descriptor").GetString()!);
                using var messaging = new MessagingClient(Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"));
                await using var download = await messaging.Media.DownloadFromWhatsAppStreamAsync(message, options);
                var result = await download.ToBufferedAsync(); Bytes(result.Bytes, Convert.FromHexString(vector.GetProperty("plaintext").GetString()!));
            }
            await using (var redirect = await WhatsAppMedia.DownloadStreamAsync(descriptor with { Url = "https://mmg.whatsapp.net/redirect" }, options with { Verify = MediaVerifyMode.Streaming })) Bytes((await redirect.ToBufferedAsync()).Bytes, Convert.FromHexString(first.GetProperty("plaintext").GetString()!));
            try { await using var escaped = await WhatsAppMedia.DownloadStreamAsync(descriptor with { Url = "https://mmg.whatsapp.net/escape" }, options); throw new Exception("External redirect followed."); } catch (PolymorfaMediaIntegrityException e) { True(!e.Message.Contains("secret")); }
            try { await using var huge = await WhatsAppMedia.DownloadStreamAsync(descriptor with { Url = "https://mmg.whatsapp.net/image.enc?oversize" }, options); throw new Exception("Oversize ContentLength accepted."); } catch (PolymorfaMediaIntegrityException e) when (e.Code == "media_too_large") { }
            await using (var stall = await WhatsAppMedia.DownloadStreamAsync(descriptor with { Url = "https://mmg.whatsapp.net/stall", DirectPath = null }, options)) { }
            using (var cancelled = new CancellationTokenSource())
            {
                await using var stalled = await WhatsAppMedia.DownloadStreamAsync(descriptor with { Url = "https://mmg.whatsapp.net/stall", DirectPath = null }, options with { CancellationToken = cancelled.Token });
                var pending = ReadAll(stalled.Body); cancelled.CancelAfter(25);
                try { await pending; throw new Exception("Owned CDN body ignored cancellation."); } catch (PolymorfaCancelledException) { }
            }
            var artifacts = Path.Combine(directory, "output"); Directory.CreateDirectory(artifacts); var target = Path.Combine(artifacts, "verified");
            var legacyFile = Path.Combine(artifacts, "legacy"); await WhatsAppMedia.DownloadToFileAsync(descriptor, legacyFile, options); Bytes(File.ReadAllBytes(legacyFile), Convert.FromHexString(first.GetProperty("plaintext").GetString()!)); File.Delete(legacyFile);
            await using (var file = await WhatsAppMedia.DownloadStreamAsync(descriptor, options with { Verify = MediaVerifyMode.Streaming })) await file.WriteToFileAsync(target);
            Bytes(File.ReadAllBytes(target), Convert.FromHexString(first.GetProperty("plaintext").GetString()!));
            await using (var bad = await WhatsAppMedia.DownloadStreamAsync(descriptor with { FileSha256 = new byte[32] }, options with { Verify = MediaVerifyMode.Streaming }))
            { try { await bad.WriteToFileAsync(target, overwrite: true); throw new Exception("Bad stream promoted."); } catch (PolymorfaMediaIntegrityException e) when (e.Code == "media_hash_mismatch") { } }
            True(Directory.GetFiles(artifacts).Length == 1); Bytes(File.ReadAllBytes(target), Convert.FromHexString(first.GetProperty("plaintext").GetString()!));
            var handler = new SocketsHttpHandler(); Configure(handler); using var control = new HttpClient(handler);
            using var state = JsonDocument.Parse(await control.GetStringAsync("https://mmg.whatsapp.net/state"));
            True(state.RootElement.GetProperty("abandoned").GetInt32() > 0);
            var requests = state.RootElement.GetProperty("requests"); True(requests.GetArrayLength() >= 10);
            foreach (var request in requests.EnumerateArray()) { True(!request.GetProperty("authorization").GetBoolean()); True(!request.GetProperty("cookie").GetBoolean()); True(request.GetProperty("origin").GetString() == "https://web.whatsapp.com"); True(request.GetProperty("referer").GetString() == "https://web.whatsapp.com/"); }
            True(requests.EnumerateArray().Any(request => request.GetProperty("path").GetString() == "/image.enc?signature=fixture"));
        }
        finally { if (!server.HasExited) server.Kill(entireProcessTree: true); await server.WaitForExitAsync(); if (directory is not null) Directory.Delete(directory, true); }
    }
    private static async Task<byte[]> ReadAll(Stream body) { using var output = new MemoryStream(); await body.CopyToAsync(output); return output.ToArray(); }
    private static void Bytes(byte[] actual, byte[] expected) => True(actual.AsSpan().SequenceEqual(expected));
    private static void True(bool value) { if (!value) throw new Exception("Media stream native proof failed."); }
    private class Fragmented(byte[] bytes, int fragment) : MemoryStream(bytes, false)
    {
        public bool Disposed { get; private set; }
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => base.ReadAsync(buffer[..Math.Min(buffer.Length, fragment)], cancellationToken);
        protected override void Dispose(bool disposing) { Disposed = true; base.Dispose(disposing); }
    }
    private class Pending : MemoryStream
    {
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously); public bool Disposed { get; private set; }
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) { Started.TrySetResult(); await Task.Delay(Timeout.Infinite, cancellationToken); return 0; }
        protected override void Dispose(bool disposing) { Disposed = true; base.Dispose(disposing); }
    }
    private sealed class Broken : Pending { public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => throw new IOException("private media URL"); }
}
