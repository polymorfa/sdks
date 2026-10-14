using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record WhatsAppUploadGrant(IReadOnlyList<string> Hosts, Uri UploadUrl, string Auth, DateTimeOffset ExpiresAt)
{
    public override string ToString() => "WhatsAppUploadGrant(redacted)";
}
public sealed record WhatsAppUploadLocation(string DirectPath, string Url, string? Handle = null)
{
    public override string ToString() => "WhatsAppUploadLocation(redacted)";
}
[JsonConverter(typeof(JsonStringEnumConverter<HistorySyncType>))]
public enum HistorySyncType { INITIAL_BOOTSTRAP, INITIAL_STATUS_V3, FULL, RECENT, PUSH_NAME, NON_BLOCKING_DATA, ON_DEMAND }
public sealed record HistoryChunkRetryRequest(HistorySyncType SyncType, uint ChunkOrder, string? ChunkMessageId = null, bool? Regenerate = null);
public sealed record HistoryChunkRetryResult(string? RequestId = null);
public sealed record HistoryChunkDeleteRequest(string DirectPath, string FileEncSha256, string? EncHandle = null, string? CompanionMetaNonce = null)
{
    public override string ToString() => "HistoryChunkDeleteRequest(redacted)";
}
public sealed partial class WhatsAppMediaResource
{
    public const string CustomerOwnedApiVersion = "2026-10-14";
    internal static RequestOptions Version(RequestOptions? options) => (options ?? new()) with { ApiVersion = options?.ApiVersion ?? CustomerOwnedApiVersion };
    private readonly HttpTransport http;
    internal WhatsAppMediaResource(HttpTransport http) => this.http = http;
    private static string EncodedHash(byte[] hash) { if (hash.Length != 32) throw new PolymorfaValidationException("fileEncSha256 must contain 32 bytes.", "invalid_parameter"); return Convert.ToBase64String(hash).TrimEnd('=').Replace('+', '-').Replace('/', '_'); }
    internal static string ApiKind(WhatsAppUploadMediaType kind) => kind switch { WhatsAppUploadMediaType.Audio or WhatsAppUploadMediaType.Ptt => "voice", WhatsAppUploadMediaType.Document => "file", _ => WhatsAppMedia.UploadKind(kind) };
    internal static string UploadPath(WhatsAppUploadMediaType kind) => "/mms/" + WhatsAppMedia.UploadKind(kind);
    internal static JsonElement Data(JsonElement value) => value.ValueKind == JsonValueKind.Object && value.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object ? data : value;
    private static object GrantBody(WhatsAppUploadMediaType kind, string hash) => kind is WhatsAppUploadMediaType.Audio or WhatsAppUploadMediaType.Ptt ? (object)new { type = "voice", fileEncSha256 = hash, ptt = kind == WhatsAppUploadMediaType.Ptt } : new { type = ApiKind(kind), fileEncSha256 = hash };
    public async Task<WhatsAppUploadGrant> CreateUploadGrantAsync(string session, WhatsAppUploadMediaType kind, byte[] fileEncSha256, RequestOptions? options = null)
    {
        var hash = EncodedHash(fileEncSha256);
        var response = await http.RequestAsync<JsonElement>(HttpMethod.Post, $"/messaging/{Uri.EscapeDataString(session)}/media/upload-grants", GrantBody(kind, hash), Version(options)).ConfigureAwait(false);
        try
        {
            var body = Data(response.Data); var url = new Uri(body.GetProperty("uploadUrl").GetString()!); var host = body.GetProperty("host").GetString();
            var auth = url.Query.TrimStart('?').Split('&').Select(pair => pair.Split('=', 2)).Where(pair => pair.Length == 2 && Uri.UnescapeDataString(pair[0]) == "auth").Select(pair => Uri.UnescapeDataString(pair[1])).FirstOrDefault();
            if (!WhatsAppMedia.IsMediaUrl(url.AbsoluteUri) || url.Host != host || string.IsNullOrEmpty(auth) || url.AbsolutePath != UploadPath(kind) + "/" + hash) throw InvalidResponse();
            var expirySeconds = body.GetProperty("expiresAt").GetInt64(); if (expirySeconds <= 0) throw InvalidResponse(); var expiry = DateTimeOffset.FromUnixTimeSeconds(expirySeconds);
            return new([host!], url, auth, expiry);
        }
        catch (Exception error) when (error is UriFormatException or JsonException or InvalidOperationException or KeyNotFoundException or ArgumentOutOfRangeException) { throw InvalidResponse(); }
    }
    /// <summary>Transfers only prepared ciphertext. Keeps the caller's input open and never retries the API upload.</summary>
    public async Task<WhatsAppUploadLocation> RelayUploadAsync(string session, WhatsAppUploadMediaType kind, byte[] fileEncSha256, Stream encrypted, long encryptedLength, RequestOptions? options = null)
    {
        if (encryptedLength < 1 || !encrypted.CanRead) throw new PolymorfaValidationException("Invalid encrypted body or length.", "invalid_parameter");
        var query = new List<KeyValuePair<string, string>> { new("type", ApiKind(kind)), new("fileEncSha256", EncodedHash(fileEncSha256)) };
        if (kind is WhatsAppUploadMediaType.Audio or WhatsAppUploadMediaType.Ptt) query.Add(new("ptt", (kind == WhatsAppUploadMediaType.Ptt).ToString().ToLowerInvariant()));
        using var body = new StreamContent(new BorrowedCiphertext(encrypted)); body.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream"); body.Headers.ContentLength = encryptedLength;
        var response = await http.RequestBinaryAsync<JsonElement>($"/messaging/{Uri.EscapeDataString(session)}/media/uploads", body, Version(options), query).ConfigureAwait(false);
        try { var result = Data(response.Data).Deserialize<WhatsAppUploadLocation>(HttpTransport.Json) ?? throw InvalidResponse(); if (string.IsNullOrEmpty(result.DirectPath) || string.IsNullOrEmpty(result.Url)) throw InvalidResponse(); return result; }
        catch (JsonException) { throw InvalidResponse(); }
    }
    internal static PolymorfaException InvalidResponse() => new PolymorfaServerException("The API returned an invalid media/history response.", "invalid_response");
    private sealed class BorrowedCiphertext(Stream source) : Stream
    {
        public override bool CanRead => source.CanRead; public override bool CanWrite => false; public override bool CanSeek => false; public override long Length => throw new NotSupportedException(); public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) => source.Read(buffer, offset, count);
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => source.ReadAsync(buffer, cancellationToken);
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException(); public override void SetLength(long value) => throw new NotSupportedException(); public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
public sealed class HistorySyncResource
{
    private readonly HttpTransport http;
    internal HistorySyncResource(HttpTransport http) => this.http = http;
    public async Task<HistoryChunkRetryResult> RequestChunkRetryAsync(string session, HistoryChunkRetryRequest body, RequestOptions? options = null)
    {
        if (!Enum.IsDefined(body.SyncType)) throw new PolymorfaValidationException("Invalid history sync type.", "invalid_parameter");
        var response = await http.RequestAsync<JsonElement>(HttpMethod.Post, $"/messaging/{Uri.EscapeDataString(session)}/history/chunks/retry", body, WhatsAppMediaResource.Version(options)).ConfigureAwait(false);
        try { return WhatsAppMediaResource.Data(response.Data).Deserialize<HistoryChunkRetryResult>(HttpTransport.Json) ?? new(); } catch (JsonException) { throw WhatsAppMediaResource.InvalidResponse(); }
    }
    public async Task DeleteChunkAsync(string session, HistoryChunkDeleteRequest body, RequestOptions? options = null)
    {
        await http.RequestAsync<JsonElement>(HttpMethod.Post, $"/messaging/{Uri.EscapeDataString(session)}/history/media/delete", body, WhatsAppMediaResource.Version(options)).ConfigureAwait(false);
    }
}
