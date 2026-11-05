using System.Net;
using System.Text.Json;
using Microsoft.Azure.Cosmos;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.Cosmos;
using static StorageConformanceTests;

static void Check(bool condition, string reason = "Cosmos assertion failed.") { if (!condition) throw new Exception(reason); }
using (var offline = new CosmosClient("http://127.0.0.1:9", Convert.ToBase64String(new byte[64]), new() { ConnectionMode = ConnectionMode.Gateway }))
{
    foreach (var name in new[] { "", "bad/name", "bad\0" })
    {
        try { _ = new CosmosStorageAdapter(offline.GetContainer("offline", "fixture"), new(name)); throw new Exception("Invalid namespace accepted."); }
        catch (StorageValidationException) { }
    }
    try { _ = new CosmosStorageAdapter(offline.GetContainer("offline", "fixture"), new("app") { MaxQueryRows = 0 }); throw new Exception("Invalid bound accepted."); }
    catch (StorageValidationException) { }
}
if (Environment.GetEnvironmentVariable("POLYMORFA_COSMOS_ENDPOINT") is not { } endpoint || Environment.GetEnvironmentVariable("POLYMORFA_COSMOS_KEY") is not { } key)
{
    Console.WriteLine("SKIP actual Cosmos DB: independent local emulator fixture required");
    return;
}
Check(new Uri(endpoint).Host is "127.0.0.1" or "localhost" or "::1");
using var handler = new GateHandler();
using var http = new HttpClient(handler, disposeHandler: false);
using var client = new CosmosClient(endpoint, key, new()
{
    ConnectionMode = ConnectionMode.Gateway,
    HttpClientFactory = () => http,
    RequestTimeout = TimeSpan.FromSeconds(30),
    LimitToEndpoint = true
});
var database = (await client.CreateDatabaseAsync("native_cs_" + Guid.NewGuid().ToString("N"))).Database;
try
{
    var container = (await database.CreateContainerAsync(new ContainerProperties("rows", "/namespace"))).Container;
    var options = new CosmosStorageOptions("csharp_native");
    var adapter = new CosmosStorageAdapter(container, options);
    await Conformance(adapter);
    var keys = new Dictionary<string, string> { { "sessionId", "snapshot" }, { "messageId", "row" } };
    var fields = StorageMerge.EmptyRow(StorageEntity.Messages, keys).Fields.ToDictionary(p => p.Key, p => p.Value);
    fields["text"] = JsonSerializer.SerializeToElement("original");
    fields["chatId"] = JsonSerializer.SerializeToElement("chat");
    var row = new StorageRow(StorageSchema.EncodeKey(StorageEntity.Messages, keys), 1, new Dictionary<string, double>(), fields);
    var writes = new List<StorageWrite> { new StoragePut(StorageEntity.Messages, row, null) };
    handler.BeforeRead = () => { fields["text"] = JsonSerializer.SerializeToElement("mutated"); writes.Clear(); };
    Check((await adapter.CommitAsync(writes)).Ok);
    Check((await adapter.GetAsync(StorageEntity.Messages, new[] { row.Id }))[row.Id].Fields["text"].GetString() == "original");
    var scope = new Dictionary<string, string> { { "sessionId", "snapshot" }, { "chatId", "chat" }, { "@namespace", "other" } };
    handler.BeforeQuery = () => scope["sessionId"] = "other";
    Check((await adapter.QueryAsync(StorageEntity.Messages, new("by_chat", scope, 10))).Single().Id == row.Id);
    var other = new CosmosStorageAdapter(container, new("another_customer"));
    Check((await other.GetAsync(StorageEntity.Messages, new[] { row.Id })).Count == 0);
    Check((await other.QueryAsync(StorageEntity.Messages, new("by_chat", new Dictionary<string, string> { { "sessionId", "snapshot" }, { "chatId", "chat" } }, 10))).Count == 0);
    var bounded = new CosmosStorageAdapter(container, options with { MaxQueryRows = 1 });
    try { await bounded.QueryAsync(StorageEntity.Messages, new("by_chat", new Dictionary<string, string> { { "sessionId", "snapshot" }, { "chatId", "chat" } }, 10)); throw new Exception("Read bound ignored."); }
    catch (StorageProviderException) { }

    // Change a row after the adapter reads its revision/ETag and before the native
    // atomic batch reaches the emulator. The first insert must roll back as well.
    var winner = row with { Revision = 2, Fields = row.Fields.ToDictionary(p => p.Key, p => p.Value) };
    var candidate = StorageMerge.EmptyRow(StorageEntity.Messages, new Dictionary<string, string> { { "sessionId", "race" }, { "messageId", "candidate" } }) with { Revision = 1 };
    handler.BeforeBatch = async () => Check((await adapter.CommitAsync(new StorageWrite[] { new StoragePut(StorageEntity.Messages, winner, 1) })).Ok);
    var raced = await adapter.CommitAsync(new StorageWrite[] { new StoragePut(StorageEntity.Messages, candidate, null), new StoragePut(StorageEntity.Messages, row with { Revision = 2 }, 1) });
    Check(!raced.Ok);
    Check((await adapter.GetAsync(StorageEntity.Messages, new[] { candidate.Id })).Count == 0);
    Check((await adapter.GetAsync(StorageEntity.Messages, new[] { row.Id }))[row.Id].Revision == 2);
    Check(handler.BatchRaceExercised, "Native atomic-batch ETag race was not exercised.");

    var malformedId = "ksafe:identity";
    using (var body = new MemoryStream(JsonSerializer.SerializeToUtf8Bytes(new
    {
        id = "messages:" + malformedId,
        @namespace = options.Namespace,
        entity = "messages",
        deleted = false,
        row = StorageMerge.EmptyRow(StorageEntity.Messages, new Dictionary<string, string> { { "sessionId", "safe" }, { "messageId", "different" } }) with { Revision = 1 }
    })))
    using (var response = await container.CreateItemStreamAsync(body, new PartitionKey(options.Namespace))) Check(response.IsSuccessStatusCode);
    try { await adapter.GetAsync(StorageEntity.Messages, new[] { malformedId }); throw new Exception("Corrupt document accepted."); }
    catch (StorageProviderException error) { Check(!error.ToString().Contains(endpoint, StringComparison.Ordinal) && !error.ToString().Contains(key, StringComparison.Ordinal)); }
    var wrongPartition = (await database.CreateContainerAsync(new ContainerProperties("wrong_partition", "/other"))).Container;
    try { await new CosmosStorageAdapter(wrongPartition, options).SetupAsync(); throw new Exception("Wrong partition accepted."); }
    catch (StorageProviderException) { }
    Console.WriteLine("PASS actual Cosmos DB emulator/official .NET driver: all 17 entities, literal/scalar JSON, 2000 history, replay/checkpoints, expired-writer fence, atomic ETag-race rollback, tombstones, namespaces, partition/read bounds, caller snapshots and malformed-row refusal");
}
finally { await database.DeleteAsync(); }

