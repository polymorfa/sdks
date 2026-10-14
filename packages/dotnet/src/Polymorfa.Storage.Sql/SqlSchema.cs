using Polymorfa.Sdk.Storage;
using System.Text;
namespace Polymorfa.Storage.Sql;

public enum StorageSqlDialect { Postgres, MySql, Sqlite }
public sealed record SqlStorageOptions
{
    public string TablePrefix { get; init; } = "polymorfa_";
    public string? Schema { get; init; }
    public bool CreateTables { get; init; } = true;
}
/// <summary>Schema-2 DDL. Identifiers are validated; caller data never enters an SQL identifier.</summary>
public static class StorageSqlSchema
{
    internal static string Quote(StorageSqlDialect dialect, string name)
    {
        if (string.IsNullOrEmpty(name) || !(char.IsAsciiLetter(name[0]) || name[0] == '_') || name.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '_')) throw new StorageValidationException("Invalid customer SQL identifier."); if (dialect == StorageSqlDialect.Postgres && Encoding.UTF8.GetByteCount(name) > 63 || dialect == StorageSqlDialect.MySql && name.Length > 64) throw new StorageValidationException("Derived SQL identifier exceeds the selected database limit."); var quote = dialect == StorageSqlDialect.MySql ? '`' : '"'; return $"{quote}{name}{quote}";
    }
    internal static string ColumnName(string field) { if (field.StartsWith('_')) return field; var result = new StringBuilder(); foreach (var c in field) { if (char.IsAsciiLetterUpper(c)) result.Append('_').Append(char.ToLowerInvariant(c)); else result.Append(c); } return result.ToString(); }
    internal static string Q(StorageSqlDialect dialect, string field) => Quote(dialect, ColumnName(field));
    internal static string Table(StorageSqlDialect dialect, SqlStorageOptions options, string name)
    {
        var table = Quote(dialect, options.TablePrefix + name); return options.Schema is { } schema && dialect == StorageSqlDialect.Postgres ? Quote(dialect, schema) + "." + table : table;
    }
    internal static string Type(StorageSqlDialect dialect, StorageFieldType kind) => (dialect, kind) switch
    {
        (StorageSqlDialect.Postgres, StorageFieldType.Number) => "double precision",
        (StorageSqlDialect.Postgres, StorageFieldType.Boolean) => "boolean",
        (StorageSqlDialect.Postgres, StorageFieldType.Json) => "jsonb",
        (StorageSqlDialect.MySql, StorageFieldType.String) => "mediumtext",
        (StorageSqlDialect.MySql, StorageFieldType.Number) => "double",
        (StorageSqlDialect.MySql, StorageFieldType.Boolean) => "tinyint(1)",
        (StorageSqlDialect.MySql, StorageFieldType.Json) => "json",
        (_, StorageFieldType.Number) => "real",
        (_, StorageFieldType.Boolean) => "integer",
        _ => "text"
    };
    private static string KeyType(StorageSqlDialect dialect, bool id = false) => dialect switch { StorageSqlDialect.Postgres when id => "text COLLATE \"C\"", StorageSqlDialect.MySql when id => "varchar(1024) CHARACTER SET ascii COLLATE ascii_bin", StorageSqlDialect.MySql => "varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin", _ => "text" };
    public static IReadOnlyList<string> Statements(StorageSqlDialect dialect, SqlStorageOptions? configuration = null)
    {
        var options = configuration ?? new(); _ = Quote(dialect, options.TablePrefix); if (options.TablePrefix.Length > 64 || options.Schema is not null && dialect != StorageSqlDialect.Postgres) throw new StorageValidationException("Invalid SQL naming options."); var result = new List<string>(); if (options.Schema is { } schema) result.Add("CREATE SCHEMA IF NOT EXISTS " + Quote(dialect, schema));
        foreach (var entity in Enum.GetValues<StorageEntity>())
        {
            var definition = StorageSchema.Definition(entity); var table = Table(dialect, options, definition.Name); string Q(string name) => StorageSqlSchema.Q(dialect, name); var columns = new List<string> { $"{Q("_id")} {KeyType(dialect, true)} NOT NULL PRIMARY KEY" }; columns.AddRange(definition.Key.Select(k => $"{Q(k)} {KeyType(dialect)} NOT NULL"));
            foreach (var (field, type) in definition.Fields) { var indexed = definition.Indexes.Any(i => i.EqualFields.Contains(field)); columns.Add($"{Q(field)} {(dialect == StorageSqlDialect.MySql && type == StorageFieldType.String && indexed ? KeyType(dialect) : Type(dialect, type))}"); }
            columns.Add($"{Q("_rev")} bigint NOT NULL"); columns.Add($"{Q("_v")} {Type(dialect, StorageFieldType.Json)} NOT NULL"); var indexes = new List<string>();
            foreach (var index in definition.Indexes) { var name = Quote(dialect, options.TablePrefix + definition.Name + "_" + index.Name); var fields = string.Join(", ", index.EqualFields.Concat(new[] { index.Sort, "_id" }).Select(Q)); if (dialect == StorageSqlDialect.MySql) columns.Add($"KEY {name} ({fields})"); else indexes.Add($"CREATE INDEX IF NOT EXISTS {name} ON {table} ({fields})"); }
            if (dialect == StorageSqlDialect.MySql) columns.Add($"UNIQUE KEY {Quote(dialect, options.TablePrefix + definition.Name + "_key")} ({string.Join(", ", definition.Key.Select(Q))})"); result.Add($"CREATE TABLE IF NOT EXISTS {table} ({string.Join(", ", columns)})" + (dialect == StorageSqlDialect.MySql ? " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin" : "")); result.AddRange(indexes);
        }
        var meta = Table(dialect, options, "storage_schema"); var id = Quote(dialect, "id"); var version = Quote(dialect, "version"); result.Add($"CREATE TABLE IF NOT EXISTS {meta} ({id} {KeyType(dialect)} PRIMARY KEY, {version} integer NOT NULL)"); result.Add($"INSERT INTO {meta} ({id},{version}) VALUES ('storage',2) " + (dialect == StorageSqlDialect.MySql ? $"ON DUPLICATE KEY UPDATE {version}=VALUES({version})" : $"ON CONFLICT ({id}) DO UPDATE SET {version}=excluded.{version}")); return result;
    }
}
