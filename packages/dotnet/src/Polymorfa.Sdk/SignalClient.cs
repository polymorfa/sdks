using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

/// <summary>Server-only application client. This bearer is distinct from a project credential and Signal master/session keys: at least 16 visible ASCII characters, and the reserved <c>pmfa_</c> prefix is rejected before any request.</summary>
public sealed record SignalClientOptions(Uri BaseUrl, string ApplicationSecret)
{
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(30);
    public Action<SocketsHttpHandler>? ConfigureHttpHandler { get; init; }
    public override string ToString() => "SignalClientOptions(redacted)";
}
public sealed record SignalSession(string Id, ulong LeaseGeneration, bool Claimed, bool HasDeviceKeys, string State, string? Pn, string? Lid);
public sealed record SignalSessions(string NodeId, IReadOnlyList<SignalSession> Sessions);
public sealed record SignalSendOutcome(string MessageId, long ServerTimestamp, bool Resent);
public sealed record SignalSendRequest
{
    public string To { get; }
    public string? Text { get; }
    public SignalMediaDescriptor? Media { get; }
    private SignalSendRequest(string to, string? text, SignalMediaDescriptor? media) { To = to; Text = text; Media = media; }
    public static SignalSendRequest TextMessage(string to, string text) => new(to, text, null);
    public static SignalSendRequest MediaMessage(string to, SignalMediaDescriptor media) => new(to, null, media);
    public override string ToString() => "SignalSendRequest(redacted)";
}
public sealed record SignalMediaDescriptor(string Kind, string DirectPath, byte[] MediaKey, byte[] FileSha256, byte[] FileEncSha256, ulong FileLength, string Mimetype)
{
    public string? Url { get; init; }
    public string? Caption { get; init; }
    public string? FileName { get; init; }
    public uint? Width { get; init; }
    public uint? Height { get; init; }
    public uint? Seconds { get; init; }
    public bool? Ptt { get; init; }
    public long? MediaKeyTimestamp { get; init; }
    public WhatsAppMediaDescriptor DownloadDescriptor()
    {
        if (MediaKey.Length != 32 || FileSha256.Length != 32 || FileEncSha256.Length != 32 || FileLength > long.MaxValue || Kind is not ("image" or "video" or "audio" or "document" or "sticker")) throw new PolymorfaValidationException("Invalid Signal media descriptor.", "invalid_signal_request");
        return new(Kind, MediaKey, Url, DirectPath, FileSha256, FileEncSha256, (long)FileLength, Mimetype, FileName);
    }
    public override string ToString() => "SignalMediaDescriptor(redacted)";
}
public sealed record SignalHistoryDescriptor
{
    public int? SyncType { get; init; }
    public uint? ChunkOrder { get; init; }
    public uint? Progress { get; init; }
    public string? DirectPath { get; init; }
    public byte[]? MediaKey { get; init; }
    public byte[]? FileSha256 { get; init; }
    public byte[]? FileEncSha256 { get; init; }
    public ulong? FileLength { get; init; }
    public string? OriginalMessageId { get; init; }
    public string? PeerDataRequestSessionId { get; init; }
    public byte[]? InlinePayload { get; init; }
    public required byte[] NotificationProto { get; init; }
    public HistoryChunkInput ChunkInput()
    {
        if (InlinePayload is not null) return new HistoryInlinePayload(InlinePayload.ToArray());
        if (DirectPath is null || MediaKey is null || FileSha256 is null || FileEncSha256 is null || FileLength > long.MaxValue) throw new PolymorfaValidationException("History notification has no downloadable chunk descriptor.", "invalid_signal_request");
        return new HistoryChunkDescriptor(DirectPath, WhatsAppMedia.Hash(MediaKey, "mediaKey"), WhatsAppMedia.Hash(FileSha256, "fileSha256"), WhatsAppMedia.Hash(FileEncSha256, "fileEncSha256"), FileLength is { } length ? (long)length : null);
    }
    public override string ToString() => "SignalHistoryDescriptor(redacted)";
}
public sealed record SignalEvent
{
    public required string Id { get; init; }
    public required string Type { get; init; }
    public required string SessionId { get; init; }
    public required string Chat { get; init; }
    public required string Sender { get; init; }
    public required string MessageId { get; init; }
    public required long Timestamp { get; init; }
    public required bool IsFromMe { get; init; }
    public required bool Redelivered { get; init; }
    public required bool IdentityChanged { get; init; }
    public required byte[] MessageProto { get; init; }
    public string? SenderAlt { get; init; }
    public string? Text { get; init; }
    public SignalMediaDescriptor? Media { get; init; }
    public SignalHistoryDescriptor? History { get; init; }
    [JsonExtensionData] public Dictionary<string, JsonElement>? Additional { get; init; }
    public override string ToString() => "SignalEvent(redacted)";
}
public sealed class SignalClient : IDisposable
{
    public const string ServiceContract = "8aa191ef0d4c318229c91bcdf474bf2d79dac47c";
    private const int BodyLimit = 4 * 1024 * 1024;
    internal static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
    private readonly HttpClient http;
    private readonly string baseUrl;
    private readonly string secret;
    private readonly TimeSpan timeout;
    public SignalClient(SignalClientOptions options)
    {
        if (OperatingSystem.IsBrowser()) throw new PolymorfaConfigurationException("The Signal service client accepts server applications only.");
        var uri = options.BaseUrl;
        if (!uri.IsAbsoluteUri || !(uri.Scheme == "https" || uri.Scheme == "http" && uri.IsLoopback) || uri.UserInfo.Length != 0 || uri.Query.Length != 0 || uri.Fragment.Length != 0 || options.ApplicationSecret.Length < 16 || options.ApplicationSecret.StartsWith("pmfa_", StringComparison.Ordinal) || options.ApplicationSecret.Any(c => c < '!' || c > '~') || options.Timeout <= TimeSpan.Zero || options.Timeout.TotalMilliseconds > uint.MaxValue - 1) throw new PolymorfaConfigurationException("Invalid Signal client options.");
        var handler = new SocketsHttpHandler();
        options.ConfigureHttpHandler?.Invoke(handler);
        handler.AllowAutoRedirect = false; handler.UseCookies = false; handler.Credentials = null;
        http = new(handler) { Timeout = System.Threading.Timeout.InfiniteTimeSpan };
        baseUrl = uri.AbsoluteUri.TrimEnd('/'); secret = options.ApplicationSecret; timeout = options.Timeout;
    }
    public void Dispose() => http.Dispose();
    private async Task<HttpResponseMessage> OpenAsync(HttpMethod method, string path, object? body, string accept, CancellationToken cancellation, CancellationToken operationDeadline = default)
    {
        using var request = new HttpRequestMessage(method, baseUrl + path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", secret);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue(accept));
        if (body is not null) request.Content = new StringContent(JsonSerializer.Serialize(body, Json), Encoding.UTF8, "application/json");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation, operationDeadline); deadline.CancelAfter(timeout);
        HttpResponseMessage response;
        try { response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token).ConfigureAwait(false); }
        catch (OperationCanceledException) { if (cancellation.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new PolymorfaTimeoutException("Signal request timed out."); }
        catch (HttpRequestException) { throw new PolymorfaConnectionException("Cannot reach the Signal service."); }
        if (!response.IsSuccessStatusCode)
        {
            var status = (int)response.StatusCode; response.Dispose();
            // Do not reflect arbitrary response text, signed URLs, or bearer values.
            throw PolymorfaException.FromResponse(default, new ResponseMetadata(status, null, null, 1, new Dictionary<string, string>(), null, null, null));
        }
        return response;
    }
    private async Task<T> JsonAsync<T>(HttpMethod method, string path, object? body, CancellationToken cancellation)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation); deadline.CancelAfter(timeout);
        using var response = await OpenAsync(method, path, body, "application/json", cancellation, deadline.Token).ConfigureAwait(false);
        if (response.Content.Headers.ContentType?.MediaType != "application/json" || response.Content.Headers.ContentLength > BodyLimit) throw InvalidResponse();
        try
        {
            await using var source = await response.Content.ReadAsStreamAsync(deadline.Token).ConfigureAwait(false);
            using var target = new MemoryStream(); var buffer = new byte[16384];
            while (true) { var count = await source.ReadAsync(buffer, deadline.Token).ConfigureAwait(false); if (count == 0) break; if (target.Length + count > BodyLimit) throw InvalidResponse(); target.Write(buffer, 0, count); }
            return JsonSerializer.Deserialize<T>(target.ToArray(), Json) ?? throw InvalidResponse();
        }
        catch (JsonException) { throw InvalidResponse(); }
        catch (OperationCanceledException) { if (cancellation.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new PolymorfaTimeoutException("Signal response timed out."); }
        catch (IOException) { throw new PolymorfaConnectionException("Signal response interrupted."); }
    }
    public Task<SignalSessions> SessionsAsync(CancellationToken cancellation = default) => JsonAsync<SignalSessions>(HttpMethod.Get, "/v1/sessions", null, cancellation);
    public Task<SignalSendOutcome> SendAsync(string session, SignalSendRequest request, CancellationToken cancellation = default)
    {
        if (string.IsNullOrEmpty(session) || string.IsNullOrEmpty(request.To) || (request.Text is null) == (request.Media is null)) throw new PolymorfaValidationException("Invalid Signal send request.", "invalid_signal_request");
        return JsonAsync<SignalSendOutcome>(HttpMethod.Post, $"/v1/sessions/{Uri.EscapeDataString(session)}/messages", request, cancellation);
    }
    /// <summary>Call only after durably processing/deduplicating the event. The stream never auto-ACKs.</summary>
    public async Task AcknowledgeAsync(string id, CancellationToken cancellation = default)
    {
        if (string.IsNullOrEmpty(id)) throw new PolymorfaValidationException("Event ID is required.", "invalid_signal_request");
        using var response = await OpenAsync(HttpMethod.Post, $"/v1/events/{Uri.EscapeDataString(id)}/ack", null, "application/json", cancellation).ConfigureAwait(false);
        if (response.StatusCode != System.Net.HttpStatusCode.NoContent) throw new PolymorfaServerException("Signal service returned an invalid ACK status.", "invalid_response", new((int)response.StatusCode, null, null, 1, new Dictionary<string, string>(), null, null, null));
    }
    /// <summary>One native SSE connection. No cursor replay or automatic acknowledgment.</summary>
    public async IAsyncEnumerable<SignalEvent> EventsAsync(string? session = null, [EnumeratorCancellation] CancellationToken cancellation = default)
    {
        var path = "/v1/events" + (session is null ? "" : "?session_id=" + Uri.EscapeDataString(session));
        using var response = await OpenAsync(HttpMethod.Get, path, null, "text/event-stream", cancellation).ConfigureAwait(false);
        if (response.Content.Headers.ContentType?.MediaType != "text/event-stream") throw InvalidResponse();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellation).ConfigureAwait(false);
        using var reader = new StreamReader(stream, new UTF8Encoding(false, true)); var lines = new BoundedSseLines(reader);
        var data = new StringBuilder(); string? eventId = null, kind = null;
        while (true)
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation); deadline.CancelAfter(timeout);
            string? line;
            try { line = await lines.ReadAsync(deadline.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) { if (cancellation.IsCancellationRequested) yield break; throw new PolymorfaTimeoutException("Signal event stream timed out."); }
            catch (IOException) { throw new PolymorfaConnectionException("Signal event stream interrupted."); }
            if (lines.IncompleteLine) throw InvalidResponse();
            if (line is null) { if (data.Length != 0 || eventId is not null || kind is not null) throw InvalidResponse(); yield break; }
            if (line.Length != 0)
            {
                var colon = line.IndexOf(':'); var field = colon < 0 ? line : line[..colon]; var value = colon < 0 ? "" : line[(colon + 1)..]; if (value.StartsWith(' ')) value = value[1..];
                if (field == "id") eventId = value; else if (field == "event") kind = value; else if (field == "data") { if (data.Length != 0) data.Append('\n'); data.Append(value); }
                if (data.Length > BodyLimit) throw InvalidResponse(); continue;
            }
            if (data.Length != 0)
            {
                SignalEvent item;
                try { item = JsonSerializer.Deserialize<SignalEvent>(data.ToString(), Json) ?? throw InvalidResponse(); }
                catch (JsonException) { throw InvalidResponse(); }
                if (string.IsNullOrEmpty(item.Id) || item.Id != eventId || item.Type != kind || session is not null && item.SessionId != session) throw InvalidResponse();
                yield return item;
            }
            data.Clear(); eventId = null; kind = null;
        }
    }
    public static SignalEvent VerifyWebhook(ReadOnlySpan<byte> secret, long timestamp, ReadOnlySpan<byte> body, string signature, long now, TimeSpan? tolerance = null)
    {
        if (secret.Length < 16 || secret.StartsWith("pmfa_"u8)) throw new PolymorfaConfigurationException("Invalid Signal webhook secret.");
        var window = tolerance ?? TimeSpan.FromMinutes(5);
        var age = Math.Abs((decimal)timestamp - now);
        if (window < TimeSpan.Zero || age > (decimal)window.TotalSeconds || !signature.StartsWith("v1=", StringComparison.Ordinal)) throw BadSignature();
        byte[] received;
        try { received = Convert.FromHexString(signature[3..]); } catch (FormatException) { throw BadSignature(); }
        using var mac = IncrementalHash.CreateHMAC(HashAlgorithmName.SHA256, secret.ToArray());
        mac.AppendData(Encoding.ASCII.GetBytes(timestamp.ToString(System.Globalization.CultureInfo.InvariantCulture) + ".")); mac.AppendData(body);
        if (!CryptographicOperations.FixedTimeEquals(mac.GetHashAndReset(), received)) throw BadSignature();
        if (body.Length > BodyLimit) throw InvalidResponse();
        try { var item = JsonSerializer.Deserialize<SignalEvent>(body, Json) ?? throw InvalidResponse(); if (string.IsNullOrEmpty(item.Id)) throw InvalidResponse(); return item; }
        catch (JsonException) { throw InvalidResponse(); }
    }
    private static PolymorfaException BadSignature() => new("Invalid Signal webhook signature or timestamp.", "invalid_signature");
    private static PolymorfaException InvalidResponse() => new PolymorfaServerException("Signal service returned an invalid response.", "invalid_response");
}
