using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

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
public sealed record HistoryChunkRetryResult(string RequestId, string Status);
public sealed record HistoryChunkDeleteRequest(string DirectPath, string FileEncSha256, string? EncHandle = null, string? CompanionMetaNonce = null)
{
    public override string ToString() => "HistoryChunkDeleteRequest(redacted)";
}
public sealed partial class WhatsAppMediaResource
{
    public const string CustomerOwnedApiVersion = "2026-10-14";
    internal static RequestOptions Version(RequestOptions? options) => (options ?? new()) with { ApiVersion = options?.ApiVersion ?? CustomerOwnedApiVersion };
    // These four held API routes have no replay ledger, even with a caller key.
    internal static RequestOptions SubmissionOptions(RequestOptions? options) => Version(options) with { MaxNetworkRetries = 0 };
    private readonly HttpTransport http;
    internal WhatsAppMediaResource(HttpTransport http) => this.http = http;
    private static string EncodedHash(byte[] hash) { if (hash is null || hash.Length != 32) throw new PolymorfaValidationException("fileEncSha256 must contain 32 bytes.", "invalid_parameter"); return Convert.ToBase64String(hash).TrimEnd('=').Replace('+', '-').Replace('/', '_'); }
    internal static string ApiKind(WhatsAppUploadMediaType kind) => kind switch { WhatsAppUploadMediaType.Audio or WhatsAppUploadMediaType.Ptt => "voice", WhatsAppUploadMediaType.Document => "file", _ => WhatsAppMedia.UploadKind(kind) };
    internal static string UploadPath(WhatsAppUploadMediaType kind) => "/mms/" + WhatsAppMedia.UploadKind(kind);
    internal static JsonElement Data(JsonElement value) => value.ValueKind == JsonValueKind.Object && value.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object ? data : value;
    private static object GrantBody(WhatsAppUploadMediaType kind, string hash) => kind is WhatsAppUploadMediaType.Audio or WhatsAppUploadMediaType.Ptt ? (object)new { type = "voice", fileEncSha256 = hash, ptt = kind == WhatsAppUploadMediaType.Ptt } : new { type = ApiKind(kind), fileEncSha256 = hash };
    public async Task<WhatsAppUploadGrant> CreateUploadGrantAsync(string session, WhatsAppUploadMediaType kind, byte[] fileEncSha256, RequestOptions? options = null)
    {
        http.Credential.RequireServer();
        Session(session);
        var hash = EncodedHash(fileEncSha256);
        var response = await http.RequestAsync<JsonElement>(HttpMethod.Post, $"/messaging/{Uri.EscapeDataString(session)}/media/upload-grants", GrantBody(kind, hash), SubmissionOptions(options)).ConfigureAwait(false);
        try
        {
            var body = CanonicalData(response); var url = new Uri(body.GetProperty("uploadUrl").GetString()!); var host = body.GetProperty("host").GetString();
            var auth = url.Query.TrimStart('?').Split('&').Select(pair => pair.Split('=', 2)).Where(pair => pair.Length == 2 && Uri.UnescapeDataString(pair[0]) == "auth").Select(pair => Uri.UnescapeDataString(pair[1])).FirstOrDefault();
            if (!WhatsAppMedia.IsMediaUrl(url.AbsoluteUri) || url.Host != host || string.IsNullOrEmpty(auth) || url.AbsolutePath != UploadPath(kind) + "/" + hash) throw InvalidResponse(response.Metadata);
            var expirySeconds = body.GetProperty("expiresAt").GetInt64(); if (expirySeconds <= 0) throw InvalidResponse(response.Metadata); var expiry = DateTimeOffset.FromUnixTimeSeconds(expirySeconds);
            return new([host!], url, auth, expiry);
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException or ArgumentException or FormatException) { throw InvalidResponse(response.Metadata); }
    }
    /// <summary>Transfers only prepared ciphertext. Keeps the caller's input open and never retries the API upload.</summary>
    public async Task<WhatsAppUploadLocation> RelayUploadAsync(string session, WhatsAppUploadMediaType kind, byte[] fileEncSha256, Stream encrypted, long encryptedLength, RequestOptions? options = null)
    {
        Session(session);
        if (encryptedLength < 1 || !encrypted.CanRead) throw new PolymorfaValidationException("Invalid encrypted body or length.", "invalid_parameter");
        var query = new List<KeyValuePair<string, string>> { new("type", ApiKind(kind)), new("fileEncSha256", EncodedHash(fileEncSha256)) };
        if (kind is WhatsAppUploadMediaType.Audio or WhatsAppUploadMediaType.Ptt) query.Add(new("ptt", (kind == WhatsAppUploadMediaType.Ptt).ToString().ToLowerInvariant()));
        using var body = new StreamContent(new BorrowedCiphertext(encrypted)); body.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream"); body.Headers.ContentLength = encryptedLength;
        var response = await http.RequestBinaryAsync<JsonElement>($"/messaging/{Uri.EscapeDataString(session)}/media/uploads", body, SubmissionOptions(options), query).ConfigureAwait(false);
        try { var data = CanonicalData(response); if (data.TryGetProperty("handle", out var handle) && handle.ValueKind != JsonValueKind.String) throw new JsonException(); var result = data.Deserialize<WhatsAppUploadLocation>(HttpTransport.Json) ?? throw InvalidResponse(response.Metadata); if (string.IsNullOrEmpty(result.DirectPath) || string.IsNullOrEmpty(result.Url)) throw InvalidResponse(response.Metadata); return result; }
        catch (JsonException) { throw InvalidResponse(response.Metadata); }
    }
    internal static PolymorfaException InvalidResponse(ResponseMetadata? metadata = null) => new PolymorfaServerException("The API returned an invalid media/history response.", "invalid_response", metadata);
    internal static void Session(string session) { if (string.IsNullOrEmpty(session)) throw new PolymorfaConfigurationException("A session is required."); CampaignContractValidation.Unicode(session); }
    internal static JsonElement CanonicalData(ApiResponse<JsonElement> response)
    {
        ExistingContractCodec.CheckMetadata(response.Metadata);
        var value = response.Data;
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty("success", out var success) || success.ValueKind != JsonValueKind.True || !value.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object) throw new JsonException();
        return data;
    }
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
        http.Credential.RequireServer(); WhatsAppMediaResource.Session(session);
        if (body is null || !Enum.IsDefined(body.SyncType) || body.ChunkMessageId is { } id && !Regex.IsMatch(id, "\\A[A-Za-z0-9._:-]{1,128}\\z", RegexOptions.CultureInvariant)) throw new PolymorfaConfigurationException("Invalid history retry request.");
        var captured = ExistingContractCodec.Capture(body);
        var response = await http.RequestAsync<JsonElement>(HttpMethod.Post, $"/messaging/{Uri.EscapeDataString(session)}/history/chunks/retry", captured, WhatsAppMediaResource.SubmissionOptions(options)).ConfigureAwait(false);
        try
        {
            var data = WhatsAppMediaResource.CanonicalData(response);
            var requestId = data.GetProperty("requestId"); var status = data.GetProperty("status");
            if (requestId.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(requestId.GetString()) || status.ValueKind != JsonValueKind.String || status.GetString() != "requested") throw new JsonException();
            return new(requestId.GetString()!, "requested");
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException) { throw WhatsAppMediaResource.InvalidResponse(response.Metadata); }
    }
    public async Task DeleteChunkAsync(string session, HistoryChunkDeleteRequest body, RequestOptions? options = null)
    {
        http.Credential.RequireServer(); WhatsAppMediaResource.Session(session);
        if (body is null || body.DirectPath is null || body.DirectPath.Length > 1024 || !Regex.IsMatch(body.DirectPath, "\\A/[A-Za-z0-9._~%/=&?+\\-]+\\z", RegexOptions.CultureInvariant) || body.FileEncSha256 is null || !Regex.IsMatch(body.FileEncSha256, "\\A[A-Za-z0-9+/]{43}=\\z", RegexOptions.CultureInvariant)) throw new PolymorfaConfigurationException("Invalid history deletion request.");
        if (Convert.FromBase64String(body.FileEncSha256).Length != 32) throw new PolymorfaConfigurationException("Invalid history encrypted hash.");
        foreach (var token in new[] { body.EncHandle, body.CompanionMetaNonce }) if (token is not null && !Regex.IsMatch(token, "\\A[A-Za-z0-9._~%/=+\\-]{1,512}\\z", RegexOptions.CultureInvariant)) throw new PolymorfaConfigurationException("Invalid history deletion token.");
        var response = await http.RequestAsync<JsonElement>(HttpMethod.Post, $"/messaging/{Uri.EscapeDataString(session)}/history/media/delete", ExistingContractCodec.Capture(body), WhatsAppMediaResource.SubmissionOptions(options)).ConfigureAwait(false);
        try
        {
            var data = WhatsAppMediaResource.CanonicalData(response);
            if (data.GetProperty("status").ValueKind != JsonValueKind.String || data.GetProperty("status").GetString() != "deleted") throw new JsonException();
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException) { throw WhatsAppMediaResource.InvalidResponse(response.Metadata); }
    }
}
