using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class StrictHistoryDownloadTests
{
    internal static async Task RunAsync()
    {
        var start = new ProcessStartInfo(Environment.GetEnvironmentVariable("SDK_NODE") ?? "node") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        start.ArgumentList.Add(StrictHistoryTests.Fixture("strict-history-server.mjs"));
        using var server = Process.Start(start) ?? throw new Exception("Synthetic CDN unavailable"); string? directory = null;
        try
        {
            using var ready = JsonDocument.Parse(await server.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(15)) ?? throw new Exception("Synthetic CDN exited"));
            var value = ready.RootElement; directory = value.GetProperty("directory").GetString(); var port = value.GetProperty("port").GetInt32();
            using var authority = X509Certificate2.CreateFromPem(Encoding.UTF8.GetString(Convert.FromBase64String(value.GetProperty("certificate").GetString()!)));
            void Configure(SocketsHttpHandler handler)
            {
                handler.UseProxy = false; handler.AllowAutoRedirect = true; handler.UseCookies = true;
                handler.CookieContainer.Add(new Uri("https://mmg.whatsapp.net"), new Cookie("fixture", "synthetic"));
                handler.Credentials = new NetworkCredential("synthetic", "synthetic");
                handler.ConnectCallback = async (_, token) =>
                {
                    var socket = new Socket(SocketType.Stream, ProtocolType.Tcp);
                    try { await socket.ConnectAsync(new IPEndPoint(IPAddress.Loopback, port), token); return new NetworkStream(socket, ownsSocket: true); }
                    catch { socket.Dispose(); throw; }
                };
                handler.SslOptions.CertificateChainPolicy = new X509ChainPolicy { TrustMode = X509ChainTrustMode.CustomRootTrust, RevocationMode = X509RevocationMode.NoCheck };
                handler.SslOptions.CertificateChainPolicy.CustomTrustStore.Add(authority);
            }
            HistoryChunkDescriptor Descriptor(string name)
            {
                var d = value.GetProperty("descriptors").GetProperty(name);
                byte[] Field(string key) => Convert.FromHexString(d.GetProperty(key).GetString()!);
                return new(d.GetProperty("directPath").GetString()!, Field("mediaKey"), Field("fileSha256"), Field("fileEncSha256"), d.GetProperty("fileLength").GetInt64());
            }
            var options = new HistoryChunkOptions { Media = new() { ConfigureHttpHandler = Configure } };
            foreach (var format in new[] { "gzip", "zlib", "raw" })
            {
                var chunk = await HistoryChunks.DownloadAsync(Descriptor(format), options);
                StrictHistoryTests.Check(chunk.SyncType == 3 && chunk.Conversations[0].LastMessageTimestamp == ulong.MaxValue, format + " authenticated direct control");
            }
            foreach (var malformed in new[] { "tail", "concat", "checksum" }) await StrictHistoryTests.ErrorAsync(() => HistoryChunks.DownloadAsync(Descriptor(malformed), options), "media_invalid_ciphertext", "authenticated " + malformed);
            await StrictHistoryTests.ErrorAsync(() => HistoryChunks.DownloadAsync(Descriptor("gzip") with { DirectPath = "/tampered.enc" }, options with { MaxInflatedBytes = 0 }), "media_enc_hash_mismatch", "authentication precedes invalid inflate options");
            await StrictHistoryTests.ErrorAsync(() => HistoryChunks.DownloadAsync(Descriptor("gzip"), options with { Media = options.Media with { MaxBytes = 1 } }), "media_too_large", "compressed download cap");
            using var handler = new SocketsHttpHandler(); Configure(handler); using var control = new HttpClient(handler);
            using var cancellation = new CancellationTokenSource();
            var pending = HistoryChunks.DownloadAsync(Descriptor("gate"), options with { Media = options.Media with { CancellationToken = cancellation.Token } });
            var deadline = DateTime.UtcNow.AddSeconds(10);
            while (true)
            {
                using var state = JsonDocument.Parse(await control.GetStringAsync("https://mmg.whatsapp.net/state"));
                if (state.RootElement.GetProperty("waiting").GetInt32() > 0) break;
                if (DateTime.UtcNow >= deadline) throw new Exception("CDN did not withhold authenticated EOF");
                await Task.Delay(5);
            }
            StrictHistoryTests.Check(!pending.IsCompleted, "download waits for authenticated EOF"); cancellation.Cancel();
            await StrictHistoryTests.ErrorAsync(() => pending, "request_cancelled", "network cancellation before authenticated EOF");
            using var final = JsonDocument.Parse(await control.GetStringAsync("https://mmg.whatsapp.net/state"));
            foreach (var request in final.RootElement.GetProperty("requests").EnumerateArray())
            {
                StrictHistoryTests.Check(!request.GetProperty("authorization").GetBoolean() && !request.GetProperty("cookie").GetBoolean() && !request.GetProperty("version").GetBoolean(), "CDN receives no bearer/cookie/API version");
                StrictHistoryTests.Check(request.GetProperty("mms").GetString() == "md-msg-hist", "history media type");
            }
            Console.WriteLine("PASS independent Node encryption/TLS CDN: three formats, strict refusals, tamper/auth precedence, compressed cap, gated cancellation and credential isolation");
        }
        finally
        {
            if (!server.HasExited) server.Kill(entireProcessTree: true); await server.WaitForExitAsync();
            if (directory is not null) Directory.Delete(directory, recursive: true);
        }
    }
}
