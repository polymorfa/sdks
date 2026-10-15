using System.Data;
using System.Text.Json;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.LibSql;
using Polymorfa.Storage.Sql;
using Turso.Data.Sqlite;

static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
static async Task Run(string connectionString, string label)
{
    await using var connection = new PausedNativeConnection(connectionString);
    await connection.OpenAsync();
    var options = new SqlStorageOptions { TablePrefix = "cs_libsql_" + Guid.NewGuid().ToString("N") + "_" };
    await using (var adapter = new LibSqlStorageAdapter(connection, options))
    {
        Check(adapter.Name == "libsql" && adapter.Capabilities.MaxCommitSize == 500, "libSQL capabilities");
        await StorageConformanceTests.Conformance(adapter);
        await MutationTests.Run(connection, adapter);
        await IndependentClients(connectionString, options);
        var key = new Dictionary<string, string> { { "sessionId", "negative" }, { "messageId", "duplicate" } };
        var row = StorageMerge.EmptyRow(StorageEntity.Messages, key) with { Revision = 1 };
        Check((await adapter.CommitAsync(new[] { new StoragePut(StorageEntity.Messages, row, null) })).Ok, "initial insert");
        var another = StorageMerge.EmptyRow(StorageEntity.Messages, key.ToDictionary(p => p.Key, p => p.Key == "messageId" ? "rollback-before-duplicate" : p.Value)) with { Revision = 1 };
        Check(!(await adapter.CommitAsync(new StorageWrite[] { new StoragePut(StorageEntity.Messages, another, null), new StoragePut(StorageEntity.Messages, row, null) })).Ok, "duplicate insert must conflict");
        Check((await adapter.GetAsync(StorageEntity.Messages, new[] { another.Id })).Count == 0, "duplicate conflict must roll back prior insert");
        try { await adapter.CommitAsync(Enumerable.Repeat<StorageWrite>(new StoragePut(StorageEntity.Messages, row, 1), 501).ToArray()); throw new Exception("oversized commit accepted"); } catch (StorageValidationException) { }
        try { _ = new LibSqlStorageAdapter(connection, options with { TablePrefix = "bad;secret" }); throw new Exception("unsafe identifier accepted"); } catch (StorageValidationException) { }
        var failedRow = StorageMerge.EmptyRow(StorageEntity.Messages, key.ToDictionary(p => p.Key, p => p.Key == "messageId" ? "provider-rollback" : p.Value)) with { Revision = 1 };
        var contacts = StorageSchema.Definition(StorageEntity.Contacts);
        var missing = StorageMerge.EmptyRow(StorageEntity.Contacts, contacts.Key.ToDictionary(k => k, _ => "provider-failure")) with { Revision = 1 };
        await using (var command = connection.CreateCommand()) { command.CommandText = $"DROP TABLE \"{options.TablePrefix}{contacts.Name}\""; await command.ExecuteNonQueryAsync(); }
        try { await adapter.CommitAsync(new StorageWrite[] { new StoragePut(StorageEntity.Messages, failedRow, null), new StoragePut(StorageEntity.Contacts, missing, null) }); throw new Exception("Provider failure accepted"); } catch (StorageProviderException error) { Check(error.InnerException is null, "Provider failure retained inner error"); }
        Check((await adapter.GetAsync(StorageEntity.Messages, new[] { failedRow.Id })).Count == 0, "Provider failure did not roll back first write");
        // A real database error must drop SQL, endpoint, row content, and inner exceptions.
        await using (var command = connection.CreateCommand()) { command.CommandText = $"DROP TABLE \"{options.TablePrefix}messages\""; await command.ExecuteNonQueryAsync(); }
        try { await adapter.GetAsync(StorageEntity.Messages, new[] { row.Id }); throw new Exception("missing table accepted"); }
        catch (StorageProviderException error) { Check(error.InnerException is null && !error.ToString().Contains(options.TablePrefix, StringComparison.Ordinal) && !error.ToString().Contains("duplicate", StringComparison.Ordinal), "provider error leaked customer detail"); }
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        try { await adapter.SetupAsync(cancelled.Token); throw new Exception("cancellation ignored"); } catch (OperationCanceledException) { }
    }
    Check(connection.State == ConnectionState.Open, "adapter disposed borrowed connection");
    await using var probe = connection.CreateCommand(); probe.CommandText = "SELECT 1"; Check(Convert.ToInt64(await probe.ExecuteScalarAsync()) == 1, "borrowed connection unusable");
    Console.WriteLine("PASS libsql " + label + ": duplicate/provider rollback, capacity/identifier rejection, sanitized errors, cancellation, caller ownership");
}

static async Task IndependentClients(string connectionString, SqlStorageOptions options)
{
    await using var first = new PausedNativeConnection(connectionString); await first.OpenAsync();
    await using var second = new PausedNativeConnection(connectionString); await second.OpenAsync();
    await using var left = new LibSqlStorageAdapter(first, options with { CreateTables = false });
    await using var right = new LibSqlStorageAdapter(second, options with { CreateTables = false });
    var row = StorageMerge.EmptyRow(StorageEntity.Messages, new Dictionary<string, string> { { "sessionId", "independent" }, { "messageId", "cas" } }) with { Revision = 1 };
    Check((await left.CommitAsync(new[] { new StoragePut(StorageEntity.Messages, row, null) })).Ok, "Independent initial insert");
    var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    async Task<StorageCommitResult?> Race(LibSqlStorageAdapter client, PausedNativeConnection native)
    {
        await start.Task;
        try { return await client.CommitAsync(new[] { new StoragePut(StorageEntity.Messages, row with { Revision = 2 }, 1) }); }
        catch (StorageProviderException error) { Check(native.AdmissionFailed && error.InnerException is null, "Race provider failure was not safe transaction admission"); return null; }
    }
    var a = Task.Run(() => Race(left, first)); var b = Task.Run(() => Race(right, second)); start.TrySetResult();
    var results = await Task.WhenAll(a, b); Check(results.Count(r => r?.Ok == true) == 1, "Independent clients did not enforce CAS");
    Check((await right.GetAsync(StorageEntity.Messages, new[] { row.Id }))[row.Id].Revision == 2, "Independent client cannot observe committed revision");
    Check(!(await left.CommitAsync(new[] { new StoragePut(StorageEntity.Messages, row with { Revision = 3 }, 1) })).Ok, "Fresh retry bypassed stale revision");
    Console.WriteLine("PASS libsql: independent native connections allow one CAS winner, safe admission failures=" + results.Count(r => r is null) + ", fresh stale-revision retry rejected");
}

await using (var closed = new SqliteConnection("Data Source=:memory:"))
{
    try { _ = new LibSqlStorageAdapter(closed); throw new Exception("closed connection accepted"); } catch (StorageValidationException) { }
}
var file = Path.Combine(Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_TEST_DIRECTORY") ?? Environment.CurrentDirectory, "libsql-" + Guid.NewGuid().ToString("N") + ".db");
try { await Run(new SqliteConnectionStringBuilder { DataSource = file, Pooling = false }.ToString(), "native file"); }
finally { foreach (var suffix in new[] { "", "-wal", "-shm" }) if (File.Exists(file + suffix)) File.Delete(file + suffix); }
if (Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_LIBSQL_CONNECTION") is { } remote) await Run(remote, "remote Hrana");
else Console.WriteLine("SKIP libsql remote: POLYMORFA_STORAGE_LIBSQL_CONNECTION unset");
