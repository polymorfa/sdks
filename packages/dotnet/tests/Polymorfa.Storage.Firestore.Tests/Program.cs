using Google.Api.Gax;
using Google.Cloud.Firestore;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.Firestore;
using System.Text.Json;
using static StorageConformanceTests;
static void Check(bool condition) { if (!condition) throw new Exception("Firestore assertion failed."); }
// Explicit emulator-only construction cannot select an operator's ADC credentials.
var endpoint = Environment.GetEnvironmentVariable("FIRESTORE_EMULATOR_HOST");
if (endpoint is null) { Console.WriteLine("SKIP actual Firestore: independent emulator environment required"); return; }
Check(Uri.TryCreate("http://" + endpoint, UriKind.Absolute, out var uri) && uri.Host is "127.0.0.1" or "localhost" or "::1");
var database = await new FirestoreDbBuilder { ProjectId = "sdk-fixture-go", EmulatorDetection = EmulatorDetection.EmulatorOnly }.BuildAsync();
foreach (var name in new[] { "", "bad/name", "bad\0" }) { try { _ = new FirestoreStorageAdapter(database, new(name)); throw new Exception("Invalid namespace accepted."); } catch (StorageValidationException) { } }
try { _ = new FirestoreStorageAdapter(database, new("app") { MaxQueryRows = 0 }); throw new Exception("Invalid bound accepted."); } catch (StorageValidationException) { }
var ns = "cs_" + Guid.NewGuid().ToString("N"); var adapter = new FirestoreStorageAdapter(database, new(ns));
Check(adapter.Capabilities.AtomicCommit && adapter.Capabilities.MaxCommitSize == 250);
try
{
    await Conformance(adapter);
    var collection = database.Collection("polymorfa_" + ns + "_messages");
    var history = (await collection.WhereEqualTo("chatId", "chat").WhereGreaterThan("timestamp", 1000).Limit(1).GetSnapshotAsync()).Documents.Single();
    var query = new StorageIndexQuery("by_chat", new Dictionary<string, string> { { "sessionId", history.GetValue<string>("sessionId") }, { "chatId", "chat" }, { "unknown.field", "ignored" } }, 10);
    Check((await adapter.QueryAsync(StorageEntity.Messages, query)).Count == 10);
    var other = new FirestoreStorageAdapter(database, new(ns + "_other")); Check((await other.GetAsync(StorageEntity.Messages, new[] { "kscalars:json" })).Count == 0); Check((await other.QueryAsync(StorageEntity.Messages, query)).Count == 0);
    var bounded = new FirestoreStorageAdapter(database, new(ns) { MaxQueryRows = 10 }); try { await bounded.QueryAsync(StorageEntity.Messages, query); throw new Exception("Read bound ignored."); } catch (StorageProviderException) { }
    foreach (var id in new[] { "", ".", "..", "bad/path", new string('x', 1501) }) { try { await adapter.GetAsync(StorageEntity.Messages, new[] { id }); throw new Exception("Invalid document accepted."); } catch (StorageValidationException) { } }
    try { await adapter.CommitAsync(Enumerable.Range(0, 251).Select(i => (StorageWrite)new StorageRowDelete(StorageEntity.Messages, "knever:" + i)).ToArray()); throw new Exception("Oversized transaction accepted."); } catch (StorageValidationException) { }
    var keys = new Dictionary<string, string> { { "sessionId", "snapshot-session" }, { "messageId", "snapshot-row" } }; var fields = StorageMerge.EmptyRow(StorageEntity.Messages, keys).Fields.ToDictionary(p => p.Key, p => p.Value); fields["text"] = JsonSerializer.SerializeToElement("original"); fields["chatId"] = JsonSerializer.SerializeToElement("snapshot-chat"); fields["timestamp"] = JsonSerializer.SerializeToElement(4); var row = new StorageRow(StorageSchema.EncodeKey(StorageEntity.Messages, keys), 1, new Dictionary<string, double>(), fields); var writes = new List<StorageWrite> { new StoragePut(StorageEntity.Messages, row, null) }; var pendingWrite = adapter.CommitAsync(writes); Check(!pendingWrite.IsCompleted); fields["text"] = JsonSerializer.SerializeToElement("mutated"); writes.Clear(); Check((await pendingWrite).Ok); Check((await adapter.GetAsync(StorageEntity.Messages, new[] { row.Id }))[row.Id].Fields["text"].GetString() == "original");
    var scope = new Dictionary<string, string> { { "sessionId", "snapshot-session" }, { "chatId", "snapshot-chat" } }; var pendingQuery = adapter.QueryAsync(StorageEntity.Messages, new("by_chat", scope, 10)); Check(!pendingQuery.IsCompleted); scope["sessionId"] = "different-session"; Check((await pendingQuery).Single().Id == row.Id);
    foreach (var mode in new[] { "identity", "timestamp" })
    {
        var id = "ksafe:" + mode; var malformed = new Dictionary<string, object> { { "_id", id }, { "_rev", 1L }, { "_v", new Dictionary<string, object>() }, { "sessionId", "safe" }, { "messageId", mode == "identity" ? "different" : mode } }; if (mode == "timestamp") malformed["extra"] = Timestamp.FromDateTime(DateTime.UnixEpoch); await collection.Document(id).SetAsync(malformed);
        try { await adapter.GetAsync(StorageEntity.Messages, new[] { id }); throw new Exception("Corrupt/native-only value accepted."); } catch (StorageProviderException error) { Check(!error.ToString().Contains(endpoint, StringComparison.Ordinal)); }
    }
    Console.WriteLine("PASS actual Firestore emulator/official .NET driver: all17entities,literal JSON,250-write native transactions,2000history,rollback,replay,checkpoint,expired-writer fence,closed query scope,namespace/read bounds,corrupted/native-type refusal");
}
finally
{
    // Only this run's unique namespace is removed; never reset the shared project.
    foreach (var entity in Enum.GetValues<StorageEntity>())
    {
        var collection = database.Collection("polymorfa_" + ns + "_" + StorageSchema.Definition(entity).Name);
        while (true) { var page = await collection.Limit(250).GetSnapshotAsync(); if (page.Count == 0) break; var batch = database.StartBatch(); foreach (var row in page.Documents) batch.Delete(row.Reference); await batch.CommitAsync(); }
    }
}
