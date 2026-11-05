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
        var iterations = int.TryParse(Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_LIBSQL_RACE_ITERATIONS"), out var count) ? count : 20;
        if (iterations is < 1 or > 1000) throw new Exception("Invalid race iteration count");
        for (var iteration = 0; iteration < iterations; iteration++) await IndependentClients(connectionString, options);
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
    var row = StorageMerge.EmptyRow(StorageEntity.Messages, new Dictionary<string, string> { { "sessionId", "independent" }, { "messageId", Guid.NewGuid().ToString("N") } }) with { Revision = 1 };
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
    Console.WriteLine("PASS libsql: independent remote connections allow one CAS winner, safe admission failures=" + results.Count(r => r is null) + ", fresh stale-revision retry rejected");
}

foreach (var unsupported in new[] { "Data Source=:memory:", "Data Source=unsupported.db;Pooling=True", "Data Source=unsupported.db;Pooling=False", "Data Source=libsql://customer.invalid;Replica Path=unsupported-replica.db", "Data Source=http://customer.invalid", "Data Source=https://synthetic.invalid;Tls=False", "Data Source=wss://synthetic.invalid;Tls=False", "Data Source=turso://synthetic.invalid;Tls=False", "Data Source=libsql://synthetic.invalid;Tls=False", "Data Source=http://localhost;Tls=True" })
{
    await using var connection = new SqliteConnection(unsupported);
    try { _ = new LibSqlStorageAdapter(connection); throw new Exception("Unsupported local, replica or insecure libSQL mode accepted"); }
    catch (StorageValidationException error) { Check(!error.Message.Contains("customer.invalid", StringComparison.Ordinal) && !error.Message.Contains("unsupported.db", StringComparison.Ordinal), "Mode validation leaked customer configuration"); }
    Check(connection.State == ConnectionState.Closed, "Rejected mode changed caller connection state");
}
await using (var broken = new BrokenConfigurationConnection())
{
    try { _ = new LibSqlStorageAdapter(broken); throw new Exception("Driver configuration failure escaped validation"); }
    catch (StorageValidationException error) { Check(error.InnerException is null && !error.ToString().Contains("synthetic-configuration-canary", StringComparison.Ordinal), "Raw configuration error escaped"); }
}
Console.WriteLine("PASS libsql: file, memory, replica, insecure/conflicting TLS modes and raw configuration failures rejected before adapter commands");
await using (var closed = new SqliteConnection("Data Source=libsql://127.0.0.1:54848;Tls=False"))
{
    try { _ = new LibSqlStorageAdapter(closed); throw new Exception("Closed remote connection accepted"); } catch (StorageValidationException) { }
}
if (Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_LIBSQL_CONNECTION") is { } remote) await Run(remote, "direct remote Hrana");
else Console.WriteLine("SKIP libsql remote: POLYMORFA_STORAGE_LIBSQL_CONNECTION unset; no native-file support is claimed");

internal sealed class BrokenConfigurationConnection : SqliteConnection
{
    [System.Diagnostics.CodeAnalysis.AllowNull]
    public override string ConnectionString { get => throw new InvalidOperationException("synthetic-configuration-canary"); set => base.ConnectionString = value; }
}
