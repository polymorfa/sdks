using Polymorfa.Sdk;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.Sql;
using System.Text.Json;
static void Check(bool condition, string message = "Storage assertion failed") { if (!condition) throw new Exception(message); }
static IReadOnlyDictionary<string, string> Key(string session, string message) => new Dictionary<string, string> { { "sessionId", session }, { "messageId", message } };
static StorageUpsert Message(string session, string message, int timestamp) => new(StorageEntity.Messages, Key(session, message), new Dictionary<string, StorageFieldWrite> { { "text", new(JsonSerializer.SerializeToElement(message), timestamp) }, { "timestamp", new(JsonSerializer.SerializeToElement(timestamp), timestamp) }, { "chatId", new(JsonSerializer.SerializeToElement("chat"), timestamp) } });
static async Task Conformance(IStorageAdapter adapter)
{
    await adapter.SetupAsync(); await adapter.SetupAsync();
    foreach (var entity in Enum.GetValues<StorageEntity>())
    {
        var definition = StorageSchema.Definition(entity); var keys = definition.Key.Select((k, i) => (k, i)).ToDictionary(p => p.k, p => "schema-" + p.i); var empty = StorageMerge.EmptyRow(entity, keys); var fields = empty.Fields.ToDictionary(p => p.Key, p => p.Value); var versions = new Dictionary<string, double>(); foreach (var (field, type) in definition.Fields) { object value = type switch { StorageFieldType.String => "name💎'\\\"", StorageFieldType.Number => 1.25, StorageFieldType.Boolean => true, StorageFieldType.Json => JsonSerializer.SerializeToElement(new { unknown = new object?[] { null, false, 1, "💎" } }), _ => throw new Exception() }; fields[field] = JsonSerializer.SerializeToElement(value); versions[field] = 2; }
        var row = empty with { Revision = 1, Fields = fields, Versions = versions }; Check((await adapter.CommitAsync(new[] { new StoragePut(entity, row, null) })).Ok); var fetched = (await adapter.GetAsync(entity, new[] { row.Id }))[row.Id]; Check(StorageMerge.CanonicalJson(JsonSerializer.SerializeToElement(fetched)) == StorageMerge.CanonicalJson(JsonSerializer.SerializeToElement(row)), definition.Name + " roundtrip");
    }
    var scalar = StorageMerge.EmptyRow(StorageEntity.Messages, Key("scalars", "json")); var values = new object[] { "string 💎", false, 12.5, new object?[] { 1, null }, new { unknown = true } }; for (var i = 0; i < values.Length; i++) { var fields = scalar.Fields.ToDictionary(p => p.Key, p => p.Value); fields["extra"] = JsonSerializer.SerializeToElement(values[i]); scalar = scalar with { Revision = i + 1, Fields = fields }; Check((await adapter.CommitAsync(new[] { new StoragePut(StorageEntity.Messages, scalar, i == 0 ? null : i) })).Ok); var fetched = (await adapter.GetAsync(StorageEntity.Messages, new[] { scalar.Id }))[scalar.Id]; Check(StorageMerge.CanonicalJson(fetched.Fields["extra"]) == StorageMerge.CanonicalJson(fields["extra"])); }
    await SqlFences.Run(adapter);
    var store = new CustomerStorage(adapter); var session = "native-sql-" + Guid.NewGuid().ToString("N"); var batch = new StorageBatch(session, Enumerable.Range(0, 2000).Select(n => (StorageOperation)Message(session, n.ToString(System.Globalization.CultureInfo.InvariantCulture), n)).ToArray(), "event"); Check((await store.ApplyAsync(batch)).Applied); Check(!(await store.ApplyAsync(batch)).Applied);
    var query = new StorageIndexQuery("by_chat", new Dictionary<string, string> { { "sessionId", session }, { "chatId", "chat" } }, 17, Order: "asc"); var page = await store.QueryAsync(StorageEntity.Messages, query); Check(page.Rows.Count == 17); var next = await store.QueryAsync(StorageEntity.Messages, query with { After = page.Next }); Check(next.Rows[0]["timestamp"].GetDouble() == 17);
    var id = StorageSchema.EncodeKey(StorageEntity.Messages, Key(session, "0")); var original = (await adapter.GetAsync(StorageEntity.Messages, new[] { id }))[id]; var created = StorageMerge.EmptyRow(StorageEntity.Messages, Key(session, "rolled-back")) with { Revision = 1 }; Check(!(await adapter.CommitAsync(new StorageWrite[] { new StoragePut(StorageEntity.Messages, created, null), new StorageRowDelete(StorageEntity.Messages, id, original.Revision + 1) })).Ok); Check(await store.GetAsync(StorageEntity.Messages, Key(session, "rolled-back")) is null);
    await Task.WhenAll(Enumerable.Range(2, 5).Select(n => store.ApplyAsync(new(session, new[] { Message(session, "concurrent", n) })))); Check((await store.GetAsync(StorageEntity.Messages, Key(session, "concurrent")))!["timestamp"].GetDouble() == 6);
    var checkpoint = new StorageBatch(session, new[] { new StorageCheckpoint(session, "events", "saved", PatchValue<string>.Set(null), JsonSerializer.SerializeToElement(new { unknown = new object[] { 1, true } }), 2) }); await store.ApplyAsync(checkpoint); try { await store.ApplyAsync(checkpoint); throw new Exception("Stale checkpoint advanced"); } catch (StorageCheckpointConflictException) { }
    await store.ApplyAsync(new(session, new StorageOperation[] { new StorageUpsert(StorageEntity.Chats, new Dictionary<string, string> { { "sessionId", session }, { "chatId", "chat" } }, new Dictionary<string, StorageFieldWrite> { { "clearedAt", new(JsonSerializer.SerializeToElement(1000), 1000) } }), new StorageClearChat(session, "chat", 1000) }, "clear")); Check((await store.QueryAsync(StorageEntity.Messages, query with { Limit = 2000 })).Rows.Count == 999);
    Console.WriteLine("PASS " + adapter.Name + ": all 17 typed schema rows, atomic rollback, leases/concurrency, replay, 2000 messages, cursor paging, checkpoint CAS and fenced clear");
}
foreach (var dialect in Enum.GetValues<StorageSqlDialect>())
{
    var ddl = string.Join('\n', StorageSqlSchema.Statements(dialect)); Check(ddl.Contains("leases", StringComparison.Ordinal) && ddl.Contains("_rev", StringComparison.Ordinal) && ddl.Contains("storage_schema", StringComparison.Ordinal)); try { _ = StorageSqlSchema.Statements(dialect, new() { TablePrefix = "bad; DROP TABLE x" }); throw new Exception("SQL identifier injection accepted"); } catch (StorageValidationException) { }
}
await using (var sqlite = await SqlStorageAdapter.SqliteAsync("Data Source=:memory:")) await Conformance(sqlite);
await SupabaseTests.Run();
if (Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_POSTGRES_URL") is { } postgres) { await using var adapter = SqlStorageAdapter.Postgres(postgres, new() { TablePrefix = "cs_" + Guid.NewGuid().ToString("N") + "_" }); await Conformance(adapter); }
if (Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_MYSQL_URL") is { } mysql) { await using var adapter = SqlStorageAdapter.MySql(mysql, new() { TablePrefix = "cs_" + Guid.NewGuid().ToString("N") + "_" }); await Conformance(adapter); }

internal static class SqlFences
{
    private sealed class Paused(IStorageAdapter adapter) : IStorageAdapter
    {
        private int calls; public string Name => "paused-sql"; public StorageCapabilities Capabilities => adapter.Capabilities; internal TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously); internal TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity e, IReadOnlyList<string> ids, CancellationToken cancellation = default) => adapter.GetAsync(e, ids, cancellation);
        public Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity e, StorageIndexQuery q, CancellationToken cancellation = default) => adapter.QueryAsync(e, q, cancellation);
        public async Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> w, CancellationToken cancellation = default) { if (Interlocked.Increment(ref calls) == 2) { Started.TrySetResult(); await Release.Task.WaitAsync(cancellation); } return await adapter.CommitAsync(w, cancellation); }
    }
    internal static async Task Run(IStorageAdapter adapter)
    {
        long clock = 100; var options = new StorageEngineOptions { Now = () => Interlocked.Read(ref clock), LeaseDuration = TimeSpan.FromMilliseconds(10), LeaseWait = TimeSpan.Zero }; var paused = new Paused(adapter); var old = new CustomerStorage(paused, options); var next = new CustomerStorage(adapter, options); var session = "fence-" + Guid.NewGuid().ToString("N"); IReadOnlyDictionary<string, string> Key(string id) => new Dictionary<string, string> { { "sessionId", session }, { "messageId", id } }; StorageBatch Batch(string id) => new(session, new[] { new StorageUpsert(StorageEntity.Messages, Key(id), new Dictionary<string, StorageFieldWrite> { { "text", new(JsonSerializer.SerializeToElement(id), 1) } }) }, id);
        var task = old.ApplyAsync(Batch("old-only")); await paused.Started.Task.WaitAsync(TimeSpan.FromSeconds(2)); Interlocked.Exchange(ref clock, 111); await next.ApplyAsync(Batch("new-only")); paused.Release.TrySetResult(); try { await task; throw new Exception("Expired paused SQL writer committed"); } catch (StorageLeaseLostException) { }
        if (await next.HasEventAsync(session, "old-only") || await next.GetAsync(StorageEntity.Messages, Key("old-only")) is not null || await next.GetAsync(StorageEntity.Messages, Key("new-only")) is null) throw new Exception("SQL fencing failed to roll back the old writer atomically");
    }
}
