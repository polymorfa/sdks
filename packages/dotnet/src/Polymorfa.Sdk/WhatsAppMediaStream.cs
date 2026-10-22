using System.Security.Cryptography;

namespace Polymorfa.Sdk;

public enum MediaVerifyMode
{
    /// <summary>Release plaintext only after the complete MAC, padding and available hashes verify.</summary>
    BeforeRelease,
    /// <summary>Release unverified plaintext incrementally. Discard all emitted bytes if final verification fails.</summary>
    Streaming
}

/// <summary>A native incremental CBC/MAC/hash backend. Dispose to release cryptographic state. Not thread-safe.</summary>
public sealed class WhatsAppMediaDecryptor : IDisposable
{
    private readonly Aes aes;
    private readonly ICryptoTransform cipher;
    private readonly IncrementalHash mac, encryptedHash, plainHash;
    private readonly WhatsAppMediaOptions options;
    private readonly byte[]? expectedPlain, expectedEncrypted;
    private readonly long encryptedLimit;
    private readonly byte[] previous;
    private readonly MemoryStream retained = new();
    private byte[] pending = [];
    private long encryptedBytes, plainBytes;
    private bool terminal, disposed;

    public WhatsAppMediaDecryptor(WhatsAppMediaKeys keys, byte[]? fileSha256 = null, byte[]? fileEncSha256 = null, WhatsAppMediaOptions? options = null, long? fileLength = null)
    {
        this.options = options ?? new();
        if (!Enum.IsDefined(this.options.Verify)) throw new PolymorfaConfigurationException("Invalid media verification mode.");
        encryptedLimit = WhatsAppMedia.EncryptedLimit(this.options.MaxBytes, fileLength);
        if (keys.Iv.Length != 16 || keys.CipherKey.Length != 32 || keys.MacKey.Length != 32) throw WhatsAppMedia.Invalid("Invalid derived media keys.");
        expectedPlain = fileSha256 is null ? null : WhatsAppMedia.Hash(fileSha256, "fileSha256");
        expectedEncrypted = fileEncSha256 is null ? null : WhatsAppMedia.Hash(fileEncSha256, "fileEncSha256");
        previous = keys.Iv.ToArray();
        aes = Aes.Create(); aes.Key = keys.CipherKey; aes.Mode = CipherMode.ECB; aes.Padding = PaddingMode.None;
        cipher = aes.CreateDecryptor();
        mac = IncrementalHash.CreateHMAC(HashAlgorithmName.SHA256, keys.MacKey); mac.AppendData(keys.Iv);
        encryptedHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        plainHash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
    }
    public byte[] Update(ReadOnlySpan<byte> chunk)
    {
        EnsureOpen();
        try
        {
            CheckCancelled();
            if (chunk.Length > encryptedLimit - encryptedBytes) throw WhatsAppMedia.TooLarge();
            encryptedBytes += chunk.Length; encryptedHash.AppendData(chunk);
            var combined = new byte[pending.Length + chunk.Length]; pending.CopyTo(combined, 0); chunk.CopyTo(combined.AsSpan(pending.Length));
            var count = Math.Max(0, combined.Length - 26) / 16 * 16;
            pending = combined[count..];
            var output = new byte[count];
            for (var offset = 0; offset < count; offset += 16) Block(combined, offset, output, offset);
            return Emit(output);
        }
        catch { terminal = true; throw; }
    }
    public byte[] Complete()
    {
        EnsureOpen(); terminal = true;
        CheckCancelled();
        if (encryptedBytes <= 10) throw WhatsAppMedia.Integrity("Encrypted media is too short.", "media_too_short");
        if (expectedEncrypted is not null && !CryptographicOperations.FixedTimeEquals(encryptedHash.GetHashAndReset(), expectedEncrypted)) throw WhatsAppMedia.Integrity("Encrypted media hash mismatch.", "media_enc_hash_mismatch");
        if (pending.Length != 26) throw WhatsAppMedia.Integrity("Ciphertext must contain complete AES blocks.", "media_invalid_ciphertext");
        var last = new byte[16]; Block(pending, 0, last, 0);
        if (!CryptographicOperations.FixedTimeEquals(mac.GetHashAndReset().AsSpan(0, 10), pending.AsSpan(16))) throw WhatsAppMedia.Integrity("Media MAC mismatch.", "media_mac_mismatch");
        var pad = last[15];
        if (pad is < 1 or > 16 || last.AsSpan(16 - pad).ToArray().Any(value => value != pad)) throw WhatsAppMedia.Integrity("Invalid media padding.", "media_invalid_padding");
        var output = Emit(last[..(16 - pad)]);
        if (expectedPlain is not null && !CryptographicOperations.FixedTimeEquals(plainHash.GetHashAndReset(), expectedPlain)) throw WhatsAppMedia.Integrity("Plaintext media hash mismatch.", "media_hash_mismatch");
        return options.Verify == MediaVerifyMode.BeforeRelease ? retained.ToArray() : output;
    }
    private void Block(byte[] input, int offset, byte[] output, int destination)
    {
        mac.AppendData(input, offset, 16);
        cipher.TransformBlock(input, offset, 16, output, destination);
        for (var index = 0; index < 16; index++) output[destination + index] ^= previous[index];
        input.AsSpan(offset, 16).CopyTo(previous);
    }
    private byte[] Emit(byte[] bytes)
    {
        if (bytes.Length > options.MaxBytes - plainBytes) throw WhatsAppMedia.TooLarge();
        plainBytes += bytes.Length; plainHash.AppendData(bytes);
        if (options.Verify == MediaVerifyMode.Streaming) return bytes;
        retained.Write(bytes); return [];
    }
    private void EnsureOpen() { ObjectDisposedException.ThrowIf(disposed, this); if (terminal) throw new PolymorfaConfigurationException("Media decryptor is already finalized."); }
    private void CheckCancelled() { if (options.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException(); }
    public void Dispose()
    {
        if (disposed) return; disposed = true;
        cipher.Dispose(); aes.Dispose(); mac.Dispose(); encryptedHash.Dispose(); plainHash.Dispose();
        CryptographicOperations.ZeroMemory(previous); CryptographicOperations.ZeroMemory(pending);
        if (retained.TryGetBuffer(out var buffer)) CryptographicOperations.ZeroMemory(buffer.AsSpan());
        retained.Dispose();
    }
    public override string ToString() => "WhatsAppMediaDecryptor(redacted)";
}

/// <summary>Owned decrypted response stream. Dispose even when abandoning the body before final verification.</summary>
public sealed class WhatsAppMediaStreamDownload : IAsyncDisposable, IDisposable
{
    public Stream Body { get; }
    public string MediaKind { get; }
    public string Mimetype { get; }
    public string? FileName { get; }
    public long? FileLength { get; }
    private readonly long maxBytes;
    internal WhatsAppMediaStreamDownload(Stream body, WhatsAppMediaDescriptor descriptor, long maxBytes)
    {
        Body = body; MediaKind = descriptor.MediaKind; FileName = descriptor.FileName; FileLength = descriptor.FileLength; this.maxBytes = maxBytes;
        Mimetype = descriptor.Mimetype ?? descriptor.MediaKind switch { "image" => "image/jpeg", "video" => "video/mp4", "audio" => "audio/ogg", "sticker" => "image/webp", _ => "application/octet-stream" };
    }
    public async Task<WhatsAppMediaDownload> ToBufferedAsync(CancellationToken cancellationToken = default)
    {
        using var output = new MemoryStream(); await Body.CopyToAsync(output, cancellationToken).ConfigureAwait(false);
        return new(output.ToArray(), MediaKind, Mimetype, FileName, FileLength);
    }
    /// <summary>Promote a private partial file only after the decrypted stream completes verification.</summary>
    public Task<VerifiedMediaFile> WriteToFileAsync(string destination, bool overwrite = false, CancellationToken cancellationToken = default) => AtomicMediaFile.CopyAsync(Body, destination, maxBytes, overwrite, cancellationToken);
    public void Dispose() => Body.Dispose();
    public ValueTask DisposeAsync() => Body.DisposeAsync();
    public override string ToString() => $"WhatsAppMediaStreamDownload(kind={MediaKind}, body=redacted)";
}
public static partial class WhatsAppMedia
{
    /// <summary>Read-only asynchronous stream; default mode emits nothing until complete verification. Owns source unless leaveOpen.</summary>
    public static Task<Stream> DecryptStreamAsync(Stream encrypted, WhatsAppMediaKeys keys, byte[]? fileSha256 = null, byte[]? fileEncSha256 = null, WhatsAppMediaOptions? options = null, long? fileLength = null, bool leaveOpen = false)
    {
        options ??= new();
        if (options.Timeout <= TimeSpan.Zero || options.Timeout.TotalMilliseconds > uint.MaxValue - 1) throw new PolymorfaConfigurationException("Media timeout must be positive and bounded.");
        if (!encrypted.CanRead) throw new PolymorfaConfigurationException("Encrypted media source must be readable.");
        var decryptor = new WhatsAppMediaDecryptor(keys, fileSha256, fileEncSha256, options, fileLength);
        return Task.FromResult<Stream>(new DecryptedMediaBody(encrypted, decryptor, options, leaveOpen));
    }
    public static Task<WhatsAppMediaStreamDownload> DownloadStreamAsync(LinkedDeviceMessagePayload message, WhatsAppMediaOptions? options = null) => DownloadStreamAsync(message.Media is null ? throw Invalid("Message has no media descriptor.") : Decode(message.Media, message.Type), options);
    public static Task<WhatsAppMediaStreamDownload> DownloadStreamAsync(string descriptor, string messageType, WhatsAppMediaOptions? options = null) => DownloadStreamAsync(Decode(descriptor, messageType), options);
    public static async Task<WhatsAppMediaStreamDownload> DownloadStreamAsync(WhatsAppMediaDescriptor descriptor, WhatsAppMediaOptions? options = null)
    {
        options ??= new();
        var limit = EncryptedLimit(options.MaxBytes, descriptor.FileLength);
        if (options.Timeout <= TimeSpan.Zero || options.Timeout.TotalMilliseconds > uint.MaxValue - 1) throw new PolymorfaConfigurationException("Media timeout must be positive and bounded.");
        if (descriptor.FileSha256 is null) throw Invalid("Descriptor requires a plaintext SHA-256 hash.");
        _ = Hash(descriptor.FileSha256, "fileSha256");
        var urls = CandidateUrls(descriptor); var keys = DeriveKeys(descriptor.MediaKey, descriptor.MediaKind);
        var client = CreateCdnClient(options);
        try
        {
            PolymorfaException? failure = null;
            foreach (var candidate in urls)
            {
                var url = candidate;
                for (var hop = 0; hop <= 3; hop++)
                {
                    using var request = new HttpRequestMessage(HttpMethod.Get, url);
                    request.Headers.TryAddWithoutValidation("origin", "https://web.whatsapp.com"); request.Headers.Referrer = new("https://web.whatsapp.com/");
                    using var deadline = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken); deadline.CancelAfter(options.Timeout);
                    HttpResponseMessage response;
                    try { response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token).ConfigureAwait(false); }
                    catch (OperationCanceledException) { if (options.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new PolymorfaTimeoutException("WhatsApp media headers timed out."); }
                    catch (HttpRequestException) { failure = new PolymorfaConnectionException("Cannot reach the WhatsApp media host."); break; }
                    try
                    {
                        if ((int)response.StatusCode is 301 or 302 or 303 or 307 or 308)
                        {
                            var location = response.Headers.Location; var next = location is null ? null : location.IsAbsoluteUri ? location : new Uri(url, location);
                            if (next is null || !IsMediaUrl(next.AbsoluteUri)) throw Invalid("Media redirect left WhatsApp media hosts.");
                            if (hop == 3) throw new PolymorfaConnectionException("Too many media redirects."); url = next; response.Dispose(); continue;
                        }
                        if (!response.IsSuccessStatusCode) { failure = new PolymorfaException($"WhatsApp media returned HTTP {(int)response.StatusCode}.", "media_download_failed"); response.Dispose(); break; }
                        if (response.Content.Headers.ContentLength > limit) throw TooLarge();
                        var source = await response.Content.ReadAsStreamAsync(options.CancellationToken).ConfigureAwait(false);
                        var owned = new OwnedCdnBody(source, response, client);
                        var body = await DecryptStreamAsync(owned, keys, descriptor.FileSha256, descriptor.FileEncSha256, options, descriptor.FileLength).ConfigureAwait(false);
                        return new(body, descriptor, options.MaxBytes);
                    }
                    catch { response.Dispose(); throw; }
                }
            }
            throw failure ?? new PolymorfaConnectionException("Media download failed.");
        }
        catch (OperationCanceledException) { client.Dispose(); throw new PolymorfaCancelledException(); }
        catch { client.Dispose(); throw; }
    }
    private static HttpClient CreateCdnClient(WhatsAppMediaOptions options)
    {
        var handler = new SocketsHttpHandler();
        try
        {
            options.ConfigureHttpHandler?.Invoke(handler);
            handler.MaxResponseDrainSize = 0; handler.AllowAutoRedirect = false; handler.UseCookies = false; handler.Credentials = null; handler.PreAuthenticate = false;
            return new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
        }
        catch { handler.Dispose(); throw; }
    }
    private sealed class DecryptedMediaBody(Stream source, WhatsAppMediaDecryptor decryptor, WhatsAppMediaOptions options, bool leaveOpen) : Stream
    {
        private readonly CancellationTokenSource lifetime = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken);
        private byte[] output = []; private int position; private bool finished, disposed;
        private readonly byte[] input = new byte[65536];
        public override bool CanRead => !disposed; public override bool CanSeek => false; public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException(); public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            ObjectDisposedException.ThrowIf(disposed, this); if (buffer.Length == 0) return 0;
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token, cancellationToken); deadline.CancelAfter(options.Timeout);
            try
            {
                deadline.Token.ThrowIfCancellationRequested();
                while (position == output.Length && !finished)
                {
                    var count = await source.ReadAsync(input, deadline.Token).ConfigureAwait(false);
                    if (count == 0) { output = decryptor.Complete(); finished = true; decryptor.Dispose(); if (!leaveOpen) await source.DisposeAsync().ConfigureAwait(false); }
                    else output = decryptor.Update(input.AsSpan(0, count));
                    position = 0;
                }
                var copied = Math.Min(buffer.Length, output.Length - position); output.AsMemory(position, copied).CopyTo(buffer); position += copied; return copied;
            }
            catch (OperationCanceledException) { var cancelled = lifetime.IsCancellationRequested || cancellationToken.IsCancellationRequested; await DisposeAsync().ConfigureAwait(false); if (cancelled) throw new PolymorfaCancelledException(); throw new PolymorfaTimeoutException("Media response body timed out."); }
            catch (IOException) { await DisposeAsync().ConfigureAwait(false); throw new PolymorfaConnectionException("Cannot read the media body."); }
            catch { await DisposeAsync().ConfigureAwait(false); throw; }
        }
        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) => ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException("Use asynchronous media reads.");
        protected override void Dispose(bool disposing) { if (!disposed && disposing) { disposed = true; lifetime.Cancel(); decryptor.Dispose(); if (!leaveOpen) source.Dispose(); lifetime.Dispose(); CryptographicOperations.ZeroMemory(output); } base.Dispose(disposing); }
        public override async ValueTask DisposeAsync() { if (!disposed) { disposed = true; lifetime.Cancel(); decryptor.Dispose(); if (!leaveOpen) await source.DisposeAsync().ConfigureAwait(false); lifetime.Dispose(); CryptographicOperations.ZeroMemory(output); } GC.SuppressFinalize(this); }
        public override void Flush() => throw new NotSupportedException(); public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException(); public override void SetLength(long value) => throw new NotSupportedException(); public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
    private sealed class OwnedCdnBody(Stream source, HttpResponseMessage response, HttpClient client) : Stream
    {
        public override bool CanRead => source.CanRead; public override bool CanSeek => false; public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException(); public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => source.ReadAsync(buffer, cancellationToken);
        public override int Read(byte[] buffer, int offset, int count) => source.Read(buffer, offset, count);
        protected override void Dispose(bool disposing) { if (disposing) { source.Dispose(); response.Dispose(); client.Dispose(); } base.Dispose(disposing); }
        public override async ValueTask DisposeAsync() { await source.DisposeAsync().ConfigureAwait(false); response.Dispose(); client.Dispose(); GC.SuppressFinalize(this); }
        public override void Flush() => throw new NotSupportedException(); public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException(); public override void SetLength(long value) => throw new NotSupportedException(); public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
public static class WhatsAppMediaStreamExtensions
{
    public static Task<WhatsAppMediaStreamDownload> DownloadFromWhatsAppStreamAsync(this MessagingMedia media, WhatsAppMediaDescriptor descriptor, WhatsAppMediaOptions? options = null) => WhatsAppMedia.DownloadStreamAsync(descriptor, options);
    public static Task<WhatsAppMediaStreamDownload> DownloadFromWhatsAppStreamAsync(this MessagingMedia media, LinkedDeviceMessagePayload message, WhatsAppMediaOptions? options = null) => WhatsAppMedia.DownloadStreamAsync(message, options);
}
