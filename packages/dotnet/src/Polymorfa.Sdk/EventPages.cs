using System.Numerics;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Polymorfa.Sdk;

public sealed record ListEventsParameters(string? Type = null, string? Since = null, string? Until = null, int? Limit = null, string? Cursor = null);
public sealed record ListIndexedEventsParameters(string AfterOffset, string? Type = null, int? Limit = null);
public sealed record RetrieveEventParameters(bool? IncludePayload = null);
public sealed record ReplayEventRequest(string WebhookId);
public sealed record IdempotencyReceipt(string Id, string Key, bool Replayed, string CreatedAt, string ExpiresAt);
public sealed record EventReplayReceipt(string EventId, string DeliveryId, string OperationId, IdempotencyReceipt Idempotency);
public sealed record IndexedEventMetadata([property: JsonRequired] bool HasMore, [property: JsonRequired] string HighWatermark, string? NextOffset = null, string? NextCursor = null);
public sealed record IndexedEventEnvelope<T>([property: JsonRequired] IReadOnlyList<T> Data, [property: JsonRequired] IndexedEventMetadata Page);
public sealed class IndexedEventPage<T> : IAsyncEnumerable<T>
{
    public IReadOnlyList<T> Items { get; }
    public string? NextOffset { get; }
    public string HighWatermark { get; }
    public bool HasMore { get; }
    public ResponseMetadata Metadata { get; }
    private readonly HttpTransport http;
    private readonly string path;
    private readonly ListIndexedEventsParameters parameters;
    private readonly RequestOptions options;
    private IndexedEventPage(HttpTransport http, string path, ListIndexedEventsParameters parameters, RequestOptions options, ApiResponse<IndexedEventEnvelope<T>> response)
    {
        this.http = http; this.path = path; this.parameters = parameters; this.options = options;
        Items = Array.AsReadOnly(response.Data.Data.ToArray()); NextOffset = response.Data.Page.NextOffset; HighWatermark = response.Data.Page.HighWatermark; HasMore = response.Data.Page.HasMore; Metadata = response.Metadata;
    }
    internal static async Task<IndexedEventPage<T>> LoadAsync(HttpTransport http, string path, ListIndexedEventsParameters parameters, RequestOptions options, CancellationToken? requestCancellation = null)
    {
        if (!Offset(parameters.AfterOffset, out var after) || after > long.MaxValue) throw new PolymorfaValidationException("afterOffset must be a non-negative decimal stream position.", "invalid_after_offset");
        var response = await http.RequestAsync<IndexedEventEnvelope<T>>(HttpMethod.Get, path, null, requestCancellation is null ? options : options with { CancellationToken = requestCancellation.Value }, Resource.Query(parameters)).ConfigureAwait(false);
        var page = response.Data.Page;
        if (response.Data.Data is null || page is null || !Offset(page.HighWatermark, out var high) || page.NextOffset is not null && !Offset(page.NextOffset, out _) || page.HasMore && (page.NextOffset is null || !Offset(page.NextOffset, out var next) || next <= after || next > high) || !page.HasMore && page.NextOffset is not null)
            throw new PolymorfaServerException("Polymorfa returned invalid indexed event metadata.", "invalid_response", response.Metadata);
        return new(http, path, parameters, options, response);
    }
    private static bool Offset(string? value, out BigInteger number) { number = 0; return value is not null && Regex.IsMatch(value, "^(0|[1-9][0-9]*)$") && BigInteger.TryParse(value, out number); }
    public async Task<IndexedEventPage<T>?> NextPageAsync(CancellationToken cancellationToken = default)
    {
        if (!HasMore) return null;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken, cancellationToken);
        return await LoadAsync(http, path, parameters with { AfterOffset = NextOffset! }, options, linked.Token).ConfigureAwait(false);
    }
    public async IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken cancellationToken = default)
    {
        IndexedEventPage<T>? page = this;
        while (page is not null) { foreach (var item in page.Items) { cancellationToken.ThrowIfCancellationRequested(); yield return item; } page = await page.NextPageAsync(cancellationToken).ConfigureAwait(false); }
    }
}
