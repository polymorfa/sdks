using Microsoft.Data.Sqlite;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.Sql;

internal static class ConnectionSchemaTests
{
    private static void Check(bool value) { if (!value) throw new Exception("Connection schema guard failed."); }
    private static async Task Refused(Func<Task> action) { try { await action(); } catch (StorageValidationException) { return; } throw new Exception("Unsafe store was accepted."); }
    public static async Task Run()
    {
        var root = Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_TEST_DIR") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".polymorfa-agent-work", "sdk-connection-storage-checks");
        Directory.CreateDirectory(root);
        foreach (var version in new[] { 2, 4, 0 })
        {
            var path = Path.Combine(root, "dotnet-schema-" + Guid.NewGuid().ToString("N") + ".db");
            var url = "Data Source=" + path;
            await using var db = new SqliteConnection(url); await db.OpenAsync();
            async Task Execute(string sql) { await using var command = db.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync(); }
            async Task<string> Catalog() { await using var command = db.CreateCommand(); command.CommandText = "SELECT name || ':' || coalesce(sql,'') FROM sqlite_master ORDER BY name"; await using var reader = await command.ExecuteReaderAsync(); var rows = new List<string>(); while (await reader.ReadAsync()) rows.Add(reader.GetString(0)); return string.Join('\n', rows); }
            await Execute("CREATE TABLE polymorfa_sessions(session_id text); INSERT INTO polymorfa_sessions VALUES('stable-session-id')");
            if (version > 0) await Execute($"CREATE TABLE polymorfa_storage_schema(id text PRIMARY KEY,version integer); INSERT INTO polymorfa_storage_schema VALUES('storage',{version})");
            var before = await Catalog();
            await using var adapter = await SqlStorageAdapter.SqliteAsync(url);
            await Refused(() => adapter.SetupAsync());
            Check(await Catalog() == before);
            await using var read = db.CreateCommand(); read.CommandText = "SELECT session_id FROM polymorfa_sessions"; Check((string?)await read.ExecuteScalarAsync() == "stable-session-id");
        }
        var currentPath = Path.Combine(root, "dotnet-schema-" + Guid.NewGuid().ToString("N") + ".db");
        var currentUrl = "Data Source=" + currentPath;
        await using var current = await SqlStorageAdapter.SqliteAsync(currentUrl); await current.SetupAsync();
        await using var inspect = new SqliteConnection(currentUrl); await inspect.OpenAsync();
        await using var mutate = inspect.CreateCommand(); mutate.CommandText = "UPDATE polymorfa_storage_schema SET version=4"; await mutate.ExecuteNonQueryAsync();
        await Refused(async () => { await current.GetAsync(StorageEntity.Connections, ["id"]); });
        await Refused(async () => { await current.CommitAsync([]); });
        Console.WriteLine("Connection SQL guards passed: old, future, unversioned, open-adapter reads and writes.");
    }
}
