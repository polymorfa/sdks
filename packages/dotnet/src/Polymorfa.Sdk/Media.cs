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
    internal MediaDownload(Stream body, HttpResponseMessage response, ResponseMetadata metadata, bool redirected, CancellationToken cancellation, IDisposable? owner = null)
    {
        Body = new CancellableStream(body, cancellation); this.response = response; this.owner = owner; Metadata = metadata; Redirected = redirected;
        ContentType = response.Content.Headers.ContentType?.MediaType; ContentLength = response.Content.Headers.ContentLength;
        Filename = response.Content.Headers.ContentDisposition?.FileNameStar ?? response.Content.Headers.ContentDisposition?.FileName?.Trim('"');
    }
    public async Task<byte[]> ReadAllAsync(CancellationToken cancellationToken = default) { using var buffer = new MemoryStream(); await Body.CopyToAsync(buffer, cancellationToken).ConfigureAwait(false); return buffer.ToArray(); }
    public void Dispose() { Body.Dispose(); response.Dispose(); owner?.Dispose(); }
    public async ValueTask DisposeAsync() { await Body.DisposeAsync().ConfigureAwait(false); response.Dispose(); owner?.Dispose(); }
}
public sealed record MediaDownloadUrl(bool Streamed, Uri? Url, DateTimeOffset? ExpiresAt, string? RequestId)
{
    public override string ToString() => $"MediaDownloadUrl(streamed={Streamed}, expiresAt={ExpiresAt}, requestId={RequestId}, url=redacted)";
}
internal sealed class CancellableStream(Stream source, CancellationToken cancellation) : Stream
{
    public override bool CanRead => source.CanRead;
    public override bool CanSeek => source.CanSeek;
    public override bool CanWrite => false;
    public override long Length => source.Length;
    public override long Position { get => source.Position; set => source.Position = value; }
    public override void Flush() => source.Flush();
    public override int Read(byte[] buffer, int offset, int count) { cancellation.ThrowIfCancellationRequested(); return source.Read(buffer, offset, count); }
    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellation, cancellationToken);
        try { return await source.ReadAsync(buffer, linked.Token).ConfigureAwait(false); }
        catch (OperationCanceledException) { throw new PolymorfaCancelledException(); }
        catch (IOException) { throw new PolymorfaConnectionException("Media response body was interrupted."); }
    }
    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) => ReadAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();
    public override long Seek(long offset, SeekOrigin origin) => source.Seek(offset, origin);
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    protected override void Dispose(bool disposing) { if (disposing) source.Dispose(); base.Dispose(disposing); }
    public override async ValueTask DisposeAsync() { await source.DisposeAsync().ConfigureAwait(false); GC.SuppressFinalize(this); }
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
        var url = Location(opened.Response, new Uri(Http.Options.BaseUrl, Path(id)), opened.Metadata);
        return new(false, url, Expiry(url), opened.Metadata.RequestId);
    }
    internal static async Task<MediaDownload> OpenDownloadAsync(HttpTransport http, string path, RequestOptions options)
    {
        var opened = await http.OpenAsync(HttpMethod.Get, path, null, options, "*/*", allowMediaRedirect: true).ConfigureAwait(false);
        var response = opened.Response;
        HttpClient? storage = null;
        try
        {
            var metadata = opened.Metadata; var redirected = !response.IsSuccessStatusCode;
            if (redirected)
            {
                var url = Location(response, new Uri(http.Options.BaseUrl, path), metadata); response.Dispose();
                // A separate client sends no API authorization, cookies, or application request headers.
                storage = new HttpClient(new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false, Proxy = http.Options.Proxy, UseProxy = http.Options.Proxy is not null }) { Timeout = Timeout.InfiniteTimeSpan };
                for (var hop = 0; ; hop++)
                {
                    using var linked = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken); linked.CancelAfter(options.Timeout ?? http.Options.Timeout);
                    response = await storage.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, linked.Token).ConfigureAwait(false);
                    if (response.IsSuccessStatusCode) break;
                    if ((int)response.StatusCode is 301 or 302 or 303 or 307 or 308 && hop < 3) { url = Location(response, url, metadata); response.Dispose(); continue; }
                    var status = (int)response.StatusCode; response.Dispose(); throw new PolymorfaException($"Storage returned HTTP {status}.", "media_download_failed", metadata);
                }
            }
            var body = await response.Content.ReadAsStreamAsync(options.CancellationToken).ConfigureAwait(false);
            return new(body, response, metadata, redirected, options.CancellationToken, storage);
        }
        catch (OperationCanceledException) { response.Dispose(); storage?.Dispose(); if (options.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new PolymorfaTimeoutException("Media response headers timed out."); }
        catch (HttpRequestException) { response.Dispose(); storage?.Dispose(); throw new PolymorfaConnectionException("Cannot reach media storage."); }
        catch { response.Dispose(); storage?.Dispose(); throw; }
    }
    private static Uri Location(HttpResponseMessage response, Uri source, ResponseMetadata metadata)
    {
        var location = response.Headers.Location;
        if (location is null) throw new PolymorfaException("Missing media redirect location.", "invalid_redirect", metadata);
        var target = location.IsAbsoluteUri ? location : new Uri(source, location);
        if (target.UserInfo.Length != 0 || target.Scheme != "https" && !(target.Scheme == "http" && target.IsLoopback)) throw new PolymorfaException("Invalid media redirect location.", "invalid_redirect", metadata);
        return target;
    }
    private static DateTimeOffset? Expiry(Uri url)
    {
        var query = url.Query.TrimStart('?').Split('&').Select(value => value.Split('=', 2)).Where(parts => parts.Length == 2).GroupBy(parts => Uri.UnescapeDataString(parts[0]), StringComparer.OrdinalIgnoreCase).ToDictionary(group => group.Key, group => Uri.UnescapeDataString(group.First()[1]), StringComparer.OrdinalIgnoreCase);
        if (query.TryGetValue("X-Amz-Date", out var date) && query.TryGetValue("X-Amz-Expires", out var period) && DateTimeOffset.TryParseExact(date, "yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var start) && long.TryParse(period, out var seconds) && seconds >= 0 && seconds <= 604800) return start.AddSeconds(seconds);
        if (query.TryGetValue("Expires", out var epoch) && long.TryParse(epoch, out var unix) && unix >= 0 && unix <= 253402300799) return DateTimeOffset.FromUnixTimeSeconds(unix);
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
