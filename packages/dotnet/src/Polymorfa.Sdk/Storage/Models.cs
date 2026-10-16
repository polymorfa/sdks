using System.Text.Json;
using System.Text.Json.Serialization;
namespace Polymorfa.Sdk.Storage;

public class StorageException(string message) : Exception(message);
public sealed class StorageValidationException(string message) : StorageException(message);
public sealed class StorageProviderException(string message) : StorageException(message);
public sealed class StorageLeaseLostException() : StorageException("Storage lease expired or changed; resume from the saved checkpoint.");
public sealed class StorageCheckpointConflictException() : StorageException("Storage checkpoint changed; resume from the saved checkpoint.");
public sealed class StorageConflictException(IReadOnlyList<string> ids) : StorageException($"Storage kept conflicting ({ids.Count} rows).") { public IReadOnlyList<string> Ids { get; } = ids; }
public sealed record StorageFieldWrite(JsonElement Value, double Version) { public override string ToString() => "StorageFieldWrite(redacted)"; }
public sealed record StorageGuard(string SessionId, string ChatId, double Timestamp);
[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
[JsonDerivedType(typeof(StorageUpsert), "upsert")]
[JsonDerivedType(typeof(StoragePatch), "patch")]
[JsonDerivedType(typeof(StorageDelete), "delete")]
[JsonDerivedType(typeof(StorageClearChat), "clearChat")]
[JsonDerivedType(typeof(StorageCheckpoint), "checkpoint")]
public abstract record StorageOperation;
public sealed record StorageUpsert(StorageEntity Entity, IReadOnlyDictionary<string, string> Key, IReadOnlyDictionary<string, StorageFieldWrite> Fields, StorageGuard? Guard = null) : StorageOperation;
public sealed record StoragePatch(StorageEntity Entity, IReadOnlyDictionary<string, string> Key, IReadOnlyDictionary<string, StorageFieldWrite> Fields, StorageGuard? Guard = null) : StorageOperation;
public sealed record StorageDelete(StorageEntity Entity, IReadOnlyDictionary<string, string> Key) : StorageOperation;
public sealed record StorageClearChat(string SessionId, string ChatId, double UpTo) : StorageOperation;
public sealed record StorageCheckpoint(string SessionId, string Stream, string Cursor, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> ExpectedCursor = default, JsonElement? Position = null, double? UpdatedAt = null) : StorageOperation;
public sealed record StorageBatch(string SessionId, IReadOnlyList<StorageOperation> Operations, string? EventId = null, string? EventType = null);
[JsonConverter(typeof(StorageRowConverter))]
public sealed record StorageRow(string Id, long Revision, IReadOnlyDictionary<string, double> Versions, IReadOnlyDictionary<string, JsonElement> Fields)
{
    public override string ToString() => "StorageRow(redacted)";
}
[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
[JsonDerivedType(typeof(StoragePut), "put")]
[JsonDerivedType(typeof(StorageRowDelete), "delete")]
public abstract record StorageWrite;
public sealed record StoragePut(StorageEntity Entity, StorageRow Row, [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] long? ExpectedRev) : StorageWrite;
public sealed record StorageRowDelete(StorageEntity Entity, string Id, long? ExpectedRev = null) : StorageWrite;
public sealed record StorageCommitResult(bool Ok, IReadOnlyList<string>? Conflicts = null);
public sealed record StorageCapabilities(bool AtomicCommit, int MaxCommitSize);
public sealed record StorageIndexRange(double? Gt = null, double? Gte = null, double? Lt = null, double? Lte = null);
public sealed record StorageIndexCursor(double Sort, string Id);
public sealed record StorageIndexQuery(string Index, [property: JsonPropertyName("equals")] IReadOnlyDictionary<string, string> EqualValues, int Limit, StorageIndexRange? Range = null, string? Order = null, StorageIndexCursor? After = null);
public interface IStorageAdapter
{
    string Name { get; }
    StorageCapabilities Capabilities { get; }
    Task SetupAsync(CancellationToken cancellation = default) => Task.CompletedTask;
    Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default);
    Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default);
    Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default);
}
internal sealed class StorageRowConverter : JsonConverter<StorageRow>
{
    public override StorageRow Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader); var body = doc.RootElement; var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal); foreach (var field in body.EnumerateObject()) if (field.Name is not ("_id" or "_rev" or "_v")) fields.Add(field.Name, field.Value.Clone());
        var versions = body.GetProperty("_v").Deserialize<Dictionary<string, double>>(options) ?? throw new JsonException("Invalid row versions."); return new(body.GetProperty("_id").GetString() ?? throw new JsonException("Invalid row ID."), body.GetProperty("_rev").GetInt64(), versions, fields);
    }
    public override void Write(Utf8JsonWriter writer, StorageRow row, JsonSerializerOptions options)
    {
        writer.WriteStartObject(); writer.WriteString("_id", row.Id); writer.WriteNumber("_rev", row.Revision); writer.WritePropertyName("_v"); JsonSerializer.Serialize(writer, row.Versions, options); foreach (var field in row.Fields) { if (field.Key is "_id" or "_rev" or "_v") throw new JsonException("A row cannot override system columns."); writer.WritePropertyName(field.Key); field.Value.WriteTo(writer); }
        writer.WriteEndObject();
    }
}
