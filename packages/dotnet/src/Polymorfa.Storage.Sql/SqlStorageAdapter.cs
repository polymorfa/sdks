using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using MySqlConnector;
using Npgsql;
using Polymorfa.Sdk.Storage;
namespace Polymorfa.Storage.Sql;
/// <summary>Customer database storage through maintained ADO.NET drivers. Each commit uses one database transaction.</summary>
public sealed class SqlStorageAdapter : IStorageAdapter, IAsyncDisposable
{
    private readonly StorageSqlDialect dialect;
    private readonly SqlStorageOptions options;
    private readonly DbDataSource? source;
    private readonly DbConnection? sqlite;
    private readonly bool ownsConnection;
    private readonly Func<DbException, bool>? providerConflict;
    private readonly string? providerName;
    private readonly bool insertOnConflictDoNothing;
    private readonly SemaphoreSlim sqliteGate = new(1, 1);
    private sealed record Column(string Name, StorageFieldType Type, bool Revision = false);
    private sealed class ConditionalConflict(string id) : Exception { internal string Id { get; } = id; }
    public string Name => providerName ?? dialect switch { StorageSqlDialect.Postgres => "postgres", StorageSqlDialect.MySql => "mysql", _ => "sqlite" };
    public StorageCapabilities Capabilities => new(true, dialect == StorageSqlDialect.Sqlite ? 500 : 1000);
    private SqlStorageAdapter(StorageSqlDialect dialect, SqlStorageOptions? configuration, DbDataSource? source = null, DbConnection? sqlite = null, bool ownsConnection = true, Func<DbException, bool>? providerConflict = null, string? providerName = null, bool insertOnConflictDoNothing = false)
    {
        if (OperatingSystem.IsBrowser()) throw new StorageValidationException("SQL storage requires a server application."); this.dialect = dialect; options = configuration ?? new(); _ = StorageSqlSchema.Statements(dialect, options); this.source = source; this.sqlite = sqlite; this.ownsConnection = ownsConnection; this.providerConflict = providerConflict; this.providerName = providerName; this.insertOnConflictDoNothing = insertOnConflictDoNothing;
    }
    // Optional provider packages borrow an already-open connection and share the SQL contract.
    internal static SqlStorageAdapter BorrowSqlite(DbConnection connection, SqlStorageOptions? options, string name, Func<DbException, bool> conflict)
    {
        ValidateOptions(StorageSqlDialect.Sqlite, options);
        if (connection.State != ConnectionState.Open) throw Invalid();
        return new(StorageSqlDialect.Sqlite, options, sqlite: connection, ownsConnection: false, providerConflict: conflict, providerName: name, insertOnConflictDoNothing: true);
    }
    public static SqlStorageAdapter Postgres(string connectionString, SqlStorageOptions? options = null)
    {
        ValidateOptions(StorageSqlDialect.Postgres, options);
        try { return new(StorageSqlDialect.Postgres, options, NpgsqlDataSource.Create(connectionString)); } catch (Exception error) when (error is ArgumentException or InvalidOperationException or DbException) { throw Invalid(); }
    }
    public static SqlStorageAdapter MySql(string connectionString, SqlStorageOptions? options = null)
    {
        ValidateOptions(StorageSqlDialect.MySql, options);
        try { return new(StorageSqlDialect.MySql, options, new MySqlDataSource(connectionString)); } catch (Exception error) when (error is ArgumentException or InvalidOperationException or DbException) { throw Invalid(); }
    }
    public static async Task<SqlStorageAdapter> SqliteAsync(string connectionString, SqlStorageOptions? options = null, CancellationToken cancellation = default)
    {
        ValidateOptions(StorageSqlDialect.Sqlite, options);
        SqliteConnection connection; try { connection = new(connectionString); } catch (ArgumentException) { throw Invalid(); }
        try { await connection.OpenAsync(cancellation).ConfigureAwait(false); return new(StorageSqlDialect.Sqlite, options, sqlite: connection); } catch (DbException) { await connection.DisposeAsync().ConfigureAwait(false); throw Provider(); } catch { await connection.DisposeAsync().ConfigureAwait(false); throw; }
    }
    private static void ValidateOptions(StorageSqlDialect dialect, SqlStorageOptions? options)
    {
        if (OperatingSystem.IsBrowser()) throw new StorageValidationException("SQL storage requires a server application."); _ = StorageSqlSchema.Statements(dialect, options);
    }
    private async Task<T> WithConnection<T>(Func<DbConnection, Task<T>> body, CancellationToken cancellation)
    {
        try
        {
            if (sqlite is not null) { await sqliteGate.WaitAsync(cancellation).ConfigureAwait(false); try { return await body(sqlite).ConfigureAwait(false); } finally { sqliteGate.Release(); } }
            await using var connection = await source!.OpenConnectionAsync(cancellation).ConfigureAwait(false); return await body(connection).ConfigureAwait(false);
        }
        catch (DbException) { throw Provider(); }
        catch (InvalidOperationException) { throw Provider(); }
        catch (JsonException) { throw Provider(); }
        catch (FormatException) { throw Provider(); }
        catch (OverflowException) { throw Provider(); }
    }
    private string Q(string field) => StorageSqlSchema.Q(dialect, field);
    private string Table(StorageEntity entity) => StorageSqlSchema.Table(dialect, options, StorageSchema.Definition(entity).Name);
    private static IReadOnlyList<Column> Columns(StorageEntity entity)
    {
        var definition = StorageSchema.Definition(entity); return new[] { new Column("_id", StorageFieldType.String) }.Concat(definition.Key.Select(k => new Column(k, StorageFieldType.String))).Concat(definition.Fields.Select(f => new Column(f.Key, f.Value))).Concat(new[] { new Column("_rev", StorageFieldType.Number, true), new Column("_v", StorageFieldType.Json) }).ToArray();
    }
    private string Projection(StorageEntity entity) => string.Join(", ", Columns(entity).Select(c => c.Type == StorageFieldType.Json && dialect != StorageSqlDialect.Sqlite ? $"CAST({Q(c.Name)} AS {(dialect == StorageSqlDialect.Postgres ? "text" : "CHAR")}) AS {Q(c.Name)}" : Q(c.Name)));
    private string Mark(int index, Column? column = null) => dialect == StorageSqlDialect.Postgres && column?.Type == StorageFieldType.Json ? $"CAST(@p{index} AS jsonb)" : $"@p{index}";
    private object? Value(StorageRow row, Column column)
    {
        if (column.Name == "_id") return row.Id; if (column.Name == "_rev") return row.Revision; if (column.Name == "_v") return JsonSerializer.Serialize(row.Versions);
        if (!row.Fields.TryGetValue(column.Name, out var value) || value.ValueKind == JsonValueKind.Null) return null;
        return column.Type switch { StorageFieldType.Json => value.GetRawText(), StorageFieldType.String => value.GetString(), StorageFieldType.Number => value.GetDouble(), StorageFieldType.Boolean => dialect == StorageSqlDialect.Postgres ? value.GetBoolean() : value.GetBoolean() ? 1L : 0L, _ => throw Invalid() };
    }
    private DbCommand Command(DbConnection connection, DbTransaction? transaction, string sql, IReadOnlyList<object?> values, IReadOnlyList<Column>? columns = null)
    {
        var command = connection.CreateCommand(); command.Transaction = transaction; command.CommandText = sql;
        for (var i = 0; i < values.Count; i++) { var parameter = command.CreateParameter(); parameter.ParameterName = "p" + i.ToString(CultureInfo.InvariantCulture); parameter.Value = values[i] ?? DBNull.Value; if (columns is not null) { var column = columns[i]; parameter.DbType = column.Revision ? DbType.Int64 : column.Type switch { StorageFieldType.Number => DbType.Double, StorageFieldType.Boolean => dialect == StorageSqlDialect.Postgres ? DbType.Boolean : DbType.Int64, _ => DbType.String }; } command.Parameters.Add(parameter); }
        return command;
    }
    private StorageRow Decode(StorageEntity entity, DbDataReader reader)
    {
        var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal); var definition = StorageSchema.Definition(entity);
        foreach (var column in Columns(entity).Where(c => !c.Name.StartsWith('_'))) { var raw = reader[StorageSqlSchema.ColumnName(column.Name)]; object? value = raw is DBNull ? null : column.Type switch { StorageFieldType.String => Convert.ToString(raw, CultureInfo.InvariantCulture), StorageFieldType.Number => Convert.ToDouble(raw, CultureInfo.InvariantCulture), StorageFieldType.Boolean => raw is bool boolean ? boolean : Convert.ToInt64(raw, CultureInfo.InvariantCulture) != 0, StorageFieldType.Json => JsonSerializer.Deserialize<JsonElement>(Convert.ToString(raw, CultureInfo.InvariantCulture)!), _ => throw Provider() }; fields[column.Name] = JsonSerializer.SerializeToElement(value); }
        var row = new StorageRow(Convert.ToString(reader["_id"], CultureInfo.InvariantCulture)!, Convert.ToInt64(reader["_rev"], CultureInfo.InvariantCulture), JsonSerializer.Deserialize<Dictionary<string, double>>(Convert.ToString(reader["_v"], CultureInfo.InvariantCulture)!) ?? throw Provider(), fields); Validate(new StorageWrite[] { new StoragePut(entity, row, null) }); return row;
    }
    private void Validate(IReadOnlyList<StorageWrite> writes)
    {
        if (writes.Count > Capabilities.MaxCommitSize) throw new StorageValidationException("Commit exceeds atomic capacity."); var slots = new HashSet<(StorageEntity, string)>(); foreach (var write in writes)
        {
            var (entity, id, revision) = write switch { StoragePut p => (p.Entity, p.Row.Id, p.ExpectedRev), StorageRowDelete d => (d.Entity, d.Id, d.ExpectedRev), _ => throw Invalid() }; var definition = StorageSchema.Definition(entity); if (!slots.Add((entity, id)) || revision is < 1 or > 9007199254740991) throw Invalid(); if (write is StoragePut put) { if (put.Row.Revision is < 1 or > 9007199254740991 || put.Row.Fields.Keys.Any(k => k is "_id" or "_v" or "_rev")) throw Invalid(); var key = definition.Key.ToDictionary(k => k, k => put.Row.Fields.TryGetValue(k, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()! : throw Invalid()); if (StorageSchema.EncodeKey(entity, key) != id) throw Invalid(); }
        }
    }
    private static bool Conflict(DbException error) => error switch { PostgresException p => p.SqlState is "23505" or "40001" or "40P01", MySqlException m => m.Number is 1062 or 1213 or 1205, SqliteException s => s.SqliteErrorCode is 5 or 6 || s.SqliteExtendedErrorCode is 2067 or 1555, _ => false };
    public Task SetupAsync(CancellationToken cancellation = default) => WithConnection(async connection => { if (options.CreateTables) foreach (var statement in StorageSqlSchema.Statements(dialect, options)) { await using var command = Command(connection, null, statement, Array.Empty<object?>()); await command.ExecuteNonQueryAsync(cancellation).ConfigureAwait(false); } return true; }, cancellation);
    public Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default) => WithConnection<IReadOnlyDictionary<string, StorageRow>>(async connection =>
    {
        var result = new Dictionary<string, StorageRow>(StringComparer.Ordinal); foreach (var part in ids.Chunk(500)) { var marks = string.Join(",", Enumerable.Range(0, part.Length).Select(i => Mark(i))); await using var command = Command(connection, null, $"SELECT {Projection(entity)} FROM {Table(entity)} WHERE {Q("_id")} IN ({marks})", part); await using var reader = await command.ExecuteReaderAsync(cancellation).ConfigureAwait(false); while (await reader.ReadAsync(cancellation).ConfigureAwait(false)) { var row = Decode(entity, reader); result.Add(row.Id, row); } }
        return result;
    }, cancellation);
    public Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default)
    {
        Validate(writes); return WithConnection(async connection =>
        {
            await using DbTransaction transaction = connection is SqliteConnection local ? local.BeginTransaction(IsolationLevel.Serializable, deferred: false) : await connection.BeginTransactionAsync(cancellation).ConfigureAwait(false);
            try
            {
                foreach (var write in writes)
                {
                    var (entity, id, expected) = write switch { StoragePut p => (p.Entity, p.Row.Id, p.ExpectedRev), StorageRowDelete d => (d.Entity, d.Id, d.ExpectedRev), _ => throw Invalid() }; string sql; List<object?> values; List<Column>? boundColumns = null;
                    if (write is StoragePut put)
                    {
                        var columns = Columns(entity).Where(c => !expected.HasValue || c.Name != "_id").ToList(); values = columns.Select(c => Value(put.Row, c)).ToList(); boundColumns = columns.ToList();
                        if (!expected.HasValue) sql = $"INSERT INTO {Table(entity)} ({string.Join(",", columns.Select(c => Q(c.Name)))}) VALUES ({string.Join(",", columns.Select((c, i) => Mark(i, c)))})" + (insertOnConflictDoNothing ? " ON CONFLICT DO NOTHING" : "");
                        else { var sets = string.Join(",", columns.Select((c, i) => $"{Q(c.Name)}={Mark(i, c)}")); sql = $"UPDATE {Table(entity)} SET {sets} WHERE {Q("_id")}={Mark(values.Count)} AND {Q("_rev")}={Mark(values.Count + 1)}"; values.Add(id); values.Add(expected.Value); boundColumns.Add(new("_id", StorageFieldType.String)); boundColumns.Add(new("_rev", StorageFieldType.Number, true)); }
                    }
                    else { values = new() { id }; sql = $"DELETE FROM {Table(entity)} WHERE {Q("_id")}={Mark(0)}"; if (expected.HasValue) { sql += $" AND {Q("_rev")}={Mark(1)}"; values.Add(expected.Value); } }
                    try { await using var command = Command(connection, transaction, sql, values, boundColumns); var affected = await command.ExecuteNonQueryAsync(cancellation).ConfigureAwait(false); if (expected.HasValue || insertOnConflictDoNothing && write is StoragePut) { if (affected == 0) throw new ConditionalConflict(id); if (affected != 1) throw Provider(); } } catch (DbException error) when (Conflict(error) || providerConflict?.Invoke(error) == true) { throw new ConditionalConflict(id); }
                }
                await transaction.CommitAsync(cancellation).ConfigureAwait(false); return new StorageCommitResult(true);
            }
            catch (ConditionalConflict conflict) { await transaction.RollbackAsync(CancellationToken.None).ConfigureAwait(false); return new StorageCommitResult(false, new[] { conflict.Id }); }
            catch { try { await transaction.RollbackAsync(CancellationToken.None).ConfigureAwait(false); } catch (DbException) { } throw; }
        }, cancellation);
    }
    public Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default)
    {
        var index = StorageSchema.Definition(entity).Indexes.FirstOrDefault(i => i.Name == query.Index) ?? throw Invalid(); if (query.Limit is < 0 or > 100000 || index.EqualFields.Any(k => !query.EqualValues.TryGetValue(k, out var v) || string.IsNullOrEmpty(v)) || query.After is { } cursor && (!double.IsFinite(cursor.Sort) || string.IsNullOrEmpty(cursor.Id))) throw Invalid(); var values = new List<object?>(); string Add(object? value) { values.Add(value); return Mark(values.Count - 1); }
        var clauses = index.EqualFields.Select(k => $"{Q(k)}={Add(query.EqualValues[k])}").ToList(); var sort = $"COALESCE({Q(index.Sort)},0)";
        if (query.Range is { } range) foreach (var (op, value) in new[] { (">", range.Gt), (">=", range.Gte), ("<", range.Lt), ("<=", range.Lte) }) if (value.HasValue) { if (!double.IsFinite(value.Value)) throw Invalid(); clauses.Add($"{sort}{op}{Add(value.Value)}"); }
        var descending = query.Order == "desc"; var order = descending ? "DESC" : "ASC"; if (query.After is { } after) { var op = descending ? "<" : ">"; clauses.Add($"({sort}{op}{Add(after.Sort)} OR ({sort}={Add(after.Sort)} AND {Q("_id")}{op}{Add(after.Id)}))"); }
        var sql = $"SELECT {Projection(entity)} FROM {Table(entity)} WHERE {string.Join(" AND ", clauses)} ORDER BY {sort} {order},{Q("_id")} {order} LIMIT {query.Limit.ToString(CultureInfo.InvariantCulture)}";
        return WithConnection<IReadOnlyList<StorageRow>>(async connection => { await using var command = Command(connection, null, sql, values); await using var reader = await command.ExecuteReaderAsync(cancellation).ConfigureAwait(false); var rows = new List<StorageRow>(); while (await reader.ReadAsync(cancellation).ConfigureAwait(false)) rows.Add(Decode(entity, reader)); return rows; }, cancellation);
    }
    private static StorageValidationException Invalid() => new("Invalid customer SQL storage configuration or operation.");
    private static StorageProviderException Provider() => new("Customer SQL storage operation failed.");
    public async ValueTask DisposeAsync() { if (sqlite is not null && ownsConnection) await sqlite.DisposeAsync().ConfigureAwait(false); if (source is not null) await source.DisposeAsync().ConfigureAwait(false); sqliteGate.Dispose(); }
}
