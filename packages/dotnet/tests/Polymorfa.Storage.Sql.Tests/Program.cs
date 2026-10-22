using Polymorfa.Sdk;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.Sql;
using System.Text.Json;
using static StorageConformanceTests;
static void Check(bool condition) { if (!condition) throw new Exception("SQL schema assertion failed."); }
foreach (var dialect in Enum.GetValues<StorageSqlDialect>())
{
    var ddl = string.Join('\n', StorageSqlSchema.Statements(dialect)); Check(ddl.Contains("leases", StringComparison.Ordinal) && ddl.Contains("_rev", StringComparison.Ordinal) && ddl.Contains("storage_schema", StringComparison.Ordinal)); try { _ = StorageSqlSchema.Statements(dialect, new() { TablePrefix = "bad; DROP TABLE x" }); throw new Exception("SQL identifier injection accepted"); } catch (StorageValidationException) { }
}
await using (var sqlite = await SqlStorageAdapter.SqliteAsync("Data Source=:memory:")) await Conformance(sqlite);
await SupabaseTests.Run();
if (Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_POSTGRES_URL") is { } postgres) { await using var adapter = SqlStorageAdapter.Postgres(postgres, new() { TablePrefix = "cs_" + Guid.NewGuid().ToString("N") + "_" }); await Conformance(adapter); }
if (Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_MYSQL_URL") is { } mysql) { await using var adapter = SqlStorageAdapter.MySql(mysql, new() { TablePrefix = "cs_" + Guid.NewGuid().ToString("N") + "_" }); await Conformance(adapter); }
