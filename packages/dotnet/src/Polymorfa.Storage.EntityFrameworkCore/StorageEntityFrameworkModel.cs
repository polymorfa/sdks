using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.Sql;

namespace Polymorfa.Storage.EntityFrameworkCore;

/// <summary>Schema-2 property-bag models. Configuration performs no database access or schema installation.</summary>
public static class StorageEntityFrameworkModel
{
    public static string EntityName(StorageEntity entity) => "Polymorfa.Storage." + StorageSchema.Definition(entity).Name;
    private static string Column(string name)
    {
        if (name.StartsWith('_')) return name;
        var output = new StringBuilder();
        foreach (var c in name) { if (char.IsAsciiLetterUpper(c)) output.Append('_').Append(char.ToLowerInvariant(c)); else output.Append(c); }
        return output.ToString();
    }
    internal static void Validate(StorageSqlDialect dialect, SqlStorageOptions options)
    {
        if (!Enum.IsDefined(dialect) || OperatingSystem.IsBrowser()) throw new StorageValidationException("Entity Framework storage requires a supported server SQL dialect.");
        _ = StorageSqlSchema.Statements(dialect, options);
    }
    private static string JsonText(JsonElement value) => value.ValueKind == JsonValueKind.Undefined ? throw new StorageValidationException("Undefined JSON cannot be stored.") : value.GetRawText();
    private static JsonElement Parse(string value) { using var document = JsonDocument.Parse(value); return document.RootElement.Clone(); }
    private static readonly ValueConverter<JsonElement, string> JsonConverter = new(value => JsonText(value), value => Parse(value));
    private static readonly ValueComparer<JsonElement> JsonComparer = new((a, b) => JsonText(a) == JsonText(b), value => StringComparer.Ordinal.GetHashCode(JsonText(value)), value => value.Clone());
    private static readonly ValueComparer<JsonElement?> NullableJsonComparer = new((a, b) => a.HasValue == b.HasValue && (!a.HasValue || JsonText(a.Value) == JsonText(b!.Value)), value => value.HasValue ? StringComparer.Ordinal.GetHashCode(JsonText(value.Value)) : 0, value => value.HasValue ? value.Value.Clone() : null);
    private static PropertyBuilder Configure(PropertyBuilder property, string name, StorageFieldType type, StorageSqlDialect dialect, bool key = false)
    {
        property.HasColumnName(Column(name));
        if (type == StorageFieldType.Json) { property.HasColumnType(dialect switch { StorageSqlDialect.Postgres => "jsonb", StorageSqlDialect.MySql => "json", _ => "text" }); property.HasConversion(JsonConverter); property.Metadata.SetValueComparer(property.Metadata.ClrType == typeof(JsonElement?) ? NullableJsonComparer : JsonComparer); }
        else if (type == StorageFieldType.String)
        {
            property.HasColumnType(dialect == StorageSqlDialect.MySql ? key ? name == "_id" ? "varchar(1024)" : "varchar(191)" : "mediumtext" : "text");
            if (dialect == StorageSqlDialect.MySql && key) { property.HasMaxLength(name == "_id" ? 1024 : 191); property.HasAnnotation("MySql:CharSet", name == "_id" ? "ascii" : "utf8mb4"); property.UseCollation(name == "_id" ? "ascii_bin" : "utf8mb4_bin"); }
            else if (dialect == StorageSqlDialect.Postgres && name == "_id") property.UseCollation("C");
        }
        else property.HasColumnType((dialect, type) switch { (StorageSqlDialect.Postgres, StorageFieldType.Number) => "double precision", (StorageSqlDialect.MySql, StorageFieldType.Number) => "double", (_, StorageFieldType.Number) => "real", (StorageSqlDialect.Postgres, _) => "boolean", (StorageSqlDialect.MySql, _) => "tinyint(1)", _ => "integer" });
        return property;
    }
    /// <summary>Adds all 17 shared-type entity models, with portable logical property names and native SQL column names.</summary>
    public static ModelBuilder ConfigurePolymorfaStorage(this ModelBuilder model, StorageSqlDialect dialect, SqlStorageOptions? configuration = null)
    {
        var options = configuration ?? new(); Validate(dialect, options);
        if (Enum.GetValues<StorageEntity>().Any(entity => model.Model.FindEntityType(EntityName(entity)) is not null)) throw new StorageValidationException("A storage model can configure one SQL prefix and schema only.");
        foreach (var entity in Enum.GetValues<StorageEntity>())
        {
            var definition = StorageSchema.Definition(entity);
            model.SharedTypeEntity<Dictionary<string, object?>>(EntityName(entity), builder =>
            {
                builder.ToTable(options.TablePrefix + definition.Name, options.Schema);
                Configure(builder.IndexerProperty<string>("_id"), "_id", StorageFieldType.String, dialect, true).IsRequired().ValueGeneratedNever(); builder.HasKey("_id");
                builder.IndexerProperty<long>("_rev").HasColumnName("_rev").HasColumnType("bigint").IsRequired().IsConcurrencyToken().ValueGeneratedNever();
                Configure(builder.IndexerProperty<JsonElement>("_v"), "_v", StorageFieldType.Json, dialect).IsRequired();
                foreach (var key in definition.Key) Configure(builder.IndexerProperty<string>(key), key, StorageFieldType.String, dialect, true).IsRequired();
                foreach (var (field, type) in definition.Fields)
                {
                    var property = type switch { StorageFieldType.String => (PropertyBuilder)builder.IndexerProperty<string?>(field), StorageFieldType.Number => builder.IndexerProperty<double?>(field), StorageFieldType.Boolean => builder.IndexerProperty<bool?>(field), StorageFieldType.Json => builder.IndexerProperty<JsonElement?>(field), _ => throw new StorageValidationException("Unknown storage field type.") };
                    Configure(property, field, type, dialect, definition.Indexes.Any(i => i.EqualFields.Contains(field))).IsRequired(false);
                }
                foreach (var index in definition.Indexes) builder.HasIndex(index.EqualFields.Concat(new[] { index.Sort, "_id" }).ToArray()).HasDatabaseName(options.TablePrefix + definition.Name + "_" + index.Name);
                if (dialect == StorageSqlDialect.MySql) builder.HasIndex(definition.Key.ToArray()).IsUnique().HasDatabaseName(options.TablePrefix + definition.Name + "_key");
            });
        }
        return model;
    }
    public static DbSet<Dictionary<string, object?>> StorageRows(this DbContext context, StorageEntity entity) => context.Set<Dictionary<string, object?>>(EntityName(entity));
}

/// <summary>Convenience context whose EF model cache includes the dialect, table prefix and SQL schema.</summary>
public sealed class PolymorfaStorageDbContext : DbContext
{
    public StorageSqlDialect Dialect { get; }
    public SqlStorageOptions Naming { get; }
    public PolymorfaStorageDbContext(DbContextOptions<PolymorfaStorageDbContext> options, StorageSqlDialect dialect, SqlStorageOptions? naming = null) : base(options)
    { Dialect = dialect; Naming = naming ?? new(); StorageEntityFrameworkModel.Validate(Dialect, Naming); }
    protected override void OnConfiguring(DbContextOptionsBuilder options) => options.ReplaceService<IModelCacheKeyFactory, StorageModelCacheKeyFactory>();
    protected override void OnModelCreating(ModelBuilder model) => model.ConfigurePolymorfaStorage(Dialect, Naming);
}
internal sealed class StorageModelCacheKeyFactory : IModelCacheKeyFactory
{
    public object Create(DbContext context, bool designTime) => context is PolymorfaStorageDbContext storage ? (context.GetType(), storage.Dialect, storage.Naming.TablePrefix, storage.Naming.Schema, designTime) : (object)(context.GetType(), designTime);
}
