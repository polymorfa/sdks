using System.Text.Json;
using System.Text.Json.Serialization;
using Polymorfa.Sdk;
using Polymorfa.Sdk.Storage;

// Historical MESSAGE_EDIT upserts honor chat.clear/chat.delete watermarks like the TS producer.
internal static class HistoryEditGuard
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
    private static void Check(bool value, string label) { if (!value) throw new Exception(label); }
    internal static async Task Run()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures/history-edit-guard.json")));
        var cases = fixture.RootElement.GetProperty("cases").EnumerateArray().ToArray();
        Check(cases.Length == 13, "Edit guard cases");
        var mismatches = new List<string>();
        foreach (var c in cases)
        {
            var name = c.GetProperty("name").GetString()!;
            var storage = new CustomerStorage(new MemoryStorageAdapter());
            var i = 0;
            foreach (var step in c.GetProperty("steps").EnumerateArray())
            {
                var batch = step.TryGetProperty("history", out var history)
                    ? StorageReducers.ReduceHistoryChunk(history.Deserialize<StorageHistoryInput>(Json)!)
                    : StorageReducers.ReduceEvent(step.GetProperty("event").Deserialize<WebhookEnvelope>(Json)!);
                if (StorageMerge.CanonicalJson(JsonSerializer.SerializeToElement(batch.Operations, Json)) != StorageMerge.CanonicalJson(step.GetProperty("operations"))) mismatches.Add(name + " step " + i + " operations");
                Check((await storage.ApplyAsync(batch)).Applied == step.GetProperty("applied").GetBoolean(), name + " applied " + i);
                i++;
            }
            foreach (var x in c.GetProperty("expect").EnumerateArray())
            {
                var entity = StorageEntityOf(x.GetProperty("entity").GetString()!);
                var row = await storage.GetAsync(entity, x.GetProperty("key").Deserialize<Dictionary<string, string>>()!);
                var text = row is not null && row.TryGetValue("text", out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
                var want = x.GetProperty("text").ValueKind == JsonValueKind.String ? x.GetProperty("text").GetString() : null;
                Check(text == want, $"{name} text {text ?? "absent"} want {want ?? "absent"}");
            }
            foreach (var entityRows in c.GetProperty("rows").EnumerateObject())
            {
                var entity = StorageEntityOf(entityRows.Name);
                foreach (var want in entityRows.Value.EnumerateArray())
                {
                    var key = StorageSchema.Definition(entity).Key.ToDictionary(k => k, k => want.GetProperty(k).GetString()!);
                    var row = await storage.GetAsync(entity, key);
                    Check(row is not null && StorageMerge.CanonicalJson(JsonSerializer.SerializeToElement(row)) == StorageMerge.CanonicalJson(want), name + " rows " + entity);
                }
            }
        }
        Check(mismatches.Count == 0, string.Join(", ", mismatches));
        Console.WriteLine($"PASS history edit guard: {cases.Length} producer cases, operations, rows and replay");
    }
    private static StorageEntity StorageEntityOf(string name) => Enum.GetValues<StorageEntity>().Single(e => StorageSchema.Definition(e).Name == name);
}
