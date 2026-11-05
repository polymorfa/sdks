using System.Text.Json;
namespace Polymorfa.Sdk.Storage;

public sealed class MemoryStorageAdapter : IStorageAdapter
{
    private readonly object gate = new(); private readonly Dictionary<StorageEntity, Dictionary<string, StorageRow>> tables = new();
    public string Name => "memory"; public StorageCapabilities Capabilities => new(true, 10000);
    public Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default)
    {
        cancellation.ThrowIfCancellationRequested(); _ = StorageSchema.Definition(entity); lock (gate) { var rows = new Dictionary<string, StorageRow>(StringComparer.Ordinal); if (tables.TryGetValue(entity, out var table)) foreach (var id in ids) if (table.TryGetValue(id, out var row)) rows[id] = Clone(row); return Task.FromResult<IReadOnlyDictionary<string, StorageRow>>(rows); }
    }
    public Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default)
    {
        cancellation.ThrowIfCancellationRequested(); StorageValidation.ValidateCommit(writes, 10000); lock (gate)
        {
            var conflicts = new List<string>(); foreach (var write in writes) { var (entity, id, expected, isPut) = write switch { StoragePut p => (p.Entity, p.Row.Id, p.ExpectedRev, true), StorageRowDelete d => (d.Entity, d.Id, d.ExpectedRev, false), _ => throw new StorageValidationException("Unknown row write.") }; tables.TryGetValue(entity, out var table); var current = table is not null && table.TryGetValue(id, out var row) ? row : null; var conflict = isPut && !expected.HasValue ? current is not null : expected.HasValue && current?.Revision != expected; if (conflict) conflicts.Add(id); }
            if (conflicts.Count > 0) return Task.FromResult(new StorageCommitResult(false, conflicts));
            foreach (var write in writes) { switch (write) { case StoragePut put: if (!tables.TryGetValue(put.Entity, out var table)) tables[put.Entity] = table = new(StringComparer.Ordinal); table[put.Row.Id] = Clone(put.Row); break; case StorageRowDelete delete: if (tables.TryGetValue(delete.Entity, out var existing)) existing.Remove(delete.Id); break; } }
            return Task.FromResult(new StorageCommitResult(true));
        }
    }
    public Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default)
    {
        cancellation.ThrowIfCancellationRequested(); lock (gate) { var rows = tables.TryGetValue(entity, out var table) ? table.Values : Enumerable.Empty<StorageRow>(); return Task.FromResult<IReadOnlyList<StorageRow>>(StorageValidation.FilterRows(entity, rows, query).Select(Clone).ToArray()); }
    }
    public IReadOnlyList<StorageRow> Rows(StorageEntity entity) { lock (gate) { return tables.TryGetValue(entity, out var table) ? table.Values.Select(Clone).ToArray() : Array.Empty<StorageRow>(); } }
    internal static StorageRow Clone(StorageRow row) => new(row.Id, row.Revision, new Dictionary<string, double>(row.Versions, StringComparer.Ordinal), row.Fields.ToDictionary(p => p.Key, p => p.Value.Clone(), StringComparer.Ordinal));
}
internal static class StorageValidation
{
    internal static void ValidateCommit(IReadOnlyList<StorageWrite> writes, int maximum)
    {
        if (writes.Count > maximum) throw new StorageValidationException("Commit exceeds atomic capacity."); var seen = new HashSet<(StorageEntity, string)>(); foreach (var write in writes)
        {
            var (entity, id, revision) = write switch { StoragePut p => (p.Entity, p.Row.Id, p.ExpectedRev), StorageRowDelete d => (d.Entity, d.Id, d.ExpectedRev), _ => throw new StorageValidationException("Unknown row write.") }; _ = StorageSchema.Definition(entity); if (!seen.Add((entity, id))) throw new StorageValidationException("Commit writes a row twice."); if (revision is < 1 or > 9007199254740991) throw new StorageValidationException("Invalid expected revision."); if (write is StoragePut put) { var key = StorageSchema.Definition(entity).Key.ToDictionary(name => name, name => put.Row.Fields.TryGetValue(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : throw new StorageValidationException("Invalid row key."), StringComparer.Ordinal); if (StorageSchema.EncodeKey(entity, key) != id || put.Row.Revision is < 1 or > 9007199254740991) throw new StorageValidationException("Invalid conditional row."); }
        }
    }
    internal static StorageIndex ValidateQuery(StorageEntity entity, StorageIndexQuery query)
    {
        var index = StorageSchema.Definition(entity).Indexes.FirstOrDefault(i => i.Name == query.Index) ?? throw new StorageValidationException("Unknown storage index."); if (query.Limit is < 0 or > 100000 || index.EqualFields.Any(n => !query.EqualValues.TryGetValue(n, out var value) || string.IsNullOrEmpty(value))) throw new StorageValidationException("Incomplete index scope or limit."); if (query.Range is { } range && new[] { range.Gt, range.Gte, range.Lt, range.Lte }.Any(v => v.HasValue && !double.IsFinite(v.Value))) throw new StorageValidationException("Invalid index range."); if (query.After is { } after && (!double.IsFinite(after.Sort) || string.IsNullOrEmpty(after.Id))) throw new StorageValidationException("Invalid index cursor."); return index;
    }
    internal static double Sort(StorageRow row, string field) => row.Fields.TryGetValue(field, out var value) && value.ValueKind == JsonValueKind.Number ? value.GetDouble() : 0;
    internal static int CompareSort(double a, string aId, double b, string bId) => a != b ? a.CompareTo(b) : StringComparer.Ordinal.Compare(aId, bId);
    internal static IReadOnlyList<StorageRow> FilterRows(StorageEntity entity, IEnumerable<StorageRow> rows, StorageIndexQuery query)
    {
        var index = ValidateQuery(entity, query); var descending = query.Order == "desc"; var matched = new List<StorageRow>(); foreach (var row in rows)
        {
            if (index.EqualFields.Any(n => !row.Fields.TryGetValue(n, out var value) || value.ValueKind != JsonValueKind.String || value.GetString() != query.EqualValues[n])) continue; var sort = Sort(row, index.Sort); if (query.Range is { } range && (range.Gt.HasValue && sort <= range.Gt || range.Gte.HasValue && sort < range.Gte || range.Lt.HasValue && sort >= range.Lt || range.Lte.HasValue && sort > range.Lte)) continue; if (query.After is { } after) { var compare = CompareSort(sort, row.Id, after.Sort, after.Id); if (descending ? compare >= 0 : compare <= 0) continue; }
            matched.Add(row);
        }
        matched.Sort((a, b) => { var compare = CompareSort(Sort(a, index.Sort), a.Id, Sort(b, index.Sort), b.Id); return descending ? -compare : compare; }); return matched.Take(query.Limit).ToArray();
    }
}
