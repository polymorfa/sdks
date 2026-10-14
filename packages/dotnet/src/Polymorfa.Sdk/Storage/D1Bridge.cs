using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
namespace Polymorfa.Sdk.Storage;
/// <summary>Customer-hosted D1 binding bridge, independent of API credentials and administrative REST.</summary>
public sealed record D1BridgeOptions(Uri BaseUrl, string Authority, string TablePrefix, string ApplicationSecret)
{
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(30);
    public Action<SocketsHttpHandler>? ConfigureHttpHandler { get; init; }
    public override string ToString() => "D1BridgeOptions(redacted)";
}
public sealed class D1BridgeStorageAdapter : IStorageAdapter, IDisposable
{
    public const string SourceBridgeCommit = "9ae35e671f7f4868a67c1562422c5af9284b95c1";
    private const int MaximumBody = 8 * 1024 * 1024;
    private const string Contract = "polymorfa-d1-storage-v1";
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull, MaxDepth = 64 };
    private readonly HttpClient http; private readonly string baseUrl, authority, prefix, secret; private readonly TimeSpan timeout; private bool setupAllowed;
    public string Name => "d1-bridge"; public StorageCapabilities Capabilities => new(true, 50);
    private D1BridgeStorageAdapter(D1BridgeOptions options)
    {
        var uri = options.BaseUrl;
        if (OperatingSystem.IsBrowser() || !uri.IsAbsoluteUri || !(uri.Scheme == "https" || uri.Scheme == "http" && uri.IsLoopback) || uri.UserInfo.Length != 0 || uri.Query.Length != 0 || uri.Fragment.Length != 0 || uri.AbsolutePath != "/" || !ValidName(options.Authority, false) || !ValidName(options.TablePrefix, true) || options.ApplicationSecret.Length is < 32 or > 256 || options.ApplicationSecret.Any(c => c < '!' || c > '~') || options.Timeout <= TimeSpan.Zero || options.Timeout.TotalMilliseconds > uint.MaxValue - 1) throw Invalid();
        var handler = new SocketsHttpHandler(); options.ConfigureHttpHandler?.Invoke(handler); handler.AllowAutoRedirect = false; handler.UseCookies = false; handler.Credentials = null;
        http = new(handler) { Timeout = System.Threading.Timeout.InfiniteTimeSpan }; baseUrl = uri.AbsoluteUri.TrimEnd('/'); authority = options.Authority; prefix = options.TablePrefix; secret = options.ApplicationSecret; timeout = options.Timeout;
    }
    /// <summary>Validates a fresh signed authority/schema/capability handshake before returning an atomic adapter.</summary>
    public static async Task<D1BridgeStorageAdapter> ConnectAsync(D1BridgeOptions options, CancellationToken cancellation = default)
    {
        var adapter = new D1BridgeStorageAdapter(options); try
        {
            var data = await adapter.RequestAsync<JsonElement>(HttpMethod.Get, "/handshake", null, cancellation).ConfigureAwait(false);
            if (!data.TryGetProperty("atomicCommit", out var atomic) || atomic.ValueKind != JsonValueKind.True || !data.TryGetProperty("conditionalDeletes", out var deletes) || deletes.ValueKind != JsonValueKind.True || !ExactNumber(data, "maxCommitSize", 50) || !ExactNumber(data, "maxGetSize", 1000) || !ExactNumber(data, "maxQuerySize", 1000) || !ExactNumber(data, "maxBodyBytes", MaximumBody) || !data.TryGetProperty("setupAllowed", out var setup) || setup.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) throw Untrusted(); adapter.setupAllowed = setup.GetBoolean(); return adapter;
        }
        catch { adapter.Dispose(); throw; }
    }
    private static bool ExactNumber(JsonElement value, string property, int expected) => value.TryGetProperty(property, out var n) && n.TryGetInt32(out var actual) && actual == expected;
    private static bool ValidName(string value, bool prefix) => value.Length > 0 && value.Length <= (prefix ? 64 : 128) && (char.IsAsciiLetter(value[0]) || prefix && value[0] == '_') && value.Skip(1).All(c => char.IsAsciiLetterOrDigit(c) || (prefix ? c == '_' : "_.:-".Contains(c)));
    private async Task<T> RequestAsync<T>(HttpMethod method, string path, object? payload, CancellationToken cancellation)
    {
        var body = payload is null ? Array.Empty<byte>() : JsonSerializer.SerializeToUtf8Bytes(payload, Json); if (body.Length > MaximumBody) throw Invalid(); var nonce = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_'); var signed = Join($"{nonce}.{method.Method}.{path}.", body);
        using var request = new HttpRequestMessage(method, baseUrl + path); request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", secret); request.Headers.Add("Polymorfa-Storage-Authority", authority); request.Headers.Add("Polymorfa-Storage-Prefix", prefix); request.Headers.Add("Polymorfa-Storage-Nonce", nonce); request.Headers.Add("Polymorfa-Storage-Signature", Sign(signed)); request.Headers.Accept.Add(new("application/json")); if (method == HttpMethod.Post) { request.Content = new ByteArrayContent(body); request.Content.Headers.ContentType = new("application/json"); }
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation); deadline.CancelAfter(timeout);
        try
        {
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token).ConfigureAwait(false);
            if (Header(response, "Polymorfa-Storage-Nonce") != nonce || response.Content.Headers.ContentLength > MaximumBody || response.Content.Headers.ContentType?.MediaType != "application/json") throw Untrusted(); var signature = Header(response, "Polymorfa-Storage-Signature"); await using var stream = await response.Content.ReadAsStreamAsync(deadline.Token).ConfigureAwait(false); using var target = new MemoryStream(); var buffer = new byte[16384]; while (true) { var count = await stream.ReadAsync(buffer, deadline.Token).ConfigureAwait(false); if (count == 0) break; if (target.Length + count > MaximumBody) throw Untrusted(); target.Write(buffer, 0, count); }
            var bytes = target.ToArray(); if (!Verify(Join($"{nonce}.{(int)response.StatusCode}.", bytes), signature)) throw Untrusted(); using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 64 }); var envelope = document.RootElement;
            if (!EqualsString(envelope, "contract", Contract) || !ExactNumber(envelope, "schemaVersion", 2) || !EqualsString(envelope, "authority", authority) || !EqualsString(envelope, "tablePrefix", prefix)) throw Untrusted(); if (!response.IsSuccessStatusCode) throw new StorageProviderException("Customer storage operation was rejected."); return envelope.GetProperty("data").Deserialize<T>(Json) ?? throw Untrusted();
        }
        catch (OperationCanceledException) { if (cancellation.IsCancellationRequested) throw; throw new StorageProviderException("Customer storage request timed out; the commit outcome may be unknown."); }
        catch (HttpRequestException) { throw Transport(); }
        catch (IOException) { throw Transport(); }
        catch (JsonException) { throw Untrusted(); }
        catch (InvalidOperationException) { throw Untrusted(); }
        catch (KeyNotFoundException) { throw Untrusted(); }
    }
    private static bool EqualsString(JsonElement value, string name, string expected) => value.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.String && field.GetString() == expected;
    private static string? Header(HttpResponseMessage response, string name) => response.Headers.TryGetValues(name, out var values) && values.Count() == 1 ? values.Single() : null;
    private static byte[] Join(string prefix, byte[] body) { var start = Encoding.UTF8.GetBytes(prefix); var bytes = new byte[start.Length + body.Length]; start.CopyTo(bytes, 0); body.CopyTo(bytes, start.Length); return bytes; }
    private string Sign(byte[] bytes) => "v1=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), bytes)).ToLowerInvariant();
    private bool Verify(byte[] bytes, string? signature)
    {
        if (signature is null || signature.Length != 67 || !signature.StartsWith("v1=", StringComparison.Ordinal) || signature.Skip(3).Any(c => !(c is >= '0' and <= '9' || c is >= 'a' and <= 'f'))) return false; var actual = Convert.FromHexString(signature[3..]); var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), bytes); return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
    private static StorageValidationException Invalid() => new("Invalid customer D1 bridge configuration or request."); private static StorageProviderException Untrusted() => new("Customer D1 bridge returned an untrusted response."); private static StorageProviderException Transport() => new("Customer storage request failed; the commit outcome may be unknown.");
    public async Task SetupAsync(CancellationToken cancellation = default) { if (!setupAllowed) throw new StorageValidationException("D1 bridge schema setup is disabled."); var data = await RequestAsync<JsonElement>(HttpMethod.Post, "/setup", new { }, cancellation).ConfigureAwait(false); if (!data.TryGetProperty("ok", out var ok) || ok.ValueKind != JsonValueKind.True) throw Untrusted(); }
    public async Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default)
    {
        if (ids.Count > 1000 || ids.Any(id => string.IsNullOrEmpty(id) || id.Length > 4096)) throw Invalid(); var rows = await RequestAsync<StorageRow[]>(HttpMethod.Post, "/get", new { entity, ids }, cancellation).ConfigureAwait(false); var result = new Dictionary<string, StorageRow>(StringComparer.Ordinal); foreach (var row in rows) { if (!ids.Contains(row.Id) || !result.TryAdd(row.Id, row)) throw Untrusted(); ValidateRow(entity, row); }
        return result;
    }
    public async Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default)
    {
        StorageValidation.ValidateCommit(writes, 50); var result = await RequestAsync<StorageCommitResult>(HttpMethod.Post, "/commit", new { writes }, cancellation).ConfigureAwait(false); if (result.Ok && result.Conflicts is { Count: > 0 } || !result.Ok && result.Conflicts is not { Count: > 0 } || result.Conflicts is { } conflicts && conflicts.Any(id => !writes.Any(w => w switch { StoragePut p => p.Row.Id == id, StorageRowDelete d => d.Id == id, _ => false }))) throw Untrusted(); return result;
    }
    public async Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default)
    {
        StorageValidation.ValidateQuery(entity, query); if (query.Limit > 1000) throw Invalid(); var rows = await RequestAsync<StorageRow[]>(HttpMethod.Post, "/query", new { entity, query }, cancellation).ConfigureAwait(false); var seen = new HashSet<string>(StringComparer.Ordinal); foreach (var row in rows) { if (!seen.Add(row.Id)) throw Untrusted(); ValidateRow(entity, row); }
        if (!StorageValidation.FilterRows(entity, rows, query).Select(r => r.Id).SequenceEqual(rows.Select(r => r.Id))) throw Untrusted(); return rows;
    }
    private static void ValidateRow(StorageEntity entity, StorageRow row) { try { StorageValidation.ValidateCommit(new[] { new StoragePut(entity, row, null) }, 1); } catch (StorageValidationException) { throw Untrusted(); } }
    public void Dispose() => http.Dispose();
}
