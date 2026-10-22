using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.Sqlite;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.Sql;
using Polymorfa.Storage.EntityFrameworkCore;

static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
static DbContextOptions<PolymorfaStorageDbContext> Options(StorageSqlDialect dialect, string connection) => dialect switch
{
    StorageSqlDialect.Sqlite => new DbContextOptionsBuilder<PolymorfaStorageDbContext>().UseSqlite(connection).Options,
    StorageSqlDialect.Postgres => new DbContextOptionsBuilder<PolymorfaStorageDbContext>().UseNpgsql(connection).Options,
    StorageSqlDialect.MySql => new DbContextOptionsBuilder<PolymorfaStorageDbContext>().UseMySql(connection, new MySqlServerVersion(new Version(8, 4, 0))).Options,
    _ => throw new Exception("Unsupported test dialect")
};
static async Task<SqlStorageAdapter> Adapter(StorageSqlDialect dialect, string connection, SqlStorageOptions naming) => dialect switch
{
    StorageSqlDialect.Sqlite => await SqlStorageAdapter.SqliteAsync(connection, naming),
    StorageSqlDialect.Postgres => SqlStorageAdapter.Postgres(connection, naming),
    StorageSqlDialect.MySql => SqlStorageAdapter.MySql(connection, naming),
    _ => throw new Exception("Unsupported test dialect")
};
static StorageRow Row(StorageEntity entity)
{
    var definition = StorageSchema.Definition(entity); var key = definition.Key.Select((name, n) => (name, n)).ToDictionary(p => p.name, p => "entity-" + p.n); var empty = StorageMerge.EmptyRow(entity, key); var fields = empty.Fields.ToDictionary(p => p.Key, p => p.Value); var versions = new Dictionary<string, double>();
    foreach (var (name, kind) in definition.Fields) { object value = kind switch { StorageFieldType.String => "quoted ' \" unicode 💎", StorageFieldType.Number => 12.5, StorageFieldType.Boolean => true, StorageFieldType.Json => JsonSerializer.SerializeToElement(new Dictionary<string, object?> { { "$date", "literal" }, { "$binary", new object?[] { null, false, 1, "💎" } } }), _ => throw new Exception() }; fields[name] = JsonSerializer.SerializeToElement(value); versions[name] = 2; }
    return empty with { Revision = 1, Fields = fields, Versions = versions };
}
static async Task Verify(StorageSqlDialect dialect, string connection)
{
    var naming = new SqlStorageOptions { TablePrefix = "ef_" + Guid.NewGuid().ToString("N")[..8] + "_" }; var contextOptions = Options(dialect, connection);
    await using var adapter = await Adapter(dialect, connection, naming); await adapter.SetupAsync();
    await using var context = new PolymorfaStorageDbContext(contextOptions, dialect, naming);
    Check(context.Model.GetEntityTypes().Count() == 17, "EF model must contain all17 shared types");
    foreach (var entity in Enum.GetValues<StorageEntity>())
    {
        var row = Row(entity); Check((await adapter.CommitAsync(new[] { new StoragePut(entity, row, null) })).Ok, "Native row insert");
        var stored = await context.StorageRows(entity).AsNoTracking().SingleAsync(data => EF.Property<string>(data, "_id") == row.Id);
        Check((long)stored["_rev"]! == 1 && row.Versions.All(pair => ((JsonElement)stored["_v"]!).GetProperty(pair.Key).GetDouble() == pair.Value), "Revision/field-version mapping");
        var definition = StorageSchema.Definition(entity);
        foreach (var key in definition.Key) Check((string)stored[key]! == row.Fields[key].GetString(), "Logical key mapping");
        foreach (var (field, kind) in definition.Fields)
        {
            var expected = row.Fields[field]; var actual = stored[field];
            Check(kind switch { StorageFieldType.String => (string)actual! == expected.GetString(), StorageFieldType.Number => (double)actual! == expected.GetDouble(), StorageFieldType.Boolean => (bool)actual! == expected.GetBoolean(), StorageFieldType.Json => StorageMerge.CanonicalJson((JsonElement)actual!) == StorageMerge.CanonicalJson(expected), _ => false }, definition.Name + "/" + field + " mapping");
        }
    }
    var original = Row(StorageEntity.Messages);
    await using var first = new PolymorfaStorageDbContext(contextOptions, dialect, naming); await using var stale = new PolymorfaStorageDbContext(contextOptions, dialect, naming);
    var left = await first.StorageRows(StorageEntity.Messages).SingleAsync(); var right = await stale.StorageRows(StorageEntity.Messages).SingleAsync();
    left["text"] = "winning EF update"; left["_rev"] = 2L; left["extra"] = JsonSerializer.SerializeToElement(new { preserved = new object?[] { null, 1, true } }); await first.SaveChangesAsync();
    right["text"] = "stale EF update"; right["_rev"] = 3L;
    try { await stale.SaveChangesAsync(); throw new Exception("Stale EF revision updated the row"); } catch (DbUpdateConcurrencyException) { }
    var fetched = (await adapter.GetAsync(StorageEntity.Messages, new[] { original.Id }))[original.Id]; Check(fetched.Revision == 2 && fetched.Fields["text"].GetString() == "winning EF update", "Native adapter must read committed EF row");
    Check(fetched.Fields["extra"].GetProperty("preserved")[2].GetBoolean(), "EF JSON replacement");
    var nullKeys = new Dictionary<string, string> { { "sessionId", "nullable" }, { "messageId", "empty" } }; var nullEmpty = StorageMerge.EmptyRow(StorageEntity.Messages, nullKeys); var nullRow = nullEmpty with { Revision = 1, Fields = nullEmpty.Fields.ToDictionary(pair => pair.Key, pair => StorageSchema.Definition(StorageEntity.Messages).Fields.ContainsKey(pair.Key) ? JsonSerializer.SerializeToElement<object?>(null) : pair.Value) }; Check((await adapter.CommitAsync(new[] { new StoragePut(StorageEntity.Messages, nullRow, null) })).Ok, "Nullable insert"); var nullModel = await first.StorageRows(StorageEntity.Messages).AsNoTracking().SingleAsync(data => EF.Property<string>(data, "_id") == nullRow.Id); Check(StorageSchema.Definition(StorageEntity.Messages).Fields.Keys.All(field => nullModel[field] is null), "EF nullable values changed SQL NULL");
    var otherNaming = naming with { TablePrefix = naming.TablePrefix + "b_" }; await using var otherAdapter = await Adapter(dialect, connection, otherNaming); await otherAdapter.SetupAsync(); await using var other = new PolymorfaStorageDbContext(contextOptions, dialect, otherNaming);
    Check(await other.StorageRows(StorageEntity.Messages).CountAsync() == 0, "EF model cache crossed table-prefix authority");
    Check(await first.StorageRows(StorageEntity.Messages).CountAsync() == 2, "First prefix changed after second EF model");
    Console.WriteLine("PASS EF Core/" + dialect + ": all17 native schema rows/columns, nullable scalar/JSON models, literal tags, JSON replacement, revision concurrency and model-cache naming separation");
}

