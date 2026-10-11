using System.Collections.ObjectModel;
using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record ResponseMetadata(int Status, string? RequestId, string? ApiVersion, int Attempts, IReadOnlyDictionary<string, string> Headers, string? Transport, string? RoutingReason, string? OperationId);
public sealed record ApiResponse<T>(T Data, ResponseMetadata Metadata);

internal sealed class HttpTransport : IDisposable
{
    internal Credential Credential { get; }
    internal ClientOptions Options { get; }
    private readonly HttpClient http;
    private readonly bool ownsHttp;
    internal static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new MessageContentConverter() }
    };
    internal HttpTransport(Credential credential, ClientOptions options)
    {
        Credential = credential; Options = options with { };
        ValidateUrl(options.BaseUrl);
        ValidateLimits(options.Timeout, options.MaxNetworkRetries);
        if (string.IsNullOrWhiteSpace(options.ApiVersion) || options.ApiVersion.Contains('\r') || options.ApiVersion.Contains('\n')) throw new PolymorfaConfigurationException("Invalid apiVersion.");
        ownsHttp = true;
        var handler = options.TransportHandler ?? new SocketsHttpHandler { AllowAutoRedirect = false, Proxy = options.Proxy, UseProxy = options.Proxy is not null };
        ValidateHandler(handler);
        http = new HttpClient(handler, disposeHandler: options.TransportHandler is null) { Timeout = Timeout.InfiniteTimeSpan };
    }
    internal async Task<ApiResponse<T>> RequestAsync<T>(HttpMethod method, string path, object? body, RequestOptions? requestOptions, IReadOnlyList<KeyValuePair<string, string>>? query = null)
    {
        var options = requestOptions ?? new RequestOptions();
        var bytes = body is null ? null : JsonSerializer.SerializeToUtf8Bytes(body, body.GetType(), Json);
        using var response = await OpenAsync(method, path, bytes, options, "application/json", query).ConfigureAwait(false);
        var data = await ReadAsync<T>(response.Response, options).ConfigureAwait(false);
        return new(data, response.Metadata);
    }
    internal async Task<OpenedResponse> OpenAsync(HttpMethod method, string path, byte[]? body, RequestOptions options, string accept, IReadOnlyList<KeyValuePair<string, string>>? query = null)
    {
        ValidatePath(path);
        var timeout = options.Timeout ?? Options.Timeout;
        var retries = options.MaxNetworkRetries ?? Options.MaxNetworkRetries;
        ValidateLimits(timeout, retries);
        var url = new Uri(Options.BaseUrl, path);
        if (query is { Count: > 0 }) url = new UriBuilder(url) { Query = string.Join("&", query.Select(p => $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value)}")) }.Uri;
        var safe = method == HttpMethod.Get || method == HttpMethod.Head || method == HttpMethod.Options || !string.IsNullOrEmpty(options.IdempotencyKey);
        for (var attempt = 1; ; attempt++)
        {
            using var request = new HttpRequestMessage(method, url);
            request.Headers.Accept.ParseAdd(accept);
            request.Headers.UserAgent.ParseAdd($"polymorfa-dotnet/{SdkVersion.Version}");
            if (options.Headers is not null)
                foreach (var (name, value) in options.Headers)
                {
                    if (name.Equals("authorization", StringComparison.OrdinalIgnoreCase) || name.Equals("host", StringComparison.OrdinalIgnoreCase) || name.Equals("cookie", StringComparison.OrdinalIgnoreCase)) throw new PolymorfaConfigurationException("Reserved authentication header.");
                    request.Headers.Remove(name);
                    if (!request.Headers.TryAddWithoutValidation(name, value)) throw new PolymorfaConfigurationException("Invalid request header.");
                }
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Credential.Value);
            request.Headers.Remove("polymorfa-version");
            request.Headers.TryAddWithoutValidation("polymorfa-version", options.ApiVersion ?? Options.ApiVersion);
            if (options.IdempotencyKey is not null) { request.Headers.Remove("idempotency-key"); request.Headers.TryAddWithoutValidation("idempotency-key", options.IdempotencyKey); }
            if (body is not null) { request.Content = new ByteArrayContent(body); request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json"); }
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken);
            linked.CancelAfter(timeout);
            HttpResponseMessage response;
            try { response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, linked.Token).ConfigureAwait(false); }
            catch (OperationCanceledException)
            {
                if (options.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException();
                if (safe && attempt <= retries) { await WaitAsync(Delay(null, attempt), options.CancellationToken).ConfigureAwait(false); continue; }
                throw new PolymorfaTimeoutException("Request timed out.");
            }
            catch (HttpRequestException)
            {
                if (safe && attempt <= retries) { await WaitAsync(Delay(null, attempt), options.CancellationToken).ConfigureAwait(false); continue; }
                throw new PolymorfaConnectionException("Cannot reach the Polymorfa API.");
            }
            var metadata = Metadata(response, attempt);
            if (response.IsSuccessStatusCode) return new(response, metadata);
            if (safe && attempt <= retries && IsRetryable(metadata.Status) && Header(response, "idempotent-replayed") != "true")
            {
                var delay = Delay(response, attempt); response.Dispose();
                await WaitAsync(delay, options.CancellationToken).ConfigureAwait(false); continue;
            }
            using (response)
            {
                JsonElement error;
                try { error = await ReadAsync<JsonElement>(response, options).ConfigureAwait(false); }
                catch (PolymorfaServerException) { error = default; }
                throw PolymorfaException.FromResponse(error, metadata);
            }
        }
    }
    private async Task<T> ReadAsync<T>(HttpResponseMessage response, RequestOptions options)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken);
        linked.CancelAfter(options.Timeout ?? Options.Timeout);
        try
        {
            var bytes = await response.Content.ReadAsByteArrayAsync(linked.Token).ConfigureAwait(false);
            if (bytes.Length == 0 || response.StatusCode is System.Net.HttpStatusCode.NoContent or System.Net.HttpStatusCode.ResetContent) return default!;
            return JsonSerializer.Deserialize<T>(bytes, Json)!;
        }
        catch (JsonException) { throw new PolymorfaServerException("Polymorfa returned invalid JSON.", "invalid_response"); }
        catch (OperationCanceledException) { if (options.CancellationToken.IsCancellationRequested) throw new PolymorfaCancelledException(); throw new PolymorfaTimeoutException("Response body timed out."); }
        catch (HttpRequestException) { throw new PolymorfaConnectionException("Response body interrupted."); }
    }
    private static void ValidateHandler(HttpMessageHandler handler)
    {
        if (handler is SocketsHttpHandler { AllowAutoRedirect: true } or HttpClientHandler { AllowAutoRedirect: true })
            throw new PolymorfaConfigurationException("Custom HTTP handlers must disable automatic redirects.");
        if (handler is DelegatingHandler delegating)
        {
            if (delegating.InnerHandler is null) throw new PolymorfaConfigurationException("A delegating handler requires an inner transport.");
            ValidateHandler(delegating.InnerHandler);
        }
    }
    internal static string? Header(HttpResponseMessage response, string name) => response.Headers.TryGetValues(name, out var values) || response.Content.Headers.TryGetValues(name, out values) ? string.Join(",", values) : null;
    private static readonly string[] SafeHeaders = ["content-type", "x-request-id", "request-id", "polymorfa-version", "retry-after", "x-polymorfa-transport", "x-polymorfa-routing-reason", "x-polymorfa-operation-id", "polymorfa-data-region", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "polymorfa-ratelimit-reason", "polymorfa-next-cursor"];
    internal static ResponseMetadata Metadata(HttpResponseMessage response, int attempts)
    {
        var headers = SafeHeaders.Select(name => (name, value: Header(response, name))).Where(p => p.value is not null).ToDictionary(p => p.name, p => p.value!);
        return new((int)response.StatusCode, headers.GetValueOrDefault("x-request-id") ?? headers.GetValueOrDefault("request-id"), headers.GetValueOrDefault("polymorfa-version"), attempts, new ReadOnlyDictionary<string, string>(headers), headers.GetValueOrDefault("x-polymorfa-transport"), headers.GetValueOrDefault("x-polymorfa-routing-reason"), headers.GetValueOrDefault("x-polymorfa-operation-id"));
    }
    internal static void ValidatePath(string path)
    {
        var decoded = Uri.UnescapeDataString(path);
        if (!path.StartsWith('/') || path.StartsWith("//", StringComparison.Ordinal) || path.Contains('\\') || path.Contains('?') || path.Contains('#') || decoded.Contains('\\') || decoded.StartsWith("//", StringComparison.Ordinal) || decoded.Split('/').Any(p => p is "." or "..")) throw new PolymorfaValidationException("Invalid API path.", "invalid_request_path");
    }
    internal static void ValidateUrl(Uri url)
    {
        if (!url.IsAbsoluteUri || !(url.Scheme == "https" || url.Scheme == "http" && url.IsLoopback) || url.UserInfo.Length != 0 || url.Query.Length != 0 || url.Fragment.Length != 0) throw new PolymorfaConfigurationException("Invalid baseUrl.");
    }
    private static void ValidateLimits(TimeSpan timeout, int retries)
    {
        if (timeout <= TimeSpan.Zero || timeout.TotalMilliseconds > uint.MaxValue - 1 || retries < 0 || retries > 10) throw new PolymorfaConfigurationException("Invalid timeout or maxNetworkRetries.");
    }
    private static bool IsRetryable(int status) => status is 408 or 409 or 429 or >= 500;
    private static TimeSpan Delay(HttpResponseMessage? response, int attempt)
    {
        var header = response is null ? null : Header(response, "retry-after");
        if (double.TryParse(header, NumberStyles.Float, CultureInfo.InvariantCulture, out var seconds) && double.IsFinite(seconds) && seconds >= 0) return TimeSpan.FromSeconds(Math.Min(seconds, 60));
        if (DateTimeOffset.TryParse(header, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)) return TimeSpan.FromSeconds(Math.Clamp((date - DateTimeOffset.UtcNow).TotalSeconds, 0, 60));
        return TimeSpan.FromMilliseconds(Math.Min(500 * Math.Pow(2, Math.Min(attempt - 1, 4)), 5000) * (0.5 + Random.Shared.NextDouble() * 0.5));
    }
    internal static async Task WaitAsync(TimeSpan delay, CancellationToken cancellation)
    {
        try { await Task.Delay(delay, cancellation).ConfigureAwait(false); }
        catch (OperationCanceledException) { throw new PolymorfaCancelledException(); }
    }
    public void Dispose() { if (ownsHttp) http.Dispose(); }
}
internal sealed class OpenedResponse(HttpResponseMessage response, ResponseMetadata metadata) : IDisposable
{
    internal HttpResponseMessage Response { get; } = response;
    internal ResponseMetadata Metadata { get; } = metadata;
    public void Dispose() => Response.Dispose();
}
