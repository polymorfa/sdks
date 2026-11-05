using System.Text;
using System.Text.Json;
using Google.Cloud.Firestore;
using Grpc.Core;
using Polymorfa.Sdk.Storage;

namespace Polymorfa.Storage.Firestore;

public sealed record FirestoreStorageOptions(string Namespace)
{
    public int MaxQueryRows { get; init; } = 100000;
    public override string ToString() => "FirestoreStorageOptions(redacted)";
}
/// <summary>Customer-owned Google Cloud Firestore with native read-before-write transactions.</summary>
public sealed class FirestoreStorageAdapter : IStorageAdapter
{
    private readonly FirestoreDb database;
    private readonly FirestoreStorageOptions options;
    private readonly string prefix;
    private sealed class ConditionalConflict(string id) : Exception { internal string Id { get; } = id; }
    public string Name => "firestore";
    public StorageCapabilities Capabilities => new(true, 250);
    public Task SetupAsync(CancellationToken cancellation = default) => Task.CompletedTask;
    public FirestoreStorageAdapter(FirestoreDb database, FirestoreStorageOptions options)
    {
        if (OperatingSystem.IsBrowser() || database is null || options is null || options.MaxQueryRows is <= 0 or int.MaxValue) throw Invalid();
        StorageSchema.ValidateNamespace(options.Namespace);
        this.database = database;
        this.options = options;
        prefix = "polymorfa_" + options.Namespace + "_";
    }
    private CollectionReference Collection(StorageEntity entity) => database.Collection(prefix + StorageSchema.Definition(entity).Name);
    private DocumentReference Document(StorageEntity entity, string id)
    {
        if (string.IsNullOrEmpty(id) || id is "." or ".." || id.Contains('/') || Encoding.UTF8.GetByteCount(id) > 1500) throw Invalid();
        return Collection(entity).Document(id);
    }
    private static StorageValidationException Invalid() => new("Invalid customer Firestore configuration or operation.");
    private static StorageProviderException Provider() => new("Customer Firestore operation failed; a write outcome may be uncertain.");
    private static async Task<T> Send<T>(Func<Task<T>> send)
    {
        try { return await send().ConfigureAwait(false); }
        catch (RpcException) { throw Provider(); }
        catch (HttpRequestException) { throw Provider(); }
        catch (IOException) { throw Provider(); }
    }
    private static StorageRow Snapshot(StorageRow row) => new(row.Id, row.Revision,
        row.Versions.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal),
        row.Fields.ToDictionary(p => p.Key, p => p.Value.Clone(), StringComparer.Ordinal));
    private static void Validate(IReadOnlyList<StorageWrite> writes)
    {
        if (writes.Count > 250) throw Invalid();
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
    private static object? Native(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Null => null,
        JsonValueKind.True or JsonValueKind.False => value.GetBoolean(),
        JsonValueKind.String => value.GetString(),
        JsonValueKind.Number => value.TryGetInt64(out var integer) ? (object)integer : double.IsFinite(value.GetDouble()) ? value.GetDouble() : throw Invalid(),
        JsonValueKind.Array => value.EnumerateArray().Select(Native).ToList(),
        JsonValueKind.Object => NativeObject(value),
        _ => throw Invalid()
    };
    private static Dictionary<string, object?> NativeObject(JsonElement value)
    {
        var result = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var field in value.EnumerateObject()) if (!result.TryAdd(field.Name, Native(field.Value))) throw Invalid();
        return result;
    }
    private static JsonElement Json(object? value) => value switch
    {
        null => JsonSerializer.SerializeToElement<object?>(null),
        bool boolean => JsonSerializer.SerializeToElement(boolean),
        string text => JsonSerializer.SerializeToElement(text),
        long integer => JsonSerializer.SerializeToElement(integer),
        int integer => JsonSerializer.SerializeToElement(integer),
        double number when double.IsFinite(number) => number == Math.Truncate(number) && Math.Abs(number) <= 9007199254740991
            ? JsonSerializer.SerializeToElement((long)number) : JsonSerializer.SerializeToElement(number),
        IDictionary<string, object> fields => JsonSerializer.SerializeToElement(fields.ToDictionary(p => p.Key, p => Json(p.Value), StringComparer.Ordinal)),
        IEnumerable<object> values => JsonSerializer.SerializeToElement(values.Select(Json).ToArray()),
        _ => throw Provider()
    };
    private StorageRow Decode(StorageEntity entity, DocumentSnapshot snapshot)
    {
        try
        {
            if (!snapshot.Exists || snapshot.Reference.Parent.Path != Collection(entity).Path) throw Provider();
            var row = Json(snapshot.ToDictionary()).Deserialize<StorageRow>() ?? throw Provider();
            Validate(new StorageWrite[] { new StoragePut(entity, row, null) });
            if (row.Id != snapshot.Id) throw Provider();
            return row;
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException or FormatException or OverflowException or StorageValidationException)
        { throw Provider(); }
    }
    public async Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default)
    {
        var wanted = ids.Distinct(StringComparer.Ordinal).ToArray();
        var references = wanted.Select(id => Document(entity, id)).ToArray();
        var result = new Dictionary<string, StorageRow>(StringComparer.Ordinal);
        foreach (var chunk in references.Chunk(250))
        {
            var expected = chunk.Select(r => r.Path).ToHashSet(StringComparer.Ordinal);
            var snapshots = await Send(() => database.GetAllSnapshotsAsync(chunk, cancellation)).ConfigureAwait(false);
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var snapshot in snapshots)
            {
                if (!expected.Contains(snapshot.Reference.Path) || !seen.Add(snapshot.Reference.Path)) throw Provider();
                if (snapshot.Exists) { var row = Decode(entity, snapshot); result.Add(row.Id, row); }
            }
            if (seen.Count != expected.Count) throw Provider();
        }
        return result;
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
        var references = snapshot.Select(w => w switch { StoragePut p => Document(p.Entity, p.Row.Id), StorageRowDelete d => Document(d.Entity, d.Id), _ => throw Invalid() }).ToArray();
        var documents = snapshot.Select(w => w is StoragePut p ? Native(JsonSerializer.SerializeToElement(p.Row)) : null).ToArray();
        try
        {
            await database.RunTransactionAsync(async transaction =>
            {
                // Firestore requires every read to precede every queued write.
                var current = await transaction.GetAllSnapshotsAsync(references, cancellation).ConfigureAwait(false);
                var byPath = new Dictionary<string, DocumentSnapshot>(StringComparer.Ordinal);
                var expectedPaths = references.Select(r => r.Path).ToHashSet(StringComparer.Ordinal);
                foreach (var row in current) if (!expectedPaths.Contains(row.Reference.Path) || !byPath.TryAdd(row.Reference.Path, row)) throw Provider();
                if (byPath.Count != references.Length) throw Provider();
                for (var i = 0; i < snapshot.Length; i++)
                {
                    var write = snapshot[i];
                    var entity = write is StoragePut put ? put.Entity : ((StorageRowDelete)write).Entity;
                    var id = write is StoragePut p ? p.Row.Id : ((StorageRowDelete)write).Id;
                    var expected = write is StoragePut value ? value.ExpectedRev : ((StorageRowDelete)write).ExpectedRev;
                    var existing = byPath[references[i].Path];
                    var row = existing.Exists ? Decode(entity, existing) : null;
                    if (write is StoragePut && !expected.HasValue ? row is not null : expected.HasValue && row?.Revision != expected) throw new ConditionalConflict(id);
                }
                for (var i = 0; i < snapshot.Length; i++)
                {
                    if (snapshot[i] is StoragePut put)
                    {
                        if (put.ExpectedRev.HasValue) transaction.Set(references[i], documents[i]!, SetOptions.Overwrite);
                        else transaction.Create(references[i], documents[i]!);
                    }
                    else transaction.Delete(references[i]);
                }
            }, cancellationToken: cancellation).ConfigureAwait(false);
            return new(true);
        }
        catch (ConditionalConflict error) { return new(false, new[] { error.Id }); }
        catch (RpcException) { throw Provider(); }
        catch (HttpRequestException) { throw Provider(); }
        catch (IOException) { throw Provider(); }
        catch (ArgumentException) { throw Provider(); }
        catch (InvalidOperationException) { throw Provider(); }
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
        Query selected = Collection(entity);
        foreach (var field in index.EqualFields) selected = selected.WhereEqualTo(field, query.EqualValues[field]);
        var snapshots = await Send(() => selected.Limit(options.MaxQueryRows + 1).GetSnapshotAsync(cancellation)).ConfigureAwait(false);
        if (snapshots.Count > options.MaxQueryRows) throw Provider();
        var rows = new List<StorageRow>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var document in snapshots.Documents)
        {
            var row = Decode(entity, document);
            if (!seen.Add(row.Id) || index.EqualFields.Any(field => !row.Fields.TryGetValue(field, out var value) || value.ValueKind != JsonValueKind.String || value.GetString() != query.EqualValues[field])) throw Provider();
            var sort = Sort(row, index.Sort);
            if (query.Range is { } r && (r.Gt.HasValue && sort <= r.Gt || r.Gte.HasValue && sort < r.Gte || r.Lt.HasValue && sort >= r.Lt || r.Lte.HasValue && sort > r.Lte)) continue;
            if (query.After is { } a) { var compare = Compare(sort, row.Id, a.Sort, a.Id); if (query.Order == "desc" ? compare >= 0 : compare <= 0) continue; }
            rows.Add(row);
        }
        rows.Sort((a, b) => { var compare = Compare(Sort(a, index.Sort), a.Id, Sort(b, index.Sort), b.Id); return query.Order == "desc" ? -compare : compare; });
        return rows.Take(query.Limit).ToArray();
    }
}