var directory = Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_TEST_DIRECTORY") ?? Environment.CurrentDirectory;
var file = Path.Combine(directory, "ef-storage-" + Guid.NewGuid().ToString("N") + ".db");
try
{
    await Verify(StorageSqlDialect.Sqlite, new SqliteConnectionStringBuilder { DataSource = file, Pooling = false }.ToString());
    if (Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_POSTGRES_URL") is { } postgres) await Verify(StorageSqlDialect.Postgres, postgres);
    if (Environment.GetEnvironmentVariable("POLYMORFA_STORAGE_MYSQL_URL") is { } mysql) await Verify(StorageSqlDialect.MySql, mysql);
    var ddlFile = Path.Combine(directory, "ef-created-" + Guid.NewGuid().ToString("N") + ".db");
    try
    {
        var connection = new SqliteConnectionStringBuilder { DataSource = ddlFile, Pooling = false }.ToString(); var naming = new SqlStorageOptions { TablePrefix = "ef_created_", CreateTables = false };
        await using (var context = new PolymorfaStorageDbContext(Options(StorageSqlDialect.Sqlite, connection), StorageSqlDialect.Sqlite, naming)) Check(await context.Database.EnsureCreatedAsync(), "EF did not create its own test database");
        await using var adapter = await Adapter(StorageSqlDialect.Sqlite, connection, naming); await StorageConformanceTests.Conformance(adapter); Console.WriteLine("PASS EF-generated SQLite schema consumed by native SDK engine: all17/2000history/rollback/checkpoint/lease fencing");
    }
    finally { foreach (var suffix in new[] { "", "-wal", "-shm" }) if (File.Exists(ddlFile + suffix)) File.Delete(ddlFile + suffix); }
    var options = Options(StorageSqlDialect.Sqlite, "Data Source=:memory:");
    foreach (var invalid in new[] { new SqlStorageOptions { TablePrefix = "bad;secret" }, new SqlStorageOptions { Schema = "schema" } })
    { try { await using var context = new PolymorfaStorageDbContext(options, StorageSqlDialect.Sqlite, invalid); throw new Exception("Unsafe naming accepted"); } catch (StorageValidationException) { } }
}
finally { foreach (var suffix in new[] { "", "-wal", "-shm" }) if (File.Exists(file + suffix)) File.Delete(file + suffix); }
