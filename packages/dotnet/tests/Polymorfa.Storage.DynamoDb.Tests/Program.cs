using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.Runtime;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.DynamoDb;
using System.Text.Json;
using static StorageConformanceTests;
static void Check(bool condition) { if (!condition) throw new Exception("DynamoDB assertion failed."); }
using (var offline = new AmazonDynamoDBClient(new BasicAWSCredentials("synthetic-test-access", "synthetic-test-secret"), new AmazonDynamoDBConfig { ServiceURL = "http://127.0.0.1:9", AuthenticationRegion = "us-east-1", MaxErrorRetry = 0 }))
{
    foreach (var name in new[] { "", "bad/name", "bad\0" }) { try { _ = new DynamoDbStorageAdapter(offline, new(name, "table")); throw new Exception("Invalid namespace accepted."); } catch (StorageValidationException) { } }
    foreach (var table in new[] { "", "bad\r\n" }) { try { _ = new DynamoDbStorageAdapter(offline, new("app", table)); throw new Exception("Invalid table accepted."); } catch (StorageValidationException) { } }
    try { _ = new DynamoDbStorageAdapter(offline, new("app", "table") { MaxQueryRows = 0 }); throw new Exception("Invalid read bound accepted."); } catch (StorageValidationException) { }
}
await DynamoDbNegativeWire.Run();
var endpoint = Environment.GetEnvironmentVariable("POLYMORFA_DYNAMODB_ENDPOINT"); if (endpoint is null) { Console.WriteLine("SKIP actual DynamoDB Local: independent fixture environment required"); return; }
using var client = new Observed(new BasicAWSCredentials(Environment.GetEnvironmentVariable("POLYMORFA_DYNAMODB_ACCESS_KEY"), Environment.GetEnvironmentVariable("POLYMORFA_DYNAMODB_SECRET_KEY")), new AmazonDynamoDBConfig { ServiceURL = endpoint, AuthenticationRegion = "us-east-1", MaxErrorRetry = 0, HttpClientFactory = new StrictHttp() }); var tableName = "native-csharp-" + Guid.NewGuid().ToString("N"); var adapter = new DynamoDbStorageAdapter(client, new("csharp_native", tableName) { CreateTable = true });
try
{
    await Conformance(adapter); Check(client.MaxBatchGet <= 100 && client.MaxTransaction <= 100 && client.QueryPages >= 2);
    var other = new DynamoDbStorageAdapter(client, new("another_customer", tableName)); Check((await other.GetAsync(StorageEntity.Messages, new[] { "kscalars:json" })).Count == 0); var query = new StorageIndexQuery("by_chat", new Dictionary<string, string> { { "sessionId", "scalars" }, { "chatId", "chat" } }, 10); Check((await other.QueryAsync(StorageEntity.Messages, query)).Count == 0);
    var bounded = new DynamoDbStorageAdapter(client, new("csharp_native", tableName) { MaxQueryRows = 10 }); try { await bounded.QueryAsync(StorageEntity.Messages, query with { Limit = 1 }); throw new Exception("Read bound ignored."); } catch (StorageProviderException) { }
    var keys = new Dictionary<string, string> { { "sessionId", "snapshot-session" }, { "messageId", "snapshot-row" } }; var fields = StorageMerge.EmptyRow(StorageEntity.Messages, keys).Fields.ToDictionary(p => p.Key, p => p.Value); fields["text"] = JsonSerializer.SerializeToElement("original"); fields["chatId"] = JsonSerializer.SerializeToElement("chat"); fields["timestamp"] = JsonSerializer.SerializeToElement(4); var row = new StorageRow(StorageSchema.EncodeKey(StorageEntity.Messages, keys), 1, new Dictionary<string, double>(), fields); var writes = new List<StorageWrite> { new StoragePut(StorageEntity.Messages, row, null) }; client.BeforeTransaction = () => { fields["text"] = JsonSerializer.SerializeToElement("mutated"); writes.Clear(); }; Check((await adapter.CommitAsync(writes)).Ok); Check((await adapter.GetAsync(StorageEntity.Messages, new[] { row.Id }))[row.Id].Fields["text"].GetString() == "original");
    var scope = new Dictionary<string, string> { { "sessionId", "snapshot-session" }, { "chatId", "chat" } }; client.BeforeQuery = () => scope["sessionId"] = "other-session"; Check((await adapter.QueryAsync(StorageEntity.Messages, new("by_chat", scope, 10))).Single().Id == row.Id);
    var invalid = new DynamoDbStorageAdapter(client, new("safe", "nonexistent-native-fixture-table")); try { await invalid.GetAsync(StorageEntity.Messages, new[] { "kmissing:id" }); throw new Exception("Missing table read succeeded."); } catch (StorageProviderException error) { Check(!error.ToString().Contains(endpoint, StringComparison.Ordinal) && !error.ToString().Contains("Credential", StringComparison.Ordinal)); }
    Console.WriteLine("PASS actual DynamoDB Local/official .NET driver: all17entities/JSON scalars, conditional transaction rollback,2000history,replay/checkpoint,expired-writer fence,consistent pagination,namespace isolation/read bounds,caller mutation capture and redacted provider errors");
}
finally { await client.DeleteTableAsync(new DeleteTableRequest { TableName = tableName }); }
internal sealed class StrictHttp : HttpClientFactory { public override HttpClient CreateHttpClient(IClientConfig configuration) => new(new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false, Credentials = null, UseProxy = false }); }
internal sealed class Observed(AWSCredentials credentials, AmazonDynamoDBConfig configuration) : AmazonDynamoDBClient(credentials, configuration)
{
    internal int MaxBatchGet, MaxTransaction, QueryPages; internal Action? BeforeTransaction, BeforeQuery;
    private static void Max(ref int field, int value) { while (true) { var current = Volatile.Read(ref field); if (current >= value || Interlocked.CompareExchange(ref field, value, current) == current) return; } }
    public override Task<BatchGetItemResponse> BatchGetItemAsync(BatchGetItemRequest request, CancellationToken cancellation = default) { foreach (var item in request.RequestItems.Values) { if (item.ConsistentRead != true) throw new Exception("Storage GET is not consistent."); Max(ref MaxBatchGet, item.Keys.Count); } return base.BatchGetItemAsync(request, cancellation); }
    public override Task<QueryResponse> QueryAsync(QueryRequest request, CancellationToken cancellation = default) { if (request.ConsistentRead != true || request.Limit != 1000) throw new Exception("Storage query lacks native page/read bounds."); Interlocked.Increment(ref QueryPages); Interlocked.Exchange(ref BeforeQuery, null)?.Invoke(); return base.QueryAsync(request, cancellation); }
    public override Task<TransactWriteItemsResponse> TransactWriteItemsAsync(TransactWriteItemsRequest request, CancellationToken cancellation = default) { Max(ref MaxTransaction, request.TransactItems.Count); Interlocked.Exchange(ref BeforeTransaction, null)?.Invoke(); return base.TransactWriteItemsAsync(request, cancellation); }
}
