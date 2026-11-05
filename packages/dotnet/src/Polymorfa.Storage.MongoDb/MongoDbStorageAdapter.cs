using MongoDB.Bson;
using MongoDB.Driver;
using Polymorfa.Sdk.Storage;
using System.Text.Json;
namespace Polymorfa.Storage.MongoDb;

public sealed record MongoDbStorageOptions(string Namespace)
{
    public bool CreateIndexes { get; init; } = true;
    public int MaxQueryRows { get; init; } = 100000;
    public override string ToString() => "MongoDbStorageOptions(redacted)";
}
/// <summary>Customer-owned MongoDB with native snapshot/majority transactions. The caller owns database/client lifetime.</summary>
public sealed class MongoDbStorageAdapter : IStorageAdapter
{
    private readonly IMongoDatabase database; private readonly MongoDbStorageOptions options; private readonly string prefix;
    private sealed class ConditionalConflict(string id) : Exception { internal string Id { get; } = id; }
    public string Name => "mongodb"; public StorageCapabilities Capabilities => new(true, 500);
    public MongoDbStorageAdapter(IMongoDatabase database, MongoDbStorageOptions options)
    {
        if (OperatingSystem.IsBrowser() || database is null || options.MaxQueryRows is <= 0 or int.MaxValue) throw Invalid(); StorageSchema.ValidateNamespace(options.Namespace); this.database = database; this.options = options; prefix = "polymorfa_" + options.Namespace + "_";
    }
    private IMongoCollection<BsonDocument> Collection(StorageEntity entity) => database.GetCollection<BsonDocument>(prefix + StorageSchema.Definition(entity).Name);
    private static StorageProviderException Provider() => new("Customer MongoDB operation failed; a write outcome may be uncertain.");
    private static StorageValidationException Invalid() => new("Invalid customer MongoDB configuration or operation.");
    private static async Task<T> Send<T>(Func<Task<T>> send) { try { return await send().ConfigureAwait(false); } catch (MongoException) { throw Provider(); } catch (TimeoutException) { throw Provider(); } catch (NotSupportedException) { throw Provider(); } catch (BsonSerializationException) { throw Provider(); } }
    public async Task SetupAsync(CancellationToken cancellation = default)
    {
        var hello = await Send(() => database.RunCommandAsync<BsonDocument>(new BsonDocument("hello", 1), cancellationToken: cancellation)).ConfigureAwait(false); var replica = hello.TryGetValue("setName", out var name) && name.IsString && !string.IsNullOrEmpty(name.AsString); var router = hello.TryGetValue("msg", out var message) && message == "isdbgrid"; if ((!replica && !router) || !hello.TryGetValue("logicalSessionTimeoutMinutes", out var timeout) || timeout.IsBsonNull) throw Provider();
        if (options.CreateIndexes) foreach (var entity in Enum.GetValues<StorageEntity>()) foreach (var index in StorageSchema.Definition(entity).Indexes) { var keys = new BsonDocument(index.EqualFields.Concat(new[] { index.Sort, "_id" }).Select(field => new BsonElement(field, 1))); await Send(() => Collection(entity).Indexes.CreateOneAsync(new CreateIndexModel<BsonDocument>(keys, new CreateIndexOptions { Name = index.Name }), cancellationToken: cancellation)).ConfigureAwait(false); }
    }
    private static BsonValue Bson(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Null => BsonNull.Value,
        JsonValueKind.True or JsonValueKind.False => new BsonBoolean(value.GetBoolean()),
        JsonValueKind.String => new BsonString(value.GetString()!),
        JsonValueKind.Number => value.TryGetInt64(out var integer) ? new BsonInt64(integer) : double.IsFinite(value.GetDouble()) ? new BsonDouble(value.GetDouble()) : throw Invalid(),
        JsonValueKind.Array => new BsonArray(value.EnumerateArray().Select(Bson)),
        JsonValueKind.Object => new BsonDocument(value.EnumerateObject().Select(p => new BsonElement(p.Name.Contains('\0') ? throw Invalid() : p.Name, Bson(p.Value)))),
        _ => throw Invalid()
    };
    private static JsonElement Json(BsonValue value) => value.BsonType switch
    {
        BsonType.Null => JsonSerializer.SerializeToElement<object?>(null),
        BsonType.Boolean => JsonSerializer.SerializeToElement(value.AsBoolean),
        BsonType.String => JsonSerializer.SerializeToElement(value.AsString),
        BsonType.Int32 => JsonSerializer.SerializeToElement(value.AsInt32),
        BsonType.Int64 => JsonSerializer.SerializeToElement(value.AsInt64),
        BsonType.Double => !double.IsFinite(value.AsDouble) ? throw Provider() : value.AsDouble == Math.Truncate(value.AsDouble) && Math.Abs(value.AsDouble) <= 9007199254740991 ? JsonSerializer.SerializeToElement((long)value.AsDouble) : JsonSerializer.SerializeToElement(value.AsDouble),
        BsonType.Array => JsonSerializer.SerializeToElement(value.AsBsonArray.Select(Json).ToArray()),
        BsonType.Document => JsonSerializer.SerializeToElement(value.AsBsonDocument.ToDictionary(p => p.Name, p => Json(p.Value), StringComparer.Ordinal)),
        _ => throw Provider()
    };
    private static StorageRow Snapshot(StorageRow row) => new(row.Id, row.Revision, row.Versions.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal), row.Fields.ToDictionary(p => p.Key, p => p.Value.Clone(), StringComparer.Ordinal));
    private static void Validate(IReadOnlyList<StorageWrite> writes)
    {
        if (writes.Count > 500) throw Invalid(); var slots = new HashSet<(StorageEntity, string)>(); foreach (var write in writes) { var (entity, id, expected) = write switch { StoragePut p => (p.Entity, p.Row.Id, p.ExpectedRev), StorageRowDelete d => (d.Entity, d.Id, d.ExpectedRev), _ => throw Invalid() }; var definition = StorageSchema.Definition(entity); if (!slots.Add((entity, id)) || expected is < 1 or > 9007199254740991) throw Invalid(); if (write is StoragePut put) { var row = put.Row; if (row.Revision is < 1 or > 9007199254740991 || row.Fields.Keys.Any(k => k is "_id" or "_rev" or "_v") || row.Versions.Values.Any(v => !double.IsFinite(v))) throw Invalid(); var keys = definition.Key.ToDictionary(k => k, k => row.Fields.TryGetValue(k, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()! : throw Invalid()); if (StorageSchema.EncodeKey(entity, keys) != id) throw Invalid(); } }
    }
    private static StorageRow Decode(StorageEntity entity, BsonDocument body)
    {
        try { var row = Json(body).Deserialize<StorageRow>() ?? throw Provider(); Validate(new StorageWrite[] { new StoragePut(entity, row, null) }); return row; } catch (JsonException) { throw Provider(); } catch (InvalidOperationException) { throw Provider(); } catch (KeyNotFoundException) { throw Provider(); } catch (FormatException) { throw Provider(); } catch (OverflowException) { throw Provider(); } catch (StorageValidationException) { throw Provider(); }
    }
    public async Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default)
    {
        var wanted = ids.Distinct(StringComparer.Ordinal).ToArray(); var result = new Dictionary<string, StorageRow>(StringComparer.Ordinal); foreach (var chunk in wanted.Chunk(1000)) { var allowed = new HashSet<string>(chunk, StringComparer.Ordinal); var filter = new BsonDocument("_id", new BsonDocument("$in", new BsonArray(chunk))); var rows = await Send(() => Collection(entity).Find(filter).ToListAsync(cancellation)).ConfigureAwait(false); foreach (var body in rows) { var row = Decode(entity, body); if (!allowed.Contains(row.Id) || !result.TryAdd(row.Id, row)) throw Provider(); } }
        return result;
    }
    public async Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default)
    {
        var snapshot = writes.Select(w => w switch { StoragePut p => (StorageWrite)new StoragePut(p.Entity, Snapshot(p.Row), p.ExpectedRev), StorageRowDelete d => d, _ => throw Invalid() }).ToArray(); Validate(snapshot); if (snapshot.Length == 0) return new(true); var documents = snapshot.Select(w => w is StoragePut p ? Bson(JsonSerializer.SerializeToElement(p.Row)).AsBsonDocument : null).ToArray();
        using var session = await Send(() => database.Client.StartSessionAsync(cancellationToken: cancellation)).ConfigureAwait(false);
        try
        {
            await session.WithTransactionAsync(async (held, token) =>
            {
                for (var i = 0; i < snapshot.Length; i++)
                {
                    var write = snapshot[i]; var (entity, id, expected) = write switch { StoragePut p => (p.Entity, p.Row.Id, p.ExpectedRev), StorageRowDelete d => (d.Entity, d.Id, d.ExpectedRev), _ => throw Invalid() }; var collection = Collection(entity); var filter = new BsonDocument("_id", id); var current = await collection.Find(held, filter).FirstOrDefaultAsync(token).ConfigureAwait(false); long? revision = current is not null && current.TryGetValue("_rev", out var raw) && raw.IsNumeric && double.IsFinite(raw.ToDouble()) && raw.ToDouble() >= 1 && raw.ToDouble() <= 9007199254740991 && raw.ToDouble() == Math.Truncate(raw.ToDouble()) ? (long)raw.ToDouble() : null; if (write is StoragePut && !expected.HasValue ? current is not null : expected.HasValue && revision != expected) throw new ConditionalConflict(id);
                    if (expected.HasValue) filter.Add("_rev", expected.Value);
                    if (write is StoragePut) { if (!expected.HasValue) await collection.InsertOneAsync(held, documents[i]!, cancellationToken: token).ConfigureAwait(false); else { var replaced = await collection.ReplaceOneAsync(held, filter, documents[i]!, cancellationToken: token).ConfigureAwait(false); if (replaced.MatchedCount != 1) throw new ConditionalConflict(id); } }
                    else { var deleted = await collection.DeleteOneAsync(held, filter, cancellationToken: token).ConfigureAwait(false); if (expected.HasValue && deleted.DeletedCount != 1) throw new ConditionalConflict(id); }
                }
                return true;
            }, new TransactionOptions(readConcern: ReadConcern.Snapshot, writeConcern: WriteConcern.WMajority), cancellation).ConfigureAwait(false); return new(true);
        }
        catch (ConditionalConflict error) { return new(false, new[] { error.Id }); }
        catch (MongoWriteException error) when (error.WriteError.Category == ServerErrorCategory.DuplicateKey) { return new(false, snapshot.Select(w => w is StoragePut p ? p.Row.Id : ((StorageRowDelete)w).Id).ToArray()); }
        catch (MongoCommandException error) when (error.Code == 11000) { return new(false, snapshot.Select(w => w is StoragePut p ? p.Row.Id : ((StorageRowDelete)w).Id).ToArray()); }
        catch (MongoException) { throw Provider(); }
        catch (TimeoutException) { throw Provider(); }
        catch (NotSupportedException) { throw Provider(); }
        catch (BsonSerializationException) { throw Provider(); }
    }
    private static double Sort(StorageRow row, string field) => row.Fields.TryGetValue(field, out var value) && value.ValueKind == JsonValueKind.Number ? value.GetDouble() : 0;
    private static int Compare(double a, string aid, double b, string bid) => a != b ? a.CompareTo(b) : StringComparer.Ordinal.Compare(aid, bid);
    public async Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default)
    {
        query = query with { EqualValues = query.EqualValues.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal) }; var index = StorageSchema.Definition(entity).Indexes.FirstOrDefault(i => i.Name == query.Index) ?? throw Invalid(); if (query.Limit is < 0 or > 100000 || index.EqualFields.Any(n => !query.EqualValues.TryGetValue(n, out var value) || string.IsNullOrEmpty(value)) || query.After is { } after && (!double.IsFinite(after.Sort) || string.IsNullOrEmpty(after.Id)) || query.Range is { } range && new[] { range.Gt, range.Gte, range.Lt, range.Lte }.Any(v => v.HasValue && !double.IsFinite(v.Value))) throw Invalid(); if (query.Limit == 0) return Array.Empty<StorageRow>(); var filter = new BsonDocument(index.EqualFields.Select(field => new BsonElement(field, query.EqualValues[field]))); var bodies = await Send(() => Collection(entity).Find(filter).Limit(options.MaxQueryRows + 1).ToListAsync(cancellation)).ConfigureAwait(false); if (bodies.Count > options.MaxQueryRows) throw Provider(); var seen = new HashSet<string>(StringComparer.Ordinal); var rows = new List<StorageRow>(); var descending = query.Order == "desc";
        foreach (var body in bodies) { var row = Decode(entity, body); if (!seen.Add(row.Id) || index.EqualFields.Any(field => !row.Fields.TryGetValue(field, out var value) || value.ValueKind != JsonValueKind.String || value.GetString() != query.EqualValues[field])) throw Provider(); var sort = Sort(row, index.Sort); if (query.Range is { } r && (r.Gt.HasValue && sort <= r.Gt || r.Gte.HasValue && sort < r.Gte || r.Lt.HasValue && sort >= r.Lt || r.Lte.HasValue && sort > r.Lte)) continue; if (query.After is { } a) { var compare = Compare(sort, row.Id, a.Sort, a.Id); if (descending ? compare >= 0 : compare <= 0) continue; } rows.Add(row); }
        rows.Sort((a, b) => { var compare = Compare(Sort(a, index.Sort), a.Id, Sort(b, index.Sort), b.Id); return descending ? -compare : compare; }); return rows.Take(query.Limit).ToArray();
    }
}
