using System.Text.Json;
using System.Text.Json.Serialization;
using Polymorfa.Sdk.Storage;

internal static class NumericStrings
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
    private static void Check(bool value, string label) { if (!value) throw new Exception(label); }
    private static void EqualJson(object value, JsonElement expected, string label) => Check(StorageMerge.CanonicalJson(JsonSerializer.SerializeToElement(value, Json)) == StorageMerge.CanonicalJson(expected), label);
    private static void Snapshot(MemoryStorageAdapter memory, JsonElement expected)
    {
        foreach (var entity in Enum.GetValues<StorageEntity>().Where(e => e is not (StorageEntity.Events or StorageEntity.Leases)))
        {
            var actual = memory.Rows(entity).Select(r => StorageMerge.CanonicalJson(JsonSerializer.SerializeToElement(r.Fields))).Order(StringComparer.Ordinal);
            var want = expected.GetProperty(StorageSchema.Definition(entity).Name).EnumerateArray().Select(StorageMerge.CanonicalJson).Order(StringComparer.Ordinal);
            Check(actual.SequenceEqual(want), "Numeric rows " + entity);
        }
    }
    internal static async Task Run()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures/proto-number.json")));
        var vectors = 0;
        foreach (var vector in fixture.RootElement.GetProperty("strings").EnumerateArray())
        {
            var input = vector.GetProperty("input").GetString()!;
            var number = new StorageHistoryNumber(input).ToNumber();
            var bits = number is { } n ? unchecked((ulong)BitConverter.DoubleToInt64Bits(n)).ToString("x16") : null;
            Check(bits == vector.GetProperty("bits").GetString(), "Numeric bits " + JsonSerializer.Serialize(input));
            var batch = StorageReducers.ReduceHistoryChunk(new("numeric", new() { SyncType = 3, ChunkOrder = 16, Progress = input }));
            var progress = batch.Operations.OfType<StorageUpsert>().Single(op => op.Entity == StorageEntity.HistoryProgress);
            var reducerBits = progress.Fields.TryGetValue("progress", out var value) ? unchecked((ulong)BitConverter.DoubleToInt64Bits(value.Value.GetDouble())).ToString("x16") : null;
            Check(reducerBits == bits, "Public reducer numeric bits");
            // The wire representation remains the caller's string.
            Check(JsonSerializer.SerializeToElement(new StorageHistoryNumber(input)).GetString() == input, "Proto number wire representation");
            vectors++;
        }
        var histories = 0;
        foreach (var h in fixture.RootElement.GetProperty("histories").EnumerateArray())
        {
            var memory = new MemoryStorageAdapter(); var storage = new CustomerStorage(memory);
            var batch = StorageReducers.ReduceHistoryChunk(new("numeric", StorageHistoryChunk.FromJson(h.GetProperty("chunk")), ChunkId: h.GetProperty("name").GetString()));
            EqualJson(batch.Operations, h.GetProperty("operations"), "Numeric operations");
            Check((await storage.ApplyAsync(batch)).Applied, "Numeric apply"); Snapshot(memory, h.GetProperty("rows"));
            Check(!(await storage.ApplyAsync(batch)).Applied, "Numeric replay");
            var i = 0;
            foreach (var cleanup in h.GetProperty("cleanup").EnumerateArray())
            {
                var operations = cleanup.GetProperty("operations").Deserialize<StorageOperation[]>(Json)!;
                await storage.ApplyAsync(new("numeric", operations));
                await storage.ApplyAsync(batch with { EventId = "late" + i++ }); Snapshot(memory, cleanup.GetProperty("rows"));
            }
            histories++;
        }
        var strict = new CustomerStorage(new MemoryStorageAdapter());
        try { await strict.ApplyAsync(new("numeric", [new StorageUpsert(StorageEntity.Messages, new Dictionary<string, string> { ["sessionId"] = "numeric", ["messageId"] = "strict" }, new Dictionary<string, StorageFieldWrite> { ["timestamp"] = new(JsonSerializer.SerializeToElement("16"), 1) })])); throw new Exception("Generic numeric string accepted"); } catch (StorageValidationException) { }
        try { JsonSerializer.Deserialize<StorageRow>("{\"_id\":\"strict\",\"_rev\":\"16\",\"_v\":{}}"); throw new Exception("String revision accepted"); } catch (JsonException) { }
        Console.WriteLine($"PASS numeric strings: {vectors} exact-bit public values/reductions and {histories} memory histories/replay/watermarks");
    }
}
