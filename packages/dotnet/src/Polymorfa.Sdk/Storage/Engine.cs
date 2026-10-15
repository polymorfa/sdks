using System.Text.Json;
using System.Diagnostics;
namespace Polymorfa.Sdk.Storage;

public sealed record StorageEngineOptions
{
    public int MaxRetries { get; init; } = 8;
    public int ClearPageSize { get; init; } = 200;
    public TimeSpan LeaseDuration { get; init; } = TimeSpan.FromSeconds(30);
    public TimeSpan LeaseWait { get; init; } = TimeSpan.FromSeconds(30);
    public Func<double> Now { get; init; } = () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
public sealed record StorageApplyResult(bool Applied, int Writes);
public sealed record StorageQueryPage(IReadOnlyList<IReadOnlyDictionary<string, JsonElement>> Rows, StorageIndexCursor? Next);
public sealed record StorageSavedCheckpoint(string Cursor, JsonElement Position, double? UpdatedAt);
/// <summary>Customer-owned data. Large batches span fenced commits and store their deduplication marker last.</summary>
public sealed class CustomerStorage
{
    public IStorageAdapter Adapter { get; }
    private readonly StorageEngineOptions options; private readonly int commitSize;
    private sealed class Lease(StorageRow row) { internal StorageRow Row = row; internal bool Lost; }
    public CustomerStorage(IStorageAdapter adapter, StorageEngineOptions? options = null)
    {
        this.options = options ?? new(); var capacity = adapter.Capabilities; if (!capacity.AtomicCommit || capacity.MaxCommitSize < 2 || this.options.MaxRetries is < 0 or > 100 || this.options.ClearPageSize is < 1 or > 10000 || this.options.LeaseDuration <= TimeSpan.Zero || this.options.LeaseWait < TimeSpan.Zero || this.options.LeaseDuration.TotalMilliseconds > StorageMerge.FinalVersion || this.options.LeaseWait.TotalMilliseconds > StorageMerge.FinalVersion) throw new StorageValidationException("Invalid storage capabilities or bounds."); Adapter = adapter; commitSize = capacity.MaxCommitSize - 1;
    }
    private static IReadOnlyDictionary<string, string> Key(params (string Name, string Value)[] values) => values.ToDictionary(p => p.Name, p => p.Value, StringComparer.Ordinal);
    private static JsonElement Value<T>(T value) => JsonSerializer.SerializeToElement(value);
    private double Now() { var time = options.Now(); if (!double.IsFinite(time)) throw new StorageValidationException("Storage clock must be finite."); return time; }
    private static long Revision(StorageRow? row) { if (row?.Revision >= 9007199254740991) throw new StorageValidationException("Storage revision overflow."); return (row?.Revision ?? 0) + 1; }
    private static Dictionary<string, JsonElement> Fields(StorageRow row) => row.Fields.ToDictionary(p => p.Key, p => p.Value.Clone(), StringComparer.Ordinal);
    private static string? Text(StorageRow? row, string field) => row is not null && row.Fields.TryGetValue(field, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static double Number(StorageRow row, string field, double fallback = 0) => row.Fields.TryGetValue(field, out var value) && value.ValueKind == JsonValueKind.Number ? value.GetDouble() : fallback;
    private async Task<Lease> Acquire(string session, CancellationToken cancellation)
    {
        var key = Key(("sessionId", session)); var id = StorageSchema.EncodeKey(StorageEntity.Leases, key); var owner = Guid.NewGuid().ToString(); var elapsed = Stopwatch.StartNew(); while (true)
        {
            var rows = await Adapter.GetAsync(StorageEntity.Leases, new[] { id }, cancellation).ConfigureAwait(false); rows.TryGetValue(id, out var existing); var now = Now(); if (existing is null || string.IsNullOrEmpty(Text(existing, "owner")) || Number(existing, "expiresAt") <= now)
            {
                var row = existing ?? StorageMerge.EmptyRow(StorageEntity.Leases, key); var fields = Fields(row); fields["owner"] = Value(owner); fields["expiresAt"] = Value(now + options.LeaseDuration.TotalMilliseconds); row = row with { Revision = Revision(existing), Fields = fields }; var writes = new StorageWrite[] { new StoragePut(StorageEntity.Leases, row, existing?.Revision) }; var result = await Adapter.CommitAsync(writes, cancellation).ConfigureAwait(false); ValidateReceipt(result, writes); if (result.Ok) return new(row);
            }
            if (elapsed.Elapsed >= options.LeaseWait) throw new StorageLeaseLostException(); await Task.Delay(5, cancellation).ConfigureAwait(false);
        }
    }
    private async Task<StorageCommitResult> FencedCommit(Lease lease, IReadOnlyList<StorageWrite> writes, CancellationToken cancellation)
    {
        var now = Now(); if (lease.Lost || Number(lease.Row, "expiresAt") <= now) throw new StorageLeaseLostException(); var fields = Fields(lease.Row); fields["expiresAt"] = Value(now + options.LeaseDuration.TotalMilliseconds); var next = lease.Row with { Revision = Revision(lease.Row), Fields = fields }; var all = writes.Append(new StoragePut(StorageEntity.Leases, next, lease.Row.Revision)).ToArray(); var result = await Adapter.CommitAsync(all, cancellation).ConfigureAwait(false); ValidateReceipt(result, all); if (result.Ok) lease.Row = next;
        else if (result.Conflicts!.Contains(lease.Row.Id)) { var rows = await Adapter.GetAsync(StorageEntity.Leases, new[] { lease.Row.Id }, cancellation).ConfigureAwait(false); if (!rows.TryGetValue(lease.Row.Id, out var current) || current.Revision != lease.Row.Revision || Text(current, "owner") != Text(lease.Row, "owner")) { lease.Lost = true; throw new StorageLeaseLostException(); } }
        return result;
    }
    private async Task RenewIfNeeded(Lease lease, CancellationToken cancellation)
    {
        if (Number(lease.Row, "expiresAt") - Now() > options.LeaseDuration.TotalMilliseconds / 2) return;
        var result = await FencedCommit(lease, Array.Empty<StorageWrite>(), cancellation).ConfigureAwait(false);
        if (!result.Ok) throw new StorageConflictException(result.Conflicts!);
    }
    private async Task Release(Lease lease)
    {
        var fields = Fields(lease.Row); fields["owner"] = StorageMerge.Null; fields["expiresAt"] = Value(0); var row = lease.Row with { Revision = Revision(lease.Row), Fields = fields }; var writes = new StorageWrite[] { new StoragePut(StorageEntity.Leases, row, lease.Row.Revision) }; ValidateReceipt(await Adapter.CommitAsync(writes).ConfigureAwait(false), writes);
    }
    private static void ValidateReceipt(StorageCommitResult result, IReadOnlyList<StorageWrite> writes)
    {
        var ids = writes.Select(w => w switch { StoragePut p => p.Row.Id, StorageRowDelete d => d.Id, _ => "" }).ToHashSet(StringComparer.Ordinal); if (result.Ok ? result.Conflicts?.Count > 0 : result.Conflicts is null || result.Conflicts.Count == 0 || result.Conflicts.Any(id => !ids.Contains(id))) throw new StorageProviderException("Adapter returned an invalid conditional commit receipt.");
    }
    private async Task<IReadOnlyDictionary<string, StorageRow>> ReadMany(StorageEntity entity, IReadOnlyList<string> ids, Lease lease, CancellationToken cancellation)
    {
        var result = new Dictionary<string, StorageRow>(StringComparer.Ordinal); foreach (var group in ids.Chunk(500)) { await RenewIfNeeded(lease, cancellation).ConfigureAwait(false); foreach (var pair in await Adapter.GetAsync(entity, group, cancellation).ConfigureAwait(false)) result[pair.Key] = pair.Value; }
        return result;
    }
    private static (StorageEntity Entity, string Id) Slot(StorageOperation operation) => operation switch { StorageUpsert o => (o.Entity, StorageSchema.EncodeKey(o.Entity, o.Key)), StoragePatch o => (o.Entity, StorageSchema.EncodeKey(o.Entity, o.Key)), StorageDelete o => (o.Entity, StorageSchema.EncodeKey(o.Entity, o.Key)), StorageCheckpoint o => (StorageEntity.Checkpoints, StorageSchema.EncodeKey(StorageEntity.Checkpoints, Key(("sessionId", o.SessionId), ("stream", o.Stream)))), _ => throw new StorageValidationException("Unexpected clear operation.") };
    private static StorageGuard? Guard(StorageOperation operation) => operation switch { StorageUpsert o => o.Guard, StoragePatch o => o.Guard, _ => null };
    private static bool SameRow(StorageEntity entity, StorageRow a, StorageRow b) => a.Versions.Count == b.Versions.Count && a.Versions.All(p => b.Versions.TryGetValue(p.Key, out var v) && v == p.Value) && StorageSchema.Definition(entity).Fields.Keys.All(name => StorageMerge.CanonicalJson(a.Fields.TryGetValue(name, out var av) ? av : StorageMerge.Null) == StorageMerge.CanonicalJson(b.Fields.TryGetValue(name, out var bv) ? bv : StorageMerge.Null));
    private async Task<IReadOnlyList<StorageWrite>> Plan(IReadOnlyList<StorageOperation> operations, Lease lease, CancellationToken cancellation)
    {
        var wanted = operations.Select(Slot).Distinct().GroupBy(s => s.Entity); var original = new Dictionary<(StorageEntity, string), StorageRow?>(); foreach (var entity in wanted) { var ids = entity.Select(s => s.Id).ToArray(); var rows = await ReadMany(entity.Key, ids, lease, cancellation).ConfigureAwait(false); foreach (var id in ids) original[(entity.Key, id)] = rows.TryGetValue(id, out var row) ? row : null; }
        var stored = new Dictionary<(StorageEntity, string), StorageRow?>(original); var deleted = new HashSet<(StorageEntity, string)>(); foreach (var operation in operations)
        {
            var slot = Slot(operation); stored.TryGetValue(slot, out var current); switch (operation)
            {
                case StorageDelete: stored[slot] = null; deleted.Add(slot); break;
                case StorageCheckpoint checkpoint:
                    if (checkpoint.ExpectedCursor.IsSpecified && checkpoint.ExpectedCursor.Value != Text(current, "cursor")) throw new StorageCheckpointConflictException(); var checkpointRow = current ?? StorageMerge.EmptyRow(StorageEntity.Checkpoints, Key(("sessionId", checkpoint.SessionId), ("stream", checkpoint.Stream))); var fields = Fields(checkpointRow); fields["cursor"] = Value(checkpoint.Cursor); fields["position"] = checkpoint.Position?.Clone() ?? StorageMerge.Null; fields["updatedAt"] = Value(checkpoint.UpdatedAt); stored[slot] = checkpointRow with { Fields = fields }; deleted.Remove(slot); break;
                case StorageUpsert upsert: Merge(upsert.Entity, upsert.Key, upsert.Fields); break;
                case StoragePatch patch: if (current is not null) Merge(patch.Entity, patch.Key, patch.Fields); break;
                default: throw new StorageValidationException("Unknown operation.");
            }
            void Merge(StorageEntity entity, IReadOnlyDictionary<string, string> key, IReadOnlyDictionary<string, StorageFieldWrite> writes) { var merged = StorageMerge.MergeFields(entity, current ?? StorageMerge.EmptyRow(entity, key), writes); if (merged.Changed || current is null) stored[slot] = merged.Row; deleted.Remove(slot); }
        }
        var result = new List<StorageWrite>(); foreach (var (slot, row) in stored) { var before = original[slot]; if (row is null) { if (before is not null && deleted.Contains(slot)) result.Add(new StorageRowDelete(slot.Item1, slot.Item2, before.Revision)); } else if (before is null || !SameRow(slot.Item1, before, row)) result.Add(new StoragePut(slot.Item1, row with { Revision = Revision(before) }, before?.Revision)); }
        return result;
    }
    private async Task<int> CommitRetry(IReadOnlyList<StorageOperation> operations, IReadOnlyList<StorageWrite> extra, Lease lease, CancellationToken cancellation)
    {
        IReadOnlyList<string> conflicts = Array.Empty<string>(); for (var attempt = 0; attempt <= options.MaxRetries; attempt++)
        {
            var writes = (await Plan(operations, lease, cancellation).ConfigureAwait(false)).Concat(extra).ToArray(); if (writes.Length == 0) return 0; var failed = new List<string>(); foreach (var group in writes.Chunk(commitSize)) { var result = await FencedCommit(lease, group, cancellation).ConfigureAwait(false); if (!result.Ok) { failed.AddRange(result.Conflicts!); break; } }
            if (failed.Count == 0) return writes.Length; conflicts = failed; await Task.Delay((int)Math.Min(200, 5 * Math.Pow(2, attempt)), cancellation).ConfigureAwait(false);
        }
        throw new StorageConflictException(conflicts);
    }
    private async Task<int> ApplyRows(IReadOnlyList<StorageOperation> operations, IReadOnlyList<StorageWrite> extra, Lease lease, CancellationToken cancellation)
    {
        if (operations.Count == 0) return await CommitRetry(operations, extra, lease, cancellation).ConfigureAwait(false); var size = Math.Max(commitSize, 500); var total = 0; for (var offset = 0; offset < operations.Count; offset += size) total += await CommitRetry(operations.Skip(offset).Take(size).ToArray(), offset + size >= operations.Count ? extra : Array.Empty<StorageWrite>(), lease, cancellation).ConfigureAwait(false); return total;
    }
    private async Task<int> ClearChat(StorageClearChat operation, Lease lease, CancellationToken cancellation)
    {
        var removed = 0; while (true)
        {
            await RenewIfNeeded(lease, cancellation).ConfigureAwait(false);
            var messages = await Adapter.QueryAsync(StorageEntity.Messages, new("by_chat", Key(("sessionId", operation.SessionId), ("chatId", operation.ChatId)), options.ClearPageSize, new(Lte: operation.UpTo), "asc"), cancellation).ConfigureAwait(false); if (messages.Count == 0) return removed; var deletes = new List<StorageOperation>(); foreach (var message in messages)
            {
                var id = Text(message, "messageId") ?? throw new StorageValidationException("Invalid stored message ID."); var key = Key(("sessionId", operation.SessionId), ("messageId", id)); deletes.Add(new StorageDelete(StorageEntity.Media, key)); foreach (var entity in new[] { StorageEntity.Reactions, StorageEntity.Receipts, StorageEntity.PollVotes }) while (true)
                    {
                        await RenewIfNeeded(lease, cancellation).ConfigureAwait(false);
                        var children = await Adapter.QueryAsync(entity, new("by_message", key, 500, Order: "asc"), cancellation).ConfigureAwait(false); if (children.Count == 0) break; var writes = children.Select(row => (StorageWrite)new StorageRowDelete(entity, row.Id)).ToArray(); foreach (var group in writes.Chunk(commitSize)) { var result = await FencedCommit(lease, group, cancellation).ConfigureAwait(false); if (!result.Ok) throw new StorageConflictException(result.Conflicts!); }
                        removed += children.Count; if (children.Count < 500) break;
                    }
                deletes.Add(new StorageDelete(StorageEntity.Messages, key));
            }
            removed += await ApplyRows(deletes, Array.Empty<StorageWrite>(), lease, cancellation).ConfigureAwait(false);
        }
    }
    private async Task<IReadOnlyList<StorageOperation>> Watermarks(IReadOnlyList<StorageOperation> operations, Lease lease, CancellationToken cancellation)
    {
        var ids = operations.Select(Guard).Where(g => g is not null).Select(g => StorageSchema.EncodeKey(StorageEntity.Chats, Key(("sessionId", g!.SessionId), ("chatId", g.ChatId)))).Distinct().ToArray(); if (ids.Length == 0) return operations; var chats = await ReadMany(StorageEntity.Chats, ids, lease, cancellation).ConfigureAwait(false); return operations.Where(op => { var guard = Guard(op); if (guard is null) return true; var id = StorageSchema.EncodeKey(StorageEntity.Chats, Key(("sessionId", guard.SessionId), ("chatId", guard.ChatId))); return !chats.TryGetValue(id, out var chat) || guard.Timestamp > Math.Max(Number(chat, "clearedAt", double.NegativeInfinity), Number(chat, "deletedAt", double.NegativeInfinity)); }).ToArray();
    }
    public async Task<StorageApplyResult> ApplyAsync(StorageBatch batch, CancellationToken cancellation = default)
    {
        batch = Snapshot(batch);
        if (string.IsNullOrEmpty(batch.SessionId)) throw new StorageValidationException("A storage session is required."); foreach (var operation in batch.Operations)
        {
            var session = operation switch { StorageUpsert o => o.Key.TryGetValue("sessionId", out var value) ? value : null, StoragePatch o => o.Key.TryGetValue("sessionId", out var value) ? value : null, StorageDelete o => o.Key.TryGetValue("sessionId", out var value) ? value : null, StorageCheckpoint o => o.SessionId, StorageClearChat o => o.SessionId, _ => null }; if (session != batch.SessionId || Guard(operation) is { } guard && guard.SessionId != batch.SessionId) throw new StorageValidationException("A storage batch cannot write a foreign session."); if (operation is not (StorageClearChat or StorageCheckpoint) && Slot(operation).Entity == StorageEntity.Leases) throw new StorageValidationException("Lease rows are owned by the engine.");
        }
        var lease = await Acquire(batch.SessionId, cancellation).ConfigureAwait(false);
        StorageApplyResult result;
        try { result = await ApplyLeased(batch, lease, cancellation).ConfigureAwait(false); } catch { try { await Release(lease).ConfigureAwait(false); } catch (StorageException) { } throw; }
        await Release(lease).ConfigureAwait(false); return result;
    }
    private static StorageBatch Snapshot(StorageBatch batch)
    {
        static IReadOnlyDictionary<string, StorageFieldWrite> Copy(IReadOnlyDictionary<string, StorageFieldWrite> fields) => fields.ToDictionary(p => p.Key, p => p.Value with { Value = p.Value.Value.Clone() }, StringComparer.Ordinal);
        return batch with
        {
            Operations = batch.Operations.Select(operation => (StorageOperation)(operation switch
            {
                StorageUpsert o => o with { Key = new Dictionary<string, string>(o.Key, StringComparer.Ordinal), Fields = Copy(o.Fields) },
                StoragePatch o => o with { Key = new Dictionary<string, string>(o.Key, StringComparer.Ordinal), Fields = Copy(o.Fields) },
                StorageDelete o => o with { Key = new Dictionary<string, string>(o.Key, StringComparer.Ordinal) },
                StorageCheckpoint o => o with { Position = o.Position?.Clone() },
                StorageClearChat o => o,
                _ => throw new StorageValidationException("Unknown operation.")
            })).ToArray()
        };
    }
    private async Task<StorageApplyResult> ApplyLeased(StorageBatch batch, Lease lease, CancellationToken cancellation)
    {
        var marker = new List<StorageWrite>(); if (batch.EventId is { } id) { await RenewIfNeeded(lease, cancellation).ConfigureAwait(false); var row = StorageMerge.EmptyRow(StorageEntity.Events, Key(("sessionId", batch.SessionId), ("eventId", id))); if ((await Adapter.GetAsync(StorageEntity.Events, new[] { row.Id }, cancellation).ConfigureAwait(false)).ContainsKey(row.Id)) return new(false, 0); var fields = Fields(row); fields["type"] = Value(batch.EventType); marker.Add(new StoragePut(StorageEntity.Events, row with { Revision = 1, Fields = fields }, null)); }
        var plain = batch.Operations.Where(op => op is not StorageClearChat && Guard(op) is null).ToArray(); var clears = batch.Operations.OfType<StorageClearChat>().ToArray(); var guarded = batch.Operations.Where(op => Guard(op) is not null).ToArray(); var writes = await ApplyRows(plain, Array.Empty<StorageWrite>(), lease, cancellation).ConfigureAwait(false); foreach (var clear in clears) writes += await ClearChat(clear, lease, cancellation).ConfigureAwait(false); var kept = await Watermarks(guarded, lease, cancellation).ConfigureAwait(false); try { writes += await ApplyRows(kept, marker, lease, cancellation).ConfigureAwait(false); } catch (StorageConflictException error) when (marker.Count == 1 && error.Ids.Count == 1 && error.Ids[0] == ((StoragePut)marker[0]).Row.Id) { return new(false, writes); }
        return new(true, writes);
    }
    public async Task<IReadOnlyDictionary<string, JsonElement>?> GetAsync(StorageEntity entity, IReadOnlyDictionary<string, string> key, CancellationToken cancellation = default) { var id = StorageSchema.EncodeKey(entity, key); var rows = await Adapter.GetAsync(entity, new[] { id }, cancellation).ConfigureAwait(false); return rows.TryGetValue(id, out var row) ? StorageMerge.PublicRow(entity, row) : null; }
    public async Task<StorageQueryPage> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default) { var index = StorageValidation.ValidateQuery(entity, query); var rows = await Adapter.QueryAsync(entity, query, cancellation).ConfigureAwait(false); var last = rows.LastOrDefault(); return new(rows.Select(row => StorageMerge.PublicRow(entity, row)).ToArray(), last is not null && rows.Count >= query.Limit ? new(StorageValidation.Sort(last, index.Sort), last.Id) : null); }
    public async Task<StorageSavedCheckpoint?> CheckpointAsync(string session, string stream, CancellationToken cancellation = default) { var row = await GetAsync(StorageEntity.Checkpoints, Key(("sessionId", session), ("stream", stream)), cancellation).ConfigureAwait(false); if (row is null || !row.TryGetValue("cursor", out var cursor) || cursor.ValueKind != JsonValueKind.String) return null; return new(cursor.GetString()!, row.TryGetValue("position", out var position) ? position : StorageMerge.Null, row.TryGetValue("updatedAt", out var time) && time.ValueKind == JsonValueKind.Number ? time.GetDouble() : null); }
    public async Task<bool> HasEventAsync(string session, string id, CancellationToken cancellation = default) => await GetAsync(StorageEntity.Events, Key(("sessionId", session), ("eventId", id)), cancellation).ConfigureAwait(false) is not null;
}
