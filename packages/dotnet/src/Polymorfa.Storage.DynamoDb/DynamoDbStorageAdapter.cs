using System.Text.Json;
using Amazon.Runtime;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Polymorfa.Sdk.Storage;
namespace Polymorfa.Storage.DynamoDb;

public sealed record DynamoDbStorageOptions(string Namespace, string TableName)
{
    public bool CreateTable { get; init; }
    public int MaxQueryRows { get; init; } = 100000;
    public override string ToString() => "DynamoDbStorageOptions(redacted)";
}
/// <summary>Schema-2 storage through a separate customer-owned official AWS client. The caller owns client lifetime.</summary>
public sealed class DynamoDbStorageAdapter : IStorageAdapter
{
    private readonly IAmazonDynamoDB client; private readonly DynamoDbStorageOptions options;
    public string Name => "dynamodb"; public StorageCapabilities Capabilities => new(true, 100);
    public DynamoDbStorageAdapter(IAmazonDynamoDB client, DynamoDbStorageOptions options)
    {
        if (OperatingSystem.IsBrowser() || client is null || string.IsNullOrEmpty(options.TableName) || options.TableName.Length > 1024 || options.TableName.Any(c => c < '!' || c > '~') || options.MaxQueryRows <= 0) throw Invalid(); StorageSchema.ValidateNamespace(options.Namespace); this.client = client; this.options = options;
    }
    private string Partition(StorageEntity entity) => options.Namespace + ":" + StorageSchema.Definition(entity).Name;
    private Dictionary<string, AttributeValue> Key(StorageEntity entity, string id) => new() { { "pk", new() { S = Partition(entity) } }, { "sk", new() { S = id } } };
    private static StorageProviderException Provider() => new("Customer DynamoDB operation failed; a write outcome may be uncertain.");
    private static StorageValidationException Invalid() => new("Invalid customer DynamoDB configuration or operation.");
    private static async Task<T> Send<T>(Func<Task<T>> send)
    {
        try { return await send().ConfigureAwait(false); } catch (AmazonServiceException) { throw Provider(); } catch (AmazonClientException) { throw Provider(); } catch (HttpRequestException) { throw Provider(); } catch (IOException) { throw Provider(); }
    }
    public async Task SetupAsync(CancellationToken cancellation = default)
    {
        try
        {
            var response = await client.DescribeTableAsync(new DescribeTableRequest { TableName = options.TableName }, cancellation).ConfigureAwait(false); var keys = response.Table?.KeySchema; if (keys is null || keys.Count != 2 || !keys.Any(k => k.AttributeName == "pk" && k.KeyType == KeyType.HASH) || !keys.Any(k => k.AttributeName == "sk" && k.KeyType == KeyType.RANGE)) throw Provider();
        }
        catch (ResourceNotFoundException) when (options.CreateTable)
        {
            await Send(() => client.CreateTableAsync(new CreateTableRequest { TableName = options.TableName, BillingMode = BillingMode.PAY_PER_REQUEST, KeySchema = new() { new("pk", KeyType.HASH), new("sk", KeyType.RANGE) }, AttributeDefinitions = new() { new("pk", ScalarAttributeType.S), new("sk", ScalarAttributeType.S) } }, cancellation)).ConfigureAwait(false);
        }
        catch (AmazonServiceException) { throw Provider(); }
        catch (AmazonClientException) { throw Provider(); }
        catch (HttpRequestException) { throw Provider(); }
    }
    private static AttributeValue Attribute(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Null => new() { NULL = true },
        JsonValueKind.True or JsonValueKind.False => new() { BOOL = value.GetBoolean() },
        JsonValueKind.String => new() { S = value.GetString() },
        JsonValueKind.Number => new() { N = value.GetRawText() },
        JsonValueKind.Array => new() { L = value.EnumerateArray().Select(Attribute).ToList() },
        JsonValueKind.Object => new() { M = value.EnumerateObject().ToDictionary(p => p.Name, p => Attribute(p.Value), StringComparer.Ordinal) },
        _ => throw Invalid()
    };
    private static JsonElement Json(AttributeValue value)
    {
        if (value.NULL == true) return JsonSerializer.SerializeToElement<object?>(null); if (value.S is { } text) return JsonSerializer.SerializeToElement(text); if (value.N is { } number) { try { using var parsed = JsonDocument.Parse(number); if (parsed.RootElement.ValueKind != JsonValueKind.Number || !double.IsFinite(parsed.RootElement.GetDouble())) throw Provider(); return parsed.RootElement.Clone(); } catch (JsonException) { throw Provider(); } catch (FormatException) { throw Provider(); } }
        if (value.IsBOOLSet) return JsonSerializer.SerializeToElement(value.BOOL); if (value.IsMSet) return JsonSerializer.SerializeToElement(value.M.ToDictionary(p => p.Key, p => Json(p.Value), StringComparer.Ordinal)); if (value.IsLSet) return JsonSerializer.SerializeToElement(value.L.Select(Json).ToArray()); throw Provider();
    }
    private static StorageRow Snapshot(StorageRow row) => new(row.Id, row.Revision, row.Versions.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal), row.Fields.ToDictionary(p => p.Key, p => p.Value.Clone(), StringComparer.Ordinal));
    private static void Validate(IReadOnlyList<StorageWrite> writes)
    {
        if (writes.Count > 100) throw Invalid(); var slots = new HashSet<(StorageEntity, string)>(); foreach (var write in writes) { var (entity, id, expected) = write switch { StoragePut p => (p.Entity, p.Row.Id, p.ExpectedRev), StorageRowDelete d => (d.Entity, d.Id, d.ExpectedRev), _ => throw Invalid() }; var definition = StorageSchema.Definition(entity); if (!slots.Add((entity, id)) || expected is < 1 or > 9007199254740991) throw Invalid(); if (write is StoragePut put) { var row = put.Row; if (row.Revision is < 1 or > 9007199254740991 || row.Fields.Keys.Any(k => k is "_id" or "_rev" or "_v") || row.Versions.Values.Any(v => !double.IsFinite(v))) throw Invalid(); var key = definition.Key.ToDictionary(k => k, k => row.Fields.TryGetValue(k, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()! : throw Invalid()); if (StorageSchema.EncodeKey(entity, key) != id) throw Invalid(); } }
    }
    private StorageRow Decode(StorageEntity entity, Dictionary<string, AttributeValue> item)
    {
        if (!item.TryGetValue("pk", out var pk) || pk.S != Partition(entity) || !item.TryGetValue("sk", out var sk) || sk.S is null || !item.TryGetValue("row", out var body)) throw Provider();
        try { var row = Json(body).Deserialize<StorageRow>() ?? throw Provider(); if (row.Id != sk.S) throw Provider(); Validate(new StorageWrite[] { new StoragePut(entity, row, null) }); return row; } catch (JsonException) { throw Provider(); } catch (InvalidOperationException) { throw Provider(); } catch (KeyNotFoundException) { throw Provider(); } catch (FormatException) { throw Provider(); } catch (OverflowException) { throw Provider(); } catch (StorageValidationException) { throw Provider(); }
    }
    public async Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default)
    {
        _ = StorageSchema.Definition(entity); var wanted = ids.Distinct(StringComparer.Ordinal).ToArray(); var result = new Dictionary<string, StorageRow>(StringComparer.Ordinal);
        foreach (var chunk in wanted.Chunk(100))
        {
            var allowed = new HashSet<string>(chunk, StringComparer.Ordinal); var pending = new Dictionary<string, KeysAndAttributes> { { options.TableName, new() { ConsistentRead = true, Keys = chunk.Select(id => Key(entity, id)).ToList() } } };
            for (var attempt = 0; pending.Count > 0; attempt++)
            {
                if (attempt >= 8) throw Provider(); var response = await Send(() => client.BatchGetItemAsync(new BatchGetItemRequest { RequestItems = pending }, cancellation)).ConfigureAwait(false);
                if (response.Responses is { } tables) { if (tables.Keys.Any(t => t != options.TableName)) throw Provider(); if (tables.TryGetValue(options.TableName, out var items)) foreach (var item in items) { var row = Decode(entity, item); if (!allowed.Contains(row.Id) || !result.TryAdd(row.Id, row)) throw Provider(); } }
                pending = response.UnprocessedKeys ?? new(); if (pending.Count > 0) { if (pending.Count != 1 || !pending.TryGetValue(options.TableName, out var next) || next.Keys is null || next.Keys.Any(k => !k.TryGetValue("pk", out var pk) || pk.S != Partition(entity) || !k.TryGetValue("sk", out var sk) || !allowed.Contains(sk.S))) throw Provider(); await Task.Delay(Math.Min(500, 10 << attempt), cancellation).ConfigureAwait(false); }
            }
        }
        return result;
    }
    public async Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default)
    {
        var snapshot = writes.Select(w => w switch { StoragePut p => (StorageWrite)new StoragePut(p.Entity, Snapshot(p.Row), p.ExpectedRev), StorageRowDelete d => d, _ => throw Invalid() }).ToArray(); Validate(snapshot); if (snapshot.Length == 0) return new(true); var items = new List<TransactWriteItem>();
        foreach (var write in snapshot)
        {
            var (entity, id, expected) = write switch { StoragePut p => (p.Entity, p.Row.Id, p.ExpectedRev), StorageRowDelete d => (d.Entity, d.Id, d.ExpectedRev), _ => throw Invalid() }; var condition = write is StoragePut && !expected.HasValue ? "attribute_not_exists(pk)" : expected.HasValue ? "#row.#rev = :rev" : null; var names = expected.HasValue ? new Dictionary<string, string> { { "#row", "row" }, { "#rev", "_rev" } } : null; var values = expected.HasValue ? new Dictionary<string, AttributeValue> { { ":rev", new() { N = expected.Value.ToString(System.Globalization.CultureInfo.InvariantCulture) } } } : null;
            if (write is StoragePut put) { var item = Key(entity, id); item["row"] = Attribute(JsonSerializer.SerializeToElement(put.Row)); items.Add(new() { Put = new() { TableName = options.TableName, Item = item, ConditionExpression = condition, ExpressionAttributeNames = names, ExpressionAttributeValues = values } }); } else items.Add(new() { Delete = new() { TableName = options.TableName, Key = Key(entity, id), ConditionExpression = condition, ExpressionAttributeNames = names, ExpressionAttributeValues = values } });
        }
        try { await client.TransactWriteItemsAsync(new() { TransactItems = items, ClientRequestToken = Guid.NewGuid().ToString() }, cancellation).ConfigureAwait(false); return new(true); } catch (TransactionCanceledException error) when (error.CancellationReasons?.Any(r => r.Code is "ConditionalCheckFailed" or "TransactionConflict") == true) { return new(false, snapshot.Select(w => w is StoragePut p ? p.Row.Id : ((StorageRowDelete)w).Id).ToArray()); } catch (AmazonServiceException) { throw Provider(); } catch (AmazonClientException) { throw Provider(); } catch (HttpRequestException) { throw Provider(); }
    }
    private static IReadOnlyList<StorageRow> Filter(StorageEntity entity, IEnumerable<StorageRow> rows, StorageIndexQuery query, StorageIndex index)
    {
        static double Sort(StorageRow row, string field) => row.Fields.TryGetValue(field, out var value) && value.ValueKind == JsonValueKind.Number ? value.GetDouble() : 0; static int Compare(double a, string aid, double b, string bid) => a != b ? a.CompareTo(b) : StringComparer.Ordinal.Compare(aid, bid); var descending = query.Order == "desc"; var matches = new List<StorageRow>(); foreach (var row in rows) { if (index.EqualFields.Any(n => !row.Fields.TryGetValue(n, out var value) || value.ValueKind != JsonValueKind.String || value.GetString() != query.EqualValues[n])) continue; var sort = Sort(row, index.Sort); if (query.Range is { } range && (range.Gt.HasValue && sort <= range.Gt || range.Gte.HasValue && sort < range.Gte || range.Lt.HasValue && sort >= range.Lt || range.Lte.HasValue && sort > range.Lte)) continue; if (query.After is { } after) { var compare = Compare(sort, row.Id, after.Sort, after.Id); if (descending ? compare >= 0 : compare <= 0) continue; } matches.Add(row); }
        matches.Sort((a, b) => { var order = Compare(Sort(a, index.Sort), a.Id, Sort(b, index.Sort), b.Id); return descending ? -order : order; }); return matches.Take(query.Limit).ToArray();
    }
    public async Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default)
    {
        query = query with { EqualValues = query.EqualValues.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal) }; var index = StorageSchema.Definition(entity).Indexes.FirstOrDefault(i => i.Name == query.Index) ?? throw Invalid(); if (query.Limit is < 0 or > 100000 || index.EqualFields.Any(n => !query.EqualValues.TryGetValue(n, out var value) || string.IsNullOrEmpty(value)) || query.After is { } after && (!double.IsFinite(after.Sort) || string.IsNullOrEmpty(after.Id)) || query.Range is { } range && new[] { range.Gt, range.Gte, range.Lt, range.Lte }.Any(v => v.HasValue && !double.IsFinite(v.Value))) throw Invalid(); if (query.Limit == 0) return Array.Empty<StorageRow>();
        var rows = new List<StorageRow>(); var seen = new HashSet<string>(StringComparer.Ordinal); Dictionary<string, AttributeValue>? cursor = null; string? last = null;
        do { var response = await Send(() => client.QueryAsync(new QueryRequest { TableName = options.TableName, KeyConditionExpression = "pk = :pk", ExpressionAttributeValues = new() { { ":pk", new() { S = Partition(entity) } } }, ConsistentRead = true, Limit = 1000, ExclusiveStartKey = cursor }, cancellation)).ConfigureAwait(false); foreach (var item in response.Items ?? new()) { var row = Decode(entity, item); if (!seen.Add(row.Id) || rows.Count >= options.MaxQueryRows) throw Provider(); rows.Add(row); } cursor = response.LastEvaluatedKey; if (cursor?.Count > 0) { if (response.Items is null || response.Items.Count == 0) throw Provider(); if (!cursor.TryGetValue("pk", out var pk) || pk.S != Partition(entity) || !cursor.TryGetValue("sk", out var sk) || string.IsNullOrEmpty(sk.S) || sk.S == last) throw Provider(); last = sk.S; } } while (cursor?.Count > 0);
        return Filter(entity, rows, query, index);
    }
}
