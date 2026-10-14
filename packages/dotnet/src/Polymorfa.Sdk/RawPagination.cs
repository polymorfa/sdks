using System.Text.Json;

namespace Polymorfa.Sdk;

public sealed record RawRequest(HttpMethod Method, string Path, JsonElement? Body = null, RequestOptions? Options = null, IReadOnlyList<KeyValuePair<string, string>>? Query = null);
public sealed record DecodedRawPage<T>(IReadOnlyList<T> Items, string? NextCursor = null);
public delegate DecodedRawPage<T> RawPageDecoder<T>(JsonElement body, ResponseMetadata metadata);

/// <summary>A raw response page decoded by the caller. Preserves the request and response metadata across pages.</summary>
public sealed class RawCursorPage<T> : IAsyncEnumerable<T>
{
    public IReadOnlyList<T> Items { get; }
    public string? NextCursor { get; }
    public bool HasMore => NextCursor is not null;
    public ApiResponse<JsonElement> Response { get; }
    public ResponseMetadata Metadata => Response.Metadata;
    private readonly HttpTransport http;
    private readonly RawRequest request;
    private readonly RawPageDecoder<T> decode;
    private readonly string cursorParameter;
    private RawCursorPage(HttpTransport http, RawRequest request, RawPageDecoder<T> decode, string cursorParameter, ApiResponse<JsonElement> response)
    {
        this.http = http; this.request = request with { Query = request.Query?.ToArray() }; this.decode = decode; this.cursorParameter = cursorParameter; Response = response;
        var page = decode(response.Data, response.Metadata); Items = Array.AsReadOnly(page.Items.ToArray()); NextCursor = page.NextCursor;
    }
    internal static async Task<RawCursorPage<T>> LoadAsync(HttpTransport http, RawRequest request, RawPageDecoder<T> decode, string cursorParameter, CancellationToken? requestCancellation = null)
    {
        ArgumentNullException.ThrowIfNull(decode);
        request = request with { Body = request.Body?.Clone(), Query = request.Query?.ToArray() };
        if (string.IsNullOrEmpty(cursorParameter)) throw new PolymorfaConfigurationException("A cursor parameter is required.");
        var response = await http.RequestAsync<JsonElement>(request.Method, request.Path, request.Body, requestCancellation is null ? request.Options : (request.Options ?? new()) with { CancellationToken = requestCancellation.Value }, request.Query).ConfigureAwait(false);
        return new(http, request, decode, cursorParameter, response);
    }
    public async Task<RawCursorPage<T>?> NextPageAsync(CancellationToken cancellationToken = default)
    {
        if (NextCursor is null) return null;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(request.Options?.CancellationToken ?? default, cancellationToken);
        var query = (request.Query ?? []).Where(pair => pair.Key != cursorParameter).Append(new(cursorParameter, NextCursor)).ToArray();
        return await LoadAsync(http, request with { Query = query }, decode, cursorParameter, linked.Token).ConfigureAwait(false);
    }
    public async IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken cancellationToken = default)
    {
        var current = this;
        while (true)
        {
            foreach (var item in current.Items) { cancellationToken.ThrowIfCancellationRequested(); yield return item; }
            var next = await current.NextPageAsync(cancellationToken).ConfigureAwait(false); if (next is null) yield break; current = next;
        }
    }
}
