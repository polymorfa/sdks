using System.Net;
using System.Text.Json;
using Microsoft.Azure.Cosmos;
using Polymorfa.Sdk.Storage;

namespace Polymorfa.Storage.Cosmos;

public sealed record CosmosStorageOptions(string Namespace)
{
    public int MaxQueryRows { get; init; } = 100000;
    public override string ToString() => "CosmosStorageOptions(redacted)";
}

/// <summary>Customer-owned Cosmos DB using a single /namespace partition and native transactional batches.</summary>
public sealed class CosmosStorageAdapter : IStorageAdapter
{
    private readonly Container container;
    private readonly CosmosStorageOptions options;
    private readonly PartitionKey partition;
    private sealed record Document(string Id, string Namespace, string Entity, StorageRow? Row, bool Deleted, string? Etag);
    public string Name => "cosmos";
    public StorageCapabilities Capabilities => new(true, 100);

    public CosmosStorageAdapter(Container container, CosmosStorageOptions options)
    {
        if (OperatingSystem.IsBrowser() || container is null || options.MaxQueryRows is <= 0 or int.MaxValue) throw Invalid();
        StorageSchema.ValidateNamespace(options.Namespace);
        this.container = container;
        this.options = options;
        partition = new(options.Namespace);
    }

    private static StorageValidationException Invalid() => new("Invalid customer Cosmos DB configuration or operation.");
    private static StorageProviderException Provider() => new("Customer Cosmos DB operation failed; a write outcome may be uncertain.");
    private static bool Success(HttpStatusCode status) => (int)status is >= 200 and < 300;
    private static bool Conflict(HttpStatusCode status) => (int)status is 404 or 409 or 412 or 449;
    private static string Id(StorageEntity entity, string key) => StorageSchema.Definition(entity).Name + ":" + key;
    private static StorageRow Snapshot(StorageRow row) => new(row.Id, row.Revision,
        row.Versions.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal),
        row.Fields.ToDictionary(p => p.Key, p => p.Value.Clone(), StringComparer.Ordinal));

    private static void Validate(IReadOnlyList<StorageWrite> writes)
    {
        if (writes.Count > 100) throw Invalid();
        var slots = new HashSet<(StorageEntity, string)>();
        foreach (var write in writes)
        {
            var (entity, id, expected) = write switch
            {
                StoragePut p => (p.Entity, p.Row.Id, p.ExpectedRev),
                StorageRowDelete d => (d.Entity, d.Id, d.ExpectedRev),
                _ => throw Invalid()
            };
            var definition = StorageSchema.Definition(entity);
            if (!slots.Add((entity, id)) || expected is < 1 or > 9007199254740991) throw Invalid();
            if (write is not StoragePut put) continue;
            var row = put.Row;
            if (row.Revision is < 1 or > 9007199254740991 || row.Fields.Keys.Any(k => k is "_id" or "_rev" or "_v") || row.Versions.Values.Any(v => !double.IsFinite(v))) throw Invalid();
            var keys = definition.Key.ToDictionary(k => k, k => row.Fields.TryGetValue(k, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()! : throw Invalid());
            if (StorageSchema.EncodeKey(entity, keys) != id) throw Invalid();
        }
    }

    // Stream APIs fix this JSON contract independently of a caller's custom Cosmos serializer.
    private static async Task<JsonDocument> JsonAsync(Stream? content, CancellationToken cancellation)
    {
        if (content is null) throw Provider();
        using var output = new MemoryStream();
        var buffer = new byte[8192];
        while (true)
        {
            var read = await content.ReadAsync(buffer, cancellation).ConfigureAwait(false);
            if (read == 0) break;
            if (output.Length + read > 8 * 1024 * 1024) throw Provider();
            output.Write(buffer, 0, read);
        }
        try { return JsonDocument.Parse(output.ToArray()); }
        catch (JsonException) { throw Provider(); }
    }

    private Document Decode(StorageEntity entity, string? expectedId, JsonElement value, string? responseEtag = null)
    {
        try
        {
            if (value.ValueKind != JsonValueKind.Object) throw Provider();
            var id = value.GetProperty("id").GetString()!;
            var owner = value.GetProperty("namespace").GetString();
            var kind = value.GetProperty("entity").GetString();
            var deleted = value.GetProperty("deleted").GetBoolean();
            var raw = value.GetProperty("row");
            var row = raw.ValueKind == JsonValueKind.Null ? null : raw.Deserialize<StorageRow>();
            // The SDK's response header is the token to send back in If-Match.
            // Body _etag formatting can differ from that header on the emulator.
            var etag = responseEtag ?? (value.TryGetProperty("_etag", out var tag) ? tag.GetString() : null);
            if (owner != options.Namespace || kind != StorageSchema.Definition(entity).Name || string.IsNullOrEmpty(id)
                || expectedId is not null && id != Id(entity, expectedId) || deleted != (row is null)) throw Provider();
            if (row is not null)
            {
                Validate(new StorageWrite[] { new StoragePut(entity, row, null) });
                if (id != Id(entity, row.Id)) throw Provider();
            }
            return new(id, owner, kind!, row, deleted, etag);
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException or FormatException or OverflowException or StorageValidationException)
        { throw Provider(); }
    }

    private async Task<Document?> ReadAsync(StorageEntity entity, string id, CancellationToken cancellation)
    {
        try
        {
            using var response = await container.ReadItemStreamAsync(Id(entity, id), partition, cancellationToken: cancellation).ConfigureAwait(false);
            if (response.StatusCode == HttpStatusCode.NotFound) return null;
            if (!Success(response.StatusCode)) throw Provider();
            using var json = await JsonAsync(response.Content, cancellation).ConfigureAwait(false);
            return Decode(entity, id, json.RootElement, response.Headers.ETag);
        }
        catch (Exception error) when (error is CosmosException or HttpRequestException or IOException) { throw Provider(); }
    }

    public async Task SetupAsync(CancellationToken cancellation = default)
    {
        try
        {
            var response = await container.ReadContainerAsync(cancellationToken: cancellation).ConfigureAwait(false);
            if (response.Resource.PartitionKeyPaths.Count != 1 || response.Resource.PartitionKeyPaths[0] != "/namespace") throw Provider();
        }
        catch (Exception error) when (error is CosmosException or HttpRequestException or IOException) { throw Provider(); }
    }

    public async Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default)
    {
        var snapshot = ids.Distinct(StringComparer.Ordinal).ToArray();
        var rows = new Dictionary<string, StorageRow>(StringComparer.Ordinal);
        foreach (var id in snapshot)
        {
            var document = await ReadAsync(entity, id, cancellation).ConfigureAwait(false);
            if (document?.Row is { } row && !document.Deleted) rows.Add(id, row);
        }
        return rows;
    }

    public async Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default)
    {
        var snapshot = writes.Select(w => w switch
        {
            StoragePut p => (StorageWrite)new StoragePut(p.Entity, Snapshot(p.Row), p.ExpectedRev),
            StorageRowDelete d => d,
            _ => throw Invalid()
        }).ToArray();
        Validate(snapshot);
        if (snapshot.Length == 0) return new(true);
        var streams = new List<MemoryStream>();
        var batch = container.CreateTransactionalBatch(partition);
        var count = 0;
        try
        {
            foreach (var write in snapshot)
            {
                var (entity, id, expected) = write switch
                {
                    StoragePut p => (p.Entity, p.Row.Id, p.ExpectedRev),
                    StorageRowDelete d => (d.Entity, d.Id, d.ExpectedRev),
                    _ => throw Invalid()
                };
                var current = await ReadAsync(entity, id, cancellation).ConfigureAwait(false);
                var row = current?.Deleted == false ? current.Row : null;
                if (write is StoragePut && !expected.HasValue ? row is not null : expected.HasValue && row?.Revision != expected) return new(false, new[] { id });
                if (current is null && write is StorageRowDelete) continue;
                var body = JsonSerializer.SerializeToUtf8Bytes(new
                {
                    id = Id(entity, id),
                    @namespace = options.Namespace,
                    entity = StorageSchema.Definition(entity).Name,
                    row = write is StoragePut put ? put.Row : null,
                    deleted = write is StorageRowDelete
                });
                var stream = new MemoryStream(body, writable: false);
                streams.Add(stream);
                if (current is not null)
                {
                    if (string.IsNullOrEmpty(current.Etag)) throw Provider();
                    batch.ReplaceItemStream(current.Id, stream, new TransactionalBatchItemRequestOptions { IfMatchEtag = current.Etag });
                }
                else batch.CreateItemStream(stream);
                count++;
            }
            if (count == 0) return new(true);
            using var response = await batch.ExecuteAsync(cancellation).ConfigureAwait(false);
            if (response.Count != count) throw Provider();
            if (response.IsSuccessStatusCode && response.All(item => Success(item.StatusCode))) return new(true);
            if (response.All(item => Success(item.StatusCode) || Conflict(item.StatusCode) || (int)item.StatusCode == 424)
                && response.Any(item => Conflict(item.StatusCode)))
                return new(false, snapshot.Select(w => w is StoragePut p ? p.Row.Id : ((StorageRowDelete)w).Id).ToArray());
            throw Provider();
        }
        catch (Exception error) when (error is CosmosException or HttpRequestException or IOException) { throw Provider(); }
        finally { foreach (var stream in streams) stream.Dispose(); }
    }

    private static double Sort(StorageRow row, string field) => row.Fields.TryGetValue(field, out var value) && value.ValueKind == JsonValueKind.Number ? value.GetDouble() : 0;
    private static int Compare(double a, string aid, double b, string bid) => a != b ? a.CompareTo(b) : StringComparer.Ordinal.Compare(aid, bid);
    public async Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default)
    {
        query = query with { EqualValues = query.EqualValues.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal) };
        var index = StorageSchema.Definition(entity).Indexes.FirstOrDefault(i => i.Name == query.Index) ?? throw Invalid();
        if (query.Limit is < 0 or > 100000 || index.EqualFields.Any(n => !query.EqualValues.TryGetValue(n, out var value) || string.IsNullOrEmpty(value))
            || query.After is { } after && (!double.IsFinite(after.Sort) || string.IsNullOrEmpty(after.Id))
            || query.Range is { } range && new[] { range.Gt, range.Gte, range.Lt, range.Lte }.Any(v => v.HasValue && !double.IsFinite(v.Value))) throw Invalid();
        if (query.Limit == 0) return Array.Empty<StorageRow>();
        var definition = new QueryDefinition("SELECT * FROM c WHERE c.namespace = @namespace AND c.entity = @entity AND c.deleted = false")
            .WithParameter("@namespace", options.Namespace).WithParameter("@entity", StorageSchema.Definition(entity).Name);
        using var iterator = container.GetItemQueryStreamIterator(definition, requestOptions: new QueryRequestOptions { PartitionKey = partition, MaxItemCount = 1000 });
        var rows = new List<StorageRow>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var cursors = new HashSet<string>(StringComparer.Ordinal);
        var scanned = 0;
        var pages = 0;
        try
        {
            while (iterator.HasMoreResults)
            {
                if (++pages > options.MaxQueryRows + 1) throw Provider();
                using var response = await iterator.ReadNextAsync(cancellation).ConfigureAwait(false);
                if (!Success(response.StatusCode)) throw Provider();
                using var json = await JsonAsync(response.Content, cancellation).ConfigureAwait(false);
                if (!json.RootElement.TryGetProperty("Documents", out var documents) || documents.ValueKind != JsonValueKind.Array) throw Provider();
                foreach (var document in documents.EnumerateArray())
                {
                    var decoded = Decode(entity, null, document);
                    if (decoded.Deleted || decoded.Row is not { } row || !seen.Add(row.Id) || ++scanned > options.MaxQueryRows) throw Provider();
                    if (index.EqualFields.Any(field => !row.Fields.TryGetValue(field, out var value) || value.ValueKind != JsonValueKind.String || value.GetString() != query.EqualValues[field])) continue;
                    var sort = Sort(row, index.Sort);
                    if (query.Range is { } r && (r.Gt.HasValue && sort <= r.Gt || r.Gte.HasValue && sort < r.Gte || r.Lt.HasValue && sort >= r.Lt || r.Lte.HasValue && sort > r.Lte)) continue;
                    if (query.After is { } a)
                    {
                        var compare = Compare(sort, row.Id, a.Sort, a.Id);
                        if (query.Order == "desc" ? compare >= 0 : compare <= 0) continue;
                    }
                    rows.Add(row);
                }
                var cursor = response.Headers.ContinuationToken;
                if (!string.IsNullOrEmpty(cursor) && !cursors.Add(cursor)) throw Provider();
            }
        }
        catch (Exception error) when (error is CosmosException or HttpRequestException or IOException or JsonException or InvalidOperationException) { throw Provider(); }
        rows.Sort((a, b) => { var compare = Compare(Sort(a, index.Sort), a.Id, Sort(b, index.Sort), b.Id); return query.Order == "desc" ? -compare : compare; });
        return rows.Take(query.Limit).ToArray();
    }
}
