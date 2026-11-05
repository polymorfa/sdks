using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using Polymorfa.Sdk;

internal static class VoiceStreamingTests
{
    private const string Asset = """{"id":"asset","projectId":"project","name":"Greeting","source":"upload","status":"ready","inUseCount":0,"revision":1,"createdAt":"2026-10-14","updatedAt":"2026-10-14"}""";
    public static async Task RunAsync()
    {
        using var certificate = VoiceTests.FixtureCertificate();
        foreach (var scenario in new[] { "streaming", "short", "long", "read_failure", "timeout", "cancel", "redirect" }) await Exercise(scenario, certificate);
        using var invalid = new OrganizationClient(Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"), new() { BaseUrl = new("http://127.0.0.1:1") });
        foreach (var input in new[] { new CreateVoiceAudioUploadInput("Greeting", "text/plain", 1), new("Greeting", "audio/ogg", 16777217), new("Greeting", "audio/ogg", 0) })
            try { await invalid.Voice.Audio.UploadAsync(input, new MemoryStream([1]), "project"); throw new Exception("Invalid upload admitted"); } catch (PolymorfaValidationException) { }
        Console.WriteLine("PASS genuine native TLS voice upload streaming, progress before EOF, exact length, stream ownership, bounded failure/cancel/timeout, no retry or complete on failure, redirect and credential isolation");
    }
    private static async Task Exercise(string scenario, X509Certificate2 certificate)
    {
        var admitted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); var firstBytes = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var api = new WireFixture { BeforeResponse = () => { admitted.TrySetResult(); return Task.CompletedTask; } }; using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        var url = $"https://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/upload?signature=fixture_private_url";
        var length = scenario == "streaming" ? 131072 : 3;
        using var cancellation = new CancellationTokenSource();
        using var body = new Producer(scenario, admitted.Task, firstBytes.Task, length);
        var servingApi = ServeApi(); var servingStorage = ServeStorage();
        using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"), new()
        {
            BaseUrl = api.Url,
            StorageTransportHandlerFactory = () => new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false, SslOptions = new SslClientAuthenticationOptions { RemoteCertificateValidationCallback = (_, peer, _, _) => peer?.GetCertHashString() == certificate.GetCertHashString() } }
        });
        var options = new RequestOptions { IdempotencyKey = "create-only", MaxNetworkRetries = 3, Headers = new Dictionary<string, string> { ["x-api-private"] = "fixture" }, Timeout = TimeSpan.FromSeconds(scenario == "timeout" ? 1 : 5), CancellationToken = cancellation.Token };
        if (scenario == "cancel") cancellation.CancelAfter(TimeSpan.FromMilliseconds(500));
        try
        {
            var result = await client.Voice.Audio.UploadAsync(new("Greeting", "audio/ogg", length), body, "project", options);
            if (scenario != "streaming") throw new Exception("Failed input completed"); ResourceTests.Equal(result.Data.Status, "ready"); ResourceTests.True(body.SecondReadSawStorageProgress);
        }
        catch (PolymorfaValidationException) when (scenario is "short" or "long") { }
        catch (PolymorfaConnectionException error) when (scenario == "read_failure") { ResourceTests.True(!error.ToString().Contains("fixture_private_url", StringComparison.Ordinal)); }
        catch (PolymorfaTimeoutException) when (scenario == "timeout") { }
        catch (PolymorfaCancelledException) when (scenario == "cancel") { }
        catch (PolymorfaException error) when (scenario == "redirect") { ResourceTests.Equal(error.Code, "voice_upload_failed"); ResourceTests.True(!error.ToString().Contains("fixture_private_url", StringComparison.Ordinal)); }
        ResourceTests.True(!body.Disposed);
        await Task.WhenAll(servingApi, servingStorage).WaitAsync(TimeSpan.FromSeconds(8));
        ResourceTests.True(!api.Pending);
        async Task ServeApi()
        {
            await api.ServeAsync("POST", "/platform/voice/audio", "{\"name\":\"Greeting\",\"contentType\":\"audio/ogg\",\"sizeBytes\":" + length + ",\"projectId\":\"project\"}", "{\"data\":{\"asset\":" + Asset + ",\"upload\":{\"url\":\"" + url + "\",\"method\":\"POST\",\"headers\":{\"content-type\":\"audio/ogg\",\"x-storage\":\"fixture\"},\"maxBytes\":16777216,\"expiresAt\":\"2026-10-14\"}}}", expectedHeaders: new Dictionary<string, string> { ["idempotency-key"] = "create-only" });
            if (scenario == "streaming") await api.ServeAsync("POST", "/platform/voice/audio/asset/complete", null, "{\"data\":" + Asset + "}", absentHeader: "idempotency-key");
        }
        async Task ServeStorage()
        {
            using var accepted = await listener.AcceptTcpClientAsync(); await using var tls = new SslStream(accepted.GetStream()); await tls.AuthenticateAsServerAsync(new SslServerAuthenticationOptions { ServerCertificate = certificate });
            var headerBytes = new List<byte>(); var one = new byte[1]; while (true) { if (await tls.ReadAsync(one) == 0) { if (scenario is "short" or "long" or "read_failure" or "timeout" or "cancel") return; throw new Exception("Missing storage headers in " + scenario); } headerBytes.Add(one[0]); if (headerBytes.Count >= 4 && headerBytes[^4] == 13 && headerBytes[^3] == 10 && headerBytes[^2] == 13 && headerBytes[^1] == 10) break; }
            var headers = Encoding.ASCII.GetString(headerBytes.ToArray()).ToLowerInvariant(); ResourceTests.True(headers.StartsWith("post /upload?signature=fixture_private_url http/1.1\r\n", StringComparison.Ordinal));
            foreach (var forbidden in new[] { "authorization:", "cookie:", "idempotency-key:", "x-api-private:", "polymorfa-version:", "transfer-encoding:" }) ResourceTests.True(!headers.Contains(forbidden, StringComparison.Ordinal));
            ResourceTests.True(headers.Contains($"content-length: {length}\r\n", StringComparison.Ordinal)); ResourceTests.True(headers.Contains("content-type: audio/ogg\r\n", StringComparison.Ordinal));
            try
            {
                var first = new byte[Math.Min(length, 16)]; await tls.ReadExactlyAsync(first); firstBytes.TrySetResult();
                var rest = new byte[length - first.Length]; await tls.ReadExactlyAsync(rest);
                if (scenario is "timeout" or "cancel") return;
                var response = scenario == "redirect" ? "HTTP/1.1 302 Found\r\nlocation: https://127.0.0.1:1/leak?signature=fixture_private_url\r\n" : "HTTP/1.1 204 No Content\r\n";
                await tls.WriteAsync(Encoding.ASCII.GetBytes(response + "content-length: 0\r\nconnection: close\r\n\r\n"));
            }
            catch (Exception error) when ((scenario is "short" or "long" or "read_failure" or "timeout" or "cancel") && error is IOException) { }
            ResourceTests.True(!listener.Pending());
        }
    }
    private sealed class Producer(string scenario, Task admitted, Task storageProgress, int length) : Stream
    {
        private int position;
        public bool Disposed { get; private set; }
        public bool SecondReadSawStorageProgress { get; private set; }
        public override bool CanRead => true; public override bool CanSeek => false; public override bool CanWrite => false; public override long Length => throw new NotSupportedException(); public override long Position { get => position; set => throw new NotSupportedException(); }
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default)
        {
            ResourceTests.True(admitted.IsCompleted);
            if (scenario is "timeout" or "cancel") { await Task.Delay(Timeout.Infinite, token); return 0; }
            if (scenario == "read_failure") throw new IOException("fixture source failure");
            if (scenario == "streaming" && position > 0 && position < length) { await storageProgress.WaitAsync(token); SecondReadSawStorageProgress = true; }
            var actual = scenario == "short" ? length - 1 : scenario == "long" ? length + 1 : length;
            var count = Math.Min(buffer.Length, actual - position); if (count <= 0) return 0;
            buffer.Span[..count].Fill(7); position += count; return count;
        }
        protected override void Dispose(bool disposing) { Disposed = true; base.Dispose(disposing); }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException(); public override void Flush() => throw new NotSupportedException(); public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException(); public override void SetLength(long value) => throw new NotSupportedException(); public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