sealed class GateHandler : DelegatingHandler
{
    internal Action? BeforeRead;
    internal Action? BeforeQuery;
    internal Func<Task>? BeforeBatch;
    internal bool BatchRaceExercised;
    internal GateHandler() : base(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { }
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellation)
    {
        if (request.Headers.Contains("Origin") || request.Headers.Contains("Cookie") || request.Headers.Any(p => p.Key.StartsWith("Polymorfa", StringComparison.OrdinalIgnoreCase))) throw new Exception("API credentials reached customer storage.");
        if (request.Headers.Authorization?.ToString().Contains("pmfa_", StringComparison.Ordinal) == true) throw new Exception("API credential reached customer storage.");
        if (request.Method == HttpMethod.Get && request.RequestUri!.AbsolutePath.Contains("/docs/", StringComparison.Ordinal)) Interlocked.Exchange(ref BeforeRead, null)?.Invoke();
        if (request.Headers.Contains("x-ms-documentdb-isquery")) Interlocked.Exchange(ref BeforeQuery, null)?.Invoke();
        if (request.Headers.Contains("x-ms-cosmos-is-batch-request") && Interlocked.Exchange(ref BeforeBatch, null) is { } race)
        {
            BatchRaceExercised = true;
            await race().ConfigureAwait(false);
        }
        return await base.SendAsync(request, cancellation).ConfigureAwait(false);
    }
}
