using System.Globalization;
using System.Net;

namespace Polymorfa.Sdk;

public sealed record MessagingMediaInfo(string Id, string Session, string MessageId, string MimeType, long FileLength, bool Persisted, string? S3Url = null);
public sealed class MediaDownload : IAsyncDisposable, IDisposable
{
    public Stream Body { get; }
    public string? ContentType { get; }
    public long? ContentLength { get; }
    public string? Filename { get; }
    public bool Redirected { get; }
    public ResponseMetadata Metadata { get; }
    private readonly HttpResponseMessage response;
    private readonly IDisposable? owner;
    internal MediaDownload(Stream body, HttpResponseMessage response, ResponseMetadata metadata, bool redirected, CancellationToken cancellation, CancellationTokenSource deadline, IDisposable? owner = null)
    {
        Body = new CancellableStream(body, cancellation, deadline, metadata); this.response = response; this.owner = owner; Metadata = metadata; Redirected = redirected;
        ContentType = response.Content.Headers.ContentType?.MediaType; ContentLength = response.Content.Headers.ContentLength;
        Filename = ContentDisposition.ParseFilename(response.Content.Headers.TryGetValues("Content-Disposition", out var disposition) ? disposition.FirstOrDefault() : null);
    }
    public async Task<byte[]> ReadAllAsync(CancellationToken cancellationToken = default) { using var buffer = new MemoryStream(); await Body.CopyToAsync(buffer, cancellationToken).ConfigureAwait(false); return buffer.ToArray(); }
    public void Dispose() { Body.Dispose(); response.Dispose(); owner?.Dispose(); }
    public async ValueTask DisposeAsync() { await Body.DisposeAsync().ConfigureAwait(false); response.Dispose(); owner?.Dispose(); }
}
public sealed record MediaDownloadUrl(bool Streamed, Uri? Url, DateTimeOffset? ExpiresAt, string? RequestId)
{
    public override string ToString() => $"MediaDownloadUrl(streamed={Streamed}, expiresAt={ExpiresAt}, requestId={RequestId}, url=redacted)";
}
internal sealed class CancellableStream(Stream source, CancellationToken cancellation, CancellationTokenSource deadline, ResponseMetadata metadata) : Stream
{
    private bool completed;
    private int disposed;
    private readonly CancellationToken deadlineToken = deadline.Token;
    public override bool CanRead => source.CanRead;
    public override bool CanSeek => source.CanSeek;
    public override bool CanWrite => false;
    public override long Length => source.Length;
    public override long Position { get => source.Position; set { source.Position = value; completed = false; } }
    public override void Flush() => source.Flush();
    public override int Read(byte[] buffer, int offset, int count) => ReadAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(disposed != 0, this);
        if (completed) return 0;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(deadlineToken, cancellationToken);
        try
        {
            var read = await source.ReadAsync(buffer, linked.Token).ConfigureAwait(false);
            if (read == 0 && buffer.Length != 0) { completed = true; deadline.CancelAfter(Timeout.InfiniteTimeSpan); }
            return read;
        }
        catch (OperationCanceledException)
        {
            if (cancellation.IsCancellationRequested || cancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException(metadata);
            throw new PolymorfaTimeoutException("Media response body timed out.", metadata);
        }
        catch (IOException) { throw new PolymorfaConnectionException("Media response body was interrupted.", metadata); }
        catch (HttpRequestException) { throw new PolymorfaConnectionException("Media response body was interrupted.", metadata); }
    }
    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) => ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();
    public override long Seek(long offset, SeekOrigin origin) { var position = source.Seek(offset, origin); completed = false; return position; }
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    protected override void Dispose(bool disposing) { if (disposing && Interlocked.Exchange(ref disposed, 1) == 0) { deadline.Dispose(); source.Dispose(); } base.Dispose(disposing); }
    public override async ValueTask DisposeAsync() { if (Interlocked.Exchange(ref disposed, 1) == 0) { deadline.Dispose(); await source.DisposeAsync().ConfigureAwait(false); } GC.SuppressFinalize(this); }
}
public sealed class MessagingMedia : Resource
{
    internal MessagingMedia(HttpTransport http) : base(http) { }
    private static string Path(string id) => "/messaging/media/" + E(id);
    public Task<ApiResponse<SuccessEnvelope<MessagingMediaInfo>>> RetrieveAsync(string id, RequestOptions? options = null) => Get<SuccessEnvelope<MessagingMediaInfo>>(Path(id) + "/info", options);
    public Task<ApiResponse<SuccessResponse>> PersistAsync(string id, RequestOptions? options = null) => Post<SuccessResponse>(Path(id) + "/download-and-save", null, options);
    public Task<MediaDownload> DownloadStreamAsync(string id, RequestOptions? options = null) => OpenDownloadAsync(Http, Path(id), options ?? new());
    public async Task<ApiResponse<byte[]>> DownloadAsync(string id, RequestOptions? options = null) { await using var download = await DownloadStreamAsync(id, options).ConfigureAwait(false); return new(await download.ReadAllAsync().ConfigureAwait(false), download.Metadata); }
    public async Task<MediaDownloadUrl> DownloadUrlAsync(string id, RequestOptions? options = null)
    {
        options ??= new();
        using var opened = await Http.OpenAsync(HttpMethod.Get, Path(id), null, options, "*/*", allowMediaRedirect: true).ConfigureAwait(false);
        if (opened.Response.IsSuccessStatusCode) return new(true, null, null, opened.Metadata.RequestId);
        var url = Location(opened.Response, Http.ApiUrl(Path(id)), opened.Metadata);
        return new(false, url, SignedUrlExpiry(url.AbsoluteUri), opened.Metadata.RequestId);
    }
    internal static async Task<MediaDownload> OpenDownloadAsync(HttpTransport http, string path, RequestOptions options)
    {
        var opened = await http.OpenAsync(HttpMethod.Get, path, null, options, "*/*", allowMediaRedirect: true).ConfigureAwait(false);
        var response = opened.Response;
        HttpClient? storage = null;
        CancellationTokenSource? deadline = opened.TakeDeadline();
        try
        {
            var metadata = opened.Metadata; var redirected = !response.IsSuccessStatusCode;
            if (redirected)
            {
                var url = Location(response, http.ApiUrl(path), metadata); response.Dispose(); deadline.Dispose(); deadline = null;
                // A separate client sends no API authorization, cookies, or application request headers.
                storage = http.CreateStorageClient();
                for (var hop = 0; ; hop++)
                {
                    deadline?.Dispose(); deadline = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken); deadline.CancelAfter(options.Timeout ?? http.Options.Timeout);
                    response = await storage.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, deadline.Token).ConfigureAwait(false);
                    if (response.IsSuccessStatusCode) break;
                    if ((int)response.StatusCode is 301 or 302 or 303 or 307 or 308 && hop < 3) { url = Location(response, url, metadata); response.Dispose(); continue; }
                    var status = (int)response.StatusCode; response.Dispose(); throw new PolymorfaException($"Storage returned HTTP {status}.", "media_download_failed", metadata);
                }
            }
            var body = await response.Content.ReadAsStreamAsync(deadline!.Token).ConfigureAwait(false);
            return new(body, response, metadata, redirected, options.CancellationToken, deadline, storage);
        }
        catch (OperationCanceledException) { response.Dispose(); deadline?.Dispose(); storage?.Dispose(); if (options.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException(opened.Metadata); throw new PolymorfaTimeoutException("Media response headers timed out.", opened.Metadata); }
        catch (HttpRequestException) { response.Dispose(); deadline?.Dispose(); storage?.Dispose(); throw new PolymorfaConnectionException("Cannot reach media storage."); }
        catch { response.Dispose(); deadline?.Dispose(); storage?.Dispose(); throw; }
    }
    private static Uri Location(HttpResponseMessage response, Uri source, ResponseMetadata metadata)
    {
        var location = response.Headers.Location;
        if (location is null) throw new PolymorfaException("Missing media redirect location.", "invalid_redirect", metadata);
        var target = location.IsAbsoluteUri ? location : new Uri(source, location);
        if (target.UserInfo.Length != 0 || target.Scheme != "https" && !(target.Scheme == "http" && target.IsLoopback)) throw new PolymorfaException("Invalid media redirect location.", "invalid_redirect", metadata);
        return target;
    }
    /// <summary>Reads a signed URL's SigV4 or epoch expiry without making a request.</summary>
    public static DateTimeOffset? SignedUrlExpiry(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var url)) return null;
        var query = url.Query.TrimStart('?').Split('&').Select(part => part.Split('=', 2)).Where(parts => parts.Length == 2).GroupBy(parts => Uri.UnescapeDataString(parts[0]), StringComparer.Ordinal).ToDictionary(group => group.Key, group => Uri.UnescapeDataString(group.First()[1]), StringComparer.Ordinal);
        if (query.TryGetValue("X-Amz-Date", out var date) && query.TryGetValue("X-Amz-Expires", out var period) && System.Text.RegularExpressions.Regex.IsMatch(period, @"\A[0-9]+\z") && DateTimeOffset.TryParseExact(date, "yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var start) && long.TryParse(period, NumberStyles.None, CultureInfo.InvariantCulture, out var seconds))
        {
            try { return start.AddSeconds(seconds); } catch (ArgumentOutOfRangeException) { return null; }
        }
        if (query.TryGetValue("Expires", out var epoch) && System.Text.RegularExpressions.Regex.IsMatch(epoch, @"\A[0-9]{9,11}\z") && long.TryParse(epoch, NumberStyles.None, CultureInfo.InvariantCulture, out var unix)) return DateTimeOffset.FromUnixTimeSeconds(unix);
        return null;
    }
}
public sealed class PlatformMedia : Resource
{
    internal PlatformMedia(HttpTransport http) : base(http) { }
    public Task<ApiResponse<DataEnvelope<System.Text.Json.JsonElement>>> RetrieveAsync(string id, RequestOptions? options = null) => Get<DataEnvelope<System.Text.Json.JsonElement>>("/platform/media/" + E(id), options);
    public Task<ApiResponse<DataEnvelope<System.Text.Json.JsonElement>>> DeleteAsync(string id, RequestOptions? options = null) => Delete<DataEnvelope<System.Text.Json.JsonElement>>("/platform/media/" + E(id), options);
    public Task<ApiResponse<DataEnvelope<System.Text.Json.JsonElement>>> CreateUploadAsync(System.Text.Json.JsonElement? body = null, RequestOptions? options = null) => Post<DataEnvelope<System.Text.Json.JsonElement>>("/platform/media/uploads", body, options);
}
