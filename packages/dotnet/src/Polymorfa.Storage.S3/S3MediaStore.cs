using System.Net;
using System.Text;
using Amazon.S3;
using Amazon.Runtime;
using Amazon.S3.Model;
using Polymorfa.Sdk;
namespace Polymorfa.Storage.S3;
/// <summary>The caller owns and configures this independent customer S3 client.</summary>
public sealed record S3MediaStoreOptions(IAmazonS3 Client, string Bucket, string Prefix = "")
{
    public override string ToString() => "S3MediaStoreOptions(redacted)";
}
public enum S3WhatsAppEgress { Relay, Direct }
public sealed record S3UploadToWhatsAppOptions(WhatsAppMediaResource Messaging, string Session, string Key, WhatsAppUploadMediaType MediaType)
{
    public string? Mimetype { get; init; }
    public long MaxBytes { get; init; } = 256 * 1024 * 1024;
    public S3WhatsAppEgress Egress { get; init; } = S3WhatsAppEgress.Relay;
    public WhatsAppDirectUploadOptions? DirectOptions { get; init; }
    public RequestOptions? RequestOptions { get; init; }
    public override string ToString() => "S3UploadToWhatsAppOptions(redacted)";
}
public sealed record S3ArchiveOptions(string Key, string ScratchDirectory)
{
    public IReadOnlyDictionary<string, string>? Metadata { get; init; }
    public WhatsAppMediaOptions? DownloadOptions { get; init; }
    public override string ToString() => "S3ArchiveOptions(redacted)";
}
public sealed record S3ArchiveResult(string Bucket, string Key, long Bytes, string Mimetype, string? Etag)
{
    public override string ToString() => $"S3ArchiveResult(bytes={Bytes}, location=redacted)";
}
public sealed class CustomerMediaStorageException(string message) : PolymorfaException(message, "customer_storage_error");
/// <summary>Media archive and ETag-pinned source bridge, matching TypeScript source 254fc6a. No Signal or API credential is used by storage.</summary>
public sealed class S3MediaStore
{
    public const string SourceSdkCommit = "254fc6a2d073e7fc79420cf95f9b03927d00c04a";
    private readonly IAmazonS3 client; private readonly string bucket, prefix;
    public S3MediaStore(S3MediaStoreOptions options)
    {
        if (OperatingSystem.IsBrowser() || options.Client is null || string.IsNullOrEmpty(options.Bucket) || options.Bucket.Any(c => c < '!' || c > '~') || options.Prefix is null || options.Prefix.IndexOf('\0') >= 0) throw new PolymorfaConfigurationException("Invalid customer S3 store configuration."); client = options.Client; bucket = options.Bucket; prefix = options.Prefix;
    }
    private string Key(string key)
    {
        if (string.IsNullOrEmpty(key) || key.IndexOf('\0') >= 0 || Encoding.UTF8.GetByteCount(prefix) + Encoding.UTF8.GetByteCount(key) > 1024) throw new PolymorfaConfigurationException("Invalid customer object key."); return prefix + key;
    }
    private static CustomerMediaStorageException Failure() => new("Customer media storage request failed; an upload outcome may be uncertain.");
    private static PolymorfaMediaIntegrityException Changed() => new("The customer object changed between hashing and upload.", "media_enc_hash_mismatch");
    private static bool IsCancelled(Exception error) => error is OperationCanceledException or PolymorfaCancelledException;
    private static async Task<T> Storage<T>(Func<Task<T>> send, CancellationToken cancellation)
    {
        try { return await send().ConfigureAwait(false); } catch (AmazonS3Exception error) when (error.StatusCode == HttpStatusCode.PreconditionFailed) { throw Changed(); } catch (Exception error) when (IsCancelled(error)) { if (cancellation.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new PolymorfaTimeoutException("Customer media storage request timed out."); } catch (AmazonServiceException) { throw Failure(); } catch (AmazonClientException) { throw Failure(); } catch (HttpRequestException) { throw Failure(); } catch (IOException) { throw Failure(); }
    }
    /// <summary>Each reopen issues GetObject with the same If-Match ETag. The native uploader verifies the complete second-pass encrypted hash before final bytes.</summary>
    public Task<WhatsAppMediaUploadResult> UploadToWhatsAppAsync(S3UploadToWhatsAppOptions options, CancellationToken cancellation = default)
        => UploadUsingAsync(options, null, cancellation);
    public Task<WhatsAppMediaUploadResult> UploadToWhatsAppAsync(S3UploadToWhatsAppOptions options, IWhatsAppMediaUploadTransport transport, CancellationToken cancellation = default)
    {
        if (transport is null || string.IsNullOrEmpty(transport.Name)) throw new PolymorfaConfigurationException("A named upload transport is required.");
        return UploadUsingAsync(options, transport, cancellation);
    }
    private async Task<WhatsAppMediaUploadResult> UploadUsingAsync(S3UploadToWhatsAppOptions options, IWhatsAppMediaUploadTransport? transport, CancellationToken cancellation)
    {
        var key = Key(options.Key); if (!Enum.IsDefined(options.Egress) || options.MaxBytes <= 0) throw new PolymorfaConfigurationException("Invalid S3 upload options."); using var stop = CancellationTokenSource.CreateLinkedTokenSource(cancellation, options.RequestOptions?.CancellationToken ?? default, options.DirectOptions?.CancellationToken ?? default); var token = stop.Token; if (token.IsCancellationRequested) throw new PolymorfaCancelledException();
        var head = await Storage(() => client.GetObjectMetadataAsync(new GetObjectMetadataRequest { BucketName = bucket, Key = key }, token), token).ConfigureAwait(false); var etag = head.ETag; if (string.IsNullOrEmpty(etag) || etag.Length > 1024 || etag.Any(c => c < ' ' || c > '~')) throw new CustomerMediaStorageException("The customer object requires a stable ETag."); if (head.Headers.ContentLength < 0 || head.Headers.ContentLength > options.MaxBytes) throw new PolymorfaMediaIntegrityException("Media exceeds its permitted size.", "media_too_large");
        async Task<Stream> Open(CancellationToken next)
        {
            var response = await Storage(() => client.GetObjectAsync(new GetObjectRequest { BucketName = bucket, Key = key, EtagToMatch = etag }, next), next).ConfigureAwait(false); if (response.ETag != etag || response.ResponseStream is null) { response.Dispose(); throw Changed(); }
            return new OwnedObjectStream(response);
        }
        var prepared = await WhatsAppMedia.PrepareUploadAsync(Open, new(options.MediaType) { Mimetype = options.Mimetype ?? head.Headers.ContentType, MaxBytes = options.MaxBytes, CancellationToken = token }).ConfigureAwait(false); if (prepared.Info.FileLength != head.Headers.ContentLength) throw Changed();
        if (transport is not null) return await options.Messaging.UploadAsync(options.Session, prepared, transport, token).ConfigureAwait(false);
        var request = (options.RequestOptions ?? new()) with { CancellationToken = token }; return options.Egress == S3WhatsAppEgress.Relay ? await options.Messaging.UploadRelayAsync(options.Session, prepared, request).ConfigureAwait(false) : await options.Messaging.UploadDirectAsync(options.Session, prepared, (options.DirectOptions ?? new()) with { CancellationToken = token }, request).ConfigureAwait(false);
    }
    /// <summary>Archives the base64 media descriptor and message type from an inbound message.</summary>
    public Task<S3ArchiveResult> ArchiveAsync(string media, string messageType, S3ArchiveOptions options, CancellationToken cancellation = default)
        => ArchiveAsync(WhatsAppMedia.Decode(media, messageType), options, cancellation);
    /// <summary>Verifies MAC, padding, plaintext SHA-256 and supplied ciphertext hash/length in a private spool before any object PUT begins.</summary>
    public async Task<S3ArchiveResult> ArchiveAsync(WhatsAppMediaDescriptor descriptor, S3ArchiveOptions options, CancellationToken cancellation = default)
    {
        descriptor = descriptor with { MediaKey = descriptor.MediaKey.ToArray(), FileSha256 = descriptor.FileSha256?.ToArray(), FileEncSha256 = descriptor.FileEncSha256?.ToArray() };
        var key = Key(options.Key); if (string.IsNullOrWhiteSpace(options.ScratchDirectory)) throw new PolymorfaConfigurationException("A private spool parent directory is required."); var metadata = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase); if (options.Metadata is not null) foreach (var entry in options.Metadata) { if (string.IsNullOrEmpty(entry.Key) || entry.Key.Length > 128 || entry.Key.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_' or '.')) || entry.Value.Any(c => c < ' ' || c > '~')) throw new PolymorfaConfigurationException("Object metadata requires ASCII keys and values."); metadata[entry.Key] = entry.Value; }
        metadata["wa-media-kind"] = descriptor.MediaKind; if (descriptor.FileSha256 is { } sha) metadata["wa-file-sha256"] = Convert.ToHexString(sha).ToLowerInvariant(); if (descriptor.FileName is { } name) metadata["wa-file-name"] = Component(name); if (metadata.Sum(p => p.Key.Length + p.Value.Length) > 2048) throw new PolymorfaConfigurationException("Object metadata exceeds 2 KiB.");
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(cancellation, options.DownloadOptions?.CancellationToken ?? default); var token = stop.Token; if (token.IsCancellationRequested) throw new PolymorfaCancelledException(); var directory = Path.Combine(Path.GetFullPath(options.ScratchDirectory), "polymorfa-media-" + Guid.NewGuid().ToString("N")); if (OperatingSystem.IsWindows()) Directory.CreateDirectory(directory); else Directory.CreateDirectory(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        try
        {
            var download = await WhatsAppMedia.DownloadToFileAsync(descriptor, Path.Combine(directory, "verified"), (options.DownloadOptions ?? new()) with { CancellationToken = token }).ConfigureAwait(false); if (descriptor.FileLength is { } length && length != download.BytesWritten) throw new PolymorfaMediaIntegrityException("The media length does not match its descriptor.", "media_invalid_descriptor"); var mime = descriptor.Mimetype ?? descriptor.MediaKind switch { "image" => "image/jpeg", "video" => "video/mp4", "audio" => "audio/ogg", "sticker" => "image/webp", _ => "application/octet-stream" };
            await using var body = new FileStream(download.Path, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.Asynchronous | FileOptions.SequentialScan); var put = new PutObjectRequest { BucketName = bucket, Key = key, InputStream = body, ContentType = mime, AutoCloseStream = false, AutoResetStreamPosition = true }; put.Headers.ContentLength = download.BytesWritten; foreach (var item in metadata) put.Metadata[item.Key] = item.Value; var result = await Storage(() => client.PutObjectAsync(put, token), token).ConfigureAwait(false); return new(bucket, key, download.BytesWritten, mime, result.ETag);
        }
        catch (OperationCanceledException) { throw new PolymorfaCancelledException(); }
        finally { Directory.Delete(directory, recursive: true); }
    }
    private static string Component(string value) => Uri.EscapeDataString(value).Replace("%21", "!", StringComparison.Ordinal).Replace("%27", "'", StringComparison.Ordinal).Replace("%28", "(", StringComparison.Ordinal).Replace("%29", ")", StringComparison.Ordinal).Replace("%2A", "*", StringComparison.Ordinal);
    private sealed class OwnedObjectStream(GetObjectResponse response) : Stream
    {
        private Stream Body => response.ResponseStream; public override bool CanRead => Body.CanRead; public override bool CanSeek => false; public override bool CanWrite => false; public override long Length => throw new NotSupportedException(); public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) { try { return Body.Read(buffer, offset, count); } catch (IOException) { throw Failure(); } catch (HttpRequestException) { throw Failure(); } }
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) { try { return await Body.ReadAsync(buffer, cancellationToken).ConfigureAwait(false); } catch (IOException) { throw Failure(); } catch (HttpRequestException) { throw Failure(); } }
        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) => ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask(); protected override void Dispose(bool disposing) { if (disposing) response.Dispose(); base.Dispose(disposing); }
        public override ValueTask DisposeAsync() { response.Dispose(); GC.SuppressFinalize(this); return ValueTask.CompletedTask; }
        public override void Flush() => throw new NotSupportedException(); public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException(); public override void SetLength(long value) => throw new NotSupportedException(); public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
