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
        var key = new Dictionary<string, string> { { "sessionId", "negative" }, { "messageId", "duplicate" } };
        var row = StorageMerge.EmptyRow(StorageEntity.Messages, key) with { Revision = 1 };
        Check((await adapter.CommitAsync(new[] { new StoragePut(StorageEntity.Messages, row, null) })).Ok, "initial insert");
        var another = StorageMerge.EmptyRow(StorageEntity.Messages, key.ToDictionary(p => p.Key, p => p.Key == "messageId" ? "rollback-before-duplicate" : p.Value)) with { Revision = 1 };
        Check(!(await adapter.CommitAsync(new StorageWrite[] { new StoragePut(StorageEntity.Messages, another, null), new StoragePut(StorageEntity.Messages, row, null) })).Ok, "duplicate insert must conflict");
        Check((await adapter.GetAsync(StorageEntity.Messages, new[] { another.Id })).Count == 0, "duplicate conflict must roll back prior insert");
        try { await adapter.CommitAsync(Enumerable.Repeat<StorageWrite>(new StoragePut(StorageEntity.Messages, row, 1), 501).ToArray()); throw new Exception("oversized commit accepted"); } catch (StorageValidationException) { }
        try { _ = new LibSqlStorageAdapter(connection, options with { TablePrefix = "bad;secret" }); throw new Exception("unsafe identifier accepted"); } catch (StorageValidationException) { }
        // A real database error must drop SQL, endpoint, row content, and inner exceptions.
        await using (var command = connection.CreateCommand()) { command.CommandText = $"DROP TABLE \"{options.TablePrefix}messages\""; await command.ExecuteNonQueryAsync(); }
        try { await adapter.GetAsync(StorageEntity.Messages, new[] { row.Id }); throw new Exception("missing table accepted"); }
        catch (StorageProviderException error) { Check(error.InnerException is null && !error.ToString().Contains(options.TablePrefix, StringComparison.Ordinal) && !error.ToString().Contains("duplicate", StringComparison.Ordinal), "provider error leaked customer detail"); }
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        try { await adapter.SetupAsync(cancelled.Token); throw new Exception("cancellation ignored"); } catch (OperationCanceledException) { }
    }
    Check(connection.State == ConnectionState.Open, "adapter disposed borrowed connection");
    await using var probe = connection.CreateCommand(); probe.CommandText = "SELECT 1"; Check(Convert.ToInt64(await probe.ExecuteScalarAsync()) == 1, "borrowed connection unusable");
    Console.WriteLine("PASS libsql " + label + ": duplicate rollback, capacity/identifier rejection, sanitized errors, cancellation, caller ownership");
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
