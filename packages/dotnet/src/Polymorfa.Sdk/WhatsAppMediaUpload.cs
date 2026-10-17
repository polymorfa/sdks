using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading.Channels;

namespace Polymorfa.Sdk;

public sealed record WhatsAppDirectUploadOptions
{
    public int MaxAttempts { get; init; } = 3;
    public long DocumentPartSize { get; init; } = 50 * 1024 * 1024;
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(30);
    public CancellationToken CancellationToken { get; init; }
    public Action<SocketsHttpHandler>? ConfigureHttpHandler { get; init; }
}
public sealed record WhatsAppMediaUploadResult(EncryptedWhatsAppMediaInfo Info, WhatsAppUploadLocation Location, string Egress)
{
    public override string ToString() => "WhatsAppMediaUploadResult(redacted)";
}
/// <summary>A prepared body contains ciphertext only. Factories reopen the same plaintext, with bounded streaming encryption.</summary>
public sealed class PreparedWhatsAppUpload
{
    public EncryptedWhatsAppMediaInfo Info { get; }
    private readonly byte[]? ciphertext;
    private readonly Func<CancellationToken, Task<Stream>>? factory;
    private readonly WhatsAppMediaEncryptionOptions options;
    internal PreparedWhatsAppUpload(EncryptedWhatsAppMediaInfo info, byte[]? ciphertext, Func<CancellationToken, Task<Stream>>? factory, WhatsAppMediaEncryptionOptions options) { Info = info; this.ciphertext = ciphertext; this.factory = factory; this.options = options; }
    public async Task<Stream> OpenAsync(long offset = 0, CancellationToken cancellationToken = default)
    {
        if (offset < 0 || offset > Info.EncryptedLength) throw new PolymorfaConfigurationException("Invalid encrypted offset.");
        if (ciphertext is not null) return new MemoryStream(ciphertext, (int)offset, ciphertext.Length - (int)offset, writable: false);
        var source = await factory!(cancellationToken).ConfigureAwait(false); var body = new VerifiedCiphertextStream(source, options with { CancellationToken = cancellationToken }, Info);
        try { var remaining = offset; var buffer = new byte[65536]; while (remaining > 0) { var count = await body.ReadAsync(buffer.AsMemory(0, (int)Math.Min(remaining, buffer.Length)), cancellationToken).ConfigureAwait(false); if (count == 0) throw Changed(); remaining -= count; } return body; }
        catch { await body.DisposeAsync().ConfigureAwait(false); throw; }
    }
    internal static bool HasChangedSource(Exception error) { for (var depth = 0; depth < 32; depth++) { if (error is PolymorfaMediaIntegrityException { Code: "media_enc_hash_mismatch" }) return true; if (error.InnerException is not { } inner) return false; error = inner; } return false; }
    internal static PolymorfaMediaIntegrityException Changed() => WhatsAppMedia.Integrity("The media source changed between hashing and upload.", "media_enc_hash_mismatch");
    private sealed class VerifiedCiphertextStream : Stream
    {
        private readonly Channel<byte[]> channel = System.Threading.Channels.Channel.CreateBounded<byte[]>(new BoundedChannelOptions(1) { SingleReader = true, SingleWriter = true });
        private readonly CancellationTokenSource stop;
        private byte[]? current; private int position;
        internal VerifiedCiphertextStream(Stream source, WhatsAppMediaEncryptionOptions options, EncryptedWhatsAppMediaInfo expected)
        {
            stop = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken);
            _ = Produce();
            async Task Produce()
            {
                try
                {
                    await using (source.ConfigureAwait(false))
                    {
                        using var sink = new CiphertextSink(channel.Writer, stop.Token);
                        var actual = await WhatsAppMedia.EncryptAsync(source, sink, options with { CancellationToken = stop.Token }).ConfigureAwait(false);
                        if (actual.EncryptedLength != expected.EncryptedLength || !CryptographicOperations.FixedTimeEquals(actual.FileEncSha256, expected.FileEncSha256)) throw Changed();
                        await sink.CompleteAsync().ConfigureAwait(false); channel.Writer.TryComplete();
                    }
                }
                catch (Exception error) { channel.Writer.TryComplete(error is PolymorfaException ? error : new PolymorfaConnectionException("Cannot read the media source.")); }
                finally { stop.Dispose(); }
            }
        }
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (buffer.Length == 0) return 0;
            try
            {
                if (current is null || position == current.Length) { current = null; position = 0; if (!await channel.Reader.WaitToReadAsync(cancellationToken).ConfigureAwait(false)) return 0; current = await channel.Reader.ReadAsync(cancellationToken).ConfigureAwait(false); }
                var count = Math.Min(buffer.Length, current.Length - position); current.AsMemory(position, count).CopyTo(buffer); position += count; return count;
            }
            catch (OperationCanceledException) { throw new PolymorfaCancelledException(); }
            catch (ChannelClosedException error) when (error.InnerException is PolymorfaException cause) { throw cause; }
        }
        protected override void Dispose(bool disposing) { if (disposing) { try { stop.Cancel(); } catch (ObjectDisposedException) { } } base.Dispose(disposing); }
        public override bool CanRead => true; public override bool CanSeek => false; public override bool CanWrite => false; public override long Length => throw new NotSupportedException(); public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) => ReadAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult(); public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException(); public override void SetLength(long value) => throw new NotSupportedException(); public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
    private sealed class CiphertextSink(ChannelWriter<byte[]> writer, CancellationToken cancellation) : Stream
    {
        private byte[]? pending;
        public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default) { if (buffer.Length == 0) return; if (pending is not null) await writer.WriteAsync(pending, cancellation).ConfigureAwait(false); pending = buffer.ToArray(); }
        internal async Task CompleteAsync() { if (pending is not null) await writer.WriteAsync(pending, cancellation).ConfigureAwait(false); pending = null; }
        public override bool CanWrite => true; public override bool CanRead => false; public override bool CanSeek => false; public override long Length => throw new NotSupportedException(); public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException(); public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException(); public override void SetLength(long value) => throw new NotSupportedException(); public override void Write(byte[] buffer, int offset, int count) => WriteAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
    }
}
public static partial class WhatsAppMedia
{
    /// <summary>Single-use sources buffer bounded ciphertext. The caller retains the stream.</summary>
    public static async Task<PreparedWhatsAppUpload> PrepareUploadAsync(Stream source, WhatsAppMediaEncryptionOptions options)
    {
        using var output = new MemoryStream(); var info = await EncryptAsync(source, output, options).ConfigureAwait(false); return new(info, output.ToArray(), null, options);
    }
    /// <summary>Each factory result is owned and closed by the SDK. Every open must return the same plaintext.</summary>
    public static async Task<PreparedWhatsAppUpload> PrepareUploadAsync(Func<CancellationToken, Task<Stream>> open, WhatsAppMediaEncryptionOptions options)
    {
        var settings = options with { MediaKey = options.MediaKey?.ToArray() ?? GenerateMediaKey() }; await using var source = await open(settings.CancellationToken).ConfigureAwait(false);
        var info = await EncryptAsync(source, Stream.Null, settings).ConfigureAwait(false); return new(info, null, open, settings);
    }
    public static Task<PreparedWhatsAppUpload> PrepareUploadAsync(ReadOnlyMemory<byte> bytes, WhatsAppMediaEncryptionOptions options)
    {
        var copy = bytes.ToArray(); return PrepareUploadAsync(_ => Task.FromResult<Stream>(new MemoryStream(copy, writable: false)), options);
    }
}
public sealed partial class WhatsAppMediaResource
{
    public async Task<WhatsAppMediaUploadResult> UploadRelayAsync(string session, PreparedWhatsAppUpload prepared, RequestOptions? options = null)
    {
        await using var body = await prepared.OpenAsync(cancellationToken: options?.CancellationToken ?? default).ConfigureAwait(false);
        var location = await RelayUploadAsync(session, prepared.Info.MediaType, prepared.Info.FileEncSha256, body, prepared.Info.EncryptedLength, options).ConfigureAwait(false); return new(prepared.Info, location, "relay");
    }
    public async Task<WhatsAppMediaUploadResult> UploadDirectAsync(string session, PreparedWhatsAppUpload prepared, WhatsAppDirectUploadOptions? direct = null, RequestOptions? requestOptions = null)
    {
        http.Credential.RequireServer();
        Session(session);
        direct ??= new(); if (direct.MaxAttempts < 1 || direct.DocumentPartSize < 1 || direct.Timeout <= TimeSpan.Zero) throw new PolymorfaConfigurationException("Invalid direct upload options.");
        var handler = new SocketsHttpHandler(); direct.ConfigureHttpHandler?.Invoke(handler); handler.AllowAutoRedirect = false; handler.UseCookies = false; handler.Credentials = null; using var client = new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
        var request = (requestOptions ?? new()) with { CancellationToken = direct.CancellationToken }; var grant = await CreateUploadGrantAsync(session, prepared.Info.MediaType, prepared.Info.FileEncSha256, request).ConfigureAwait(false);
        Uri Url(params (string Key, string Value)[] query)
        {
            var approved = grant.UploadUrl; var token = Convert.ToBase64String(prepared.Info.FileEncSha256).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            if (!WhatsAppMedia.IsMediaUrl(approved.AbsoluteUri) || !grant.Hosts.Contains(approved.Host) || approved.AbsolutePath != UploadPath(prepared.Info.MediaType) + "/" + token) throw InvalidResponse();
            var builder = new UriBuilder(approved); var pairs = builder.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries).Where(pair => !query.Any(q => Uri.UnescapeDataString(pair.Split('=', 2)[0]) == q.Key)).ToList(); pairs.AddRange(query.Select(q => Uri.EscapeDataString(q.Key) + "=" + Uri.EscapeDataString(q.Value))); builder.Query = string.Join('&', pairs); return builder.Uri;
        }
        async Task<JsonElement?> Post(Uri url, Stream? source, long length)
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(direct.CancellationToken); deadline.CancelAfter(direct.Timeout);
            using var message = new HttpRequestMessage(HttpMethod.Post, url); message.Headers.TryAddWithoutValidation("origin", "https://web.whatsapp.com"); message.Headers.Referrer = new("https://web.whatsapp.com/"); if (source is not null) { message.Content = new StreamContent(new BorrowedUploadStream(source)); message.Content.Headers.ContentLength = length; }
            try
            {
                using var response = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, deadline.Token).ConfigureAwait(false); var status = (int)response.StatusCode;
                if (!response.IsSuccessStatusCode) throw new UploadAttempt(status, status is 401 or 408 || status >= 500 && status != 507, new PolymorfaException($"WhatsApp media host returned status {status}.", status switch { 413 => "media_too_large", 415 => "media_upload_hash_mismatch", 507 => "media_upload_throttled", 401 => "media_upload_unauthorized", _ => "media_upload_failed" }));
                await using var body = await response.Content.ReadAsStreamAsync(deadline.Token).ConfigureAwait(false); using var target = new MemoryStream(); var buffer = new byte[8192]; while (true) { var count = await body.ReadAsync(buffer, deadline.Token).ConfigureAwait(false); if (count == 0) break; if (target.Length + count > 1024 * 1024) throw InvalidResponse(); await target.WriteAsync(buffer.AsMemory(0, count), deadline.Token).ConfigureAwait(false); }
                if (target.Length == 0) return null; try { return JsonSerializer.Deserialize<JsonElement>(target.ToArray()); } catch (JsonException) { throw InvalidResponse(); }
            }
            catch (OperationCanceledException) { if (direct.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new UploadAttempt(null, true, new PolymorfaTimeoutException("WhatsApp media upload timed out.")); }
            catch (HttpRequestException error) { if (PreparedWhatsAppUpload.HasChangedSource(error)) throw PreparedWhatsAppUpload.Changed(); throw new UploadAttempt(null, true, new PolymorfaConnectionException("Cannot reach the WhatsApp media host.")); }
        }
        async Task<T> Retry<T>(Func<int, Task<T>> action)
        {
            UploadAttempt? last = null; for (var attempt = 0; attempt < direct.MaxAttempts; attempt++) { if (attempt > 0 && last?.Status == 401) grant = await CreateUploadGrantAsync(session, prepared.Info.MediaType, prepared.Info.FileEncSha256, request).ConfigureAwait(false); try { return await action(attempt).ConfigureAwait(false); } catch (UploadAttempt error) { if (!error.Retryable) throw error.Final; last = error; } }
            throw last!.Final;
        }
        var total = prepared.Info.EncryptedLength; WhatsAppUploadLocation location;
        if (prepared.Info.MediaType == WhatsAppUploadMediaType.Document && total > direct.DocumentPartSize)
        {
            Stream? stream = null;
            try
            {
                for (long start = 0; start < total; start += direct.DocumentPartSize)
                {
                    var end = Math.Min(start + direct.DocumentPartSize, total);
                    await Retry(async attempt => { if (stream is null || attempt > 0) { if (stream is not null) await stream.DisposeAsync().ConfigureAwait(false); stream = await prepared.OpenAsync(start, direct.CancellationToken).ConfigureAwait(false); } using var range = new UploadRangeStream(stream, end - start); return await Post(Url(("stream", "1"), ("bytestart", start.ToString(System.Globalization.CultureInfo.InvariantCulture)), ("byteend", end.ToString(System.Globalization.CultureInfo.InvariantCulture))), range, end - start).ConfigureAwait(false); }).ConfigureAwait(false);
                }
            }
            finally { if (stream is not null) await stream.DisposeAsync().ConfigureAwait(false); }
            var hash = Convert.ToBase64String(prepared.Info.FileEncSha256).TrimEnd('=').Replace('+', '-').Replace('/', '_'); location = ParseLocation(await Retry(_ => Post(Url(("stream", "1"), ("final_hash", hash)), null, 0)).ConfigureAwait(false));
        }
        else
        {
            location = await Retry(async attempt =>
            {
                long offset = 0;
                if (attempt > 0)
                {
                    JsonElement? progress = null; try { progress = await Post(Url(("resume", "1")), null, 0).ConfigureAwait(false); } catch (UploadAttempt error) when (error.Status == 404) { }
                    if (progress is { } value && value.TryGetProperty("resume", out var resume)) { if (resume.ValueKind == JsonValueKind.String && resume.GetString() == "complete") return ParseLocation(value); if (long.TryParse(resume.ToString(), out var held) && held > 0 && held < total) offset = held; }
                }
                await using var body = await prepared.OpenAsync(offset, direct.CancellationToken).ConfigureAwait(false); return ParseLocation(await Post(offset > 0 ? Url(("bytestart", offset.ToString(System.Globalization.CultureInfo.InvariantCulture)), ("byteend", total.ToString(System.Globalization.CultureInfo.InvariantCulture))) : Url(), body, total - offset).ConfigureAwait(false));
            }).ConfigureAwait(false);
        }
        return new(prepared.Info, location, "direct");
    }
    private static WhatsAppUploadLocation ParseLocation(JsonElement? value)
    {
        try { if (value is not { } body) throw InvalidResponse(); var path = body.GetProperty("direct_path").GetString(); var url = body.GetProperty("url").GetString(); if (string.IsNullOrEmpty(path) || string.IsNullOrEmpty(url)) throw InvalidResponse(); return new(path, url, body.TryGetProperty("handle", out var handle) && handle.ValueKind == JsonValueKind.String ? handle.GetString() : null); } catch (Exception error) when (error is InvalidOperationException or KeyNotFoundException) { throw InvalidResponse(); }
    }
    private sealed class UploadAttempt(int? status, bool retryable, PolymorfaException final) : Exception("Media upload attempt failed.") { internal int? Status => status; internal bool Retryable => retryable; internal PolymorfaException Final => final; }
    private class BorrowedUploadStream(Stream source) : Stream
    {
        protected Stream Source { get; } = source;
        public override bool CanRead => true; public override bool CanSeek => false; public override bool CanWrite => false; public override long Length => throw new NotSupportedException(); public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => Source.ReadAsync(buffer, cancellationToken); public override int Read(byte[] buffer, int offset, int count) => Source.Read(buffer, offset, count); public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException(); public override void SetLength(long value) => throw new NotSupportedException(); public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
    private sealed class UploadRangeStream(Stream source, long remaining) : BorrowedUploadStream(source)
    {
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) { if (remaining == 0) return 0; var count = await Source.ReadAsync(buffer[..(int)Math.Min(remaining, buffer.Length)], cancellationToken).ConfigureAwait(false); if (count == 0) throw PreparedWhatsAppUpload.Changed(); remaining -= count; return count; }
    }
}
