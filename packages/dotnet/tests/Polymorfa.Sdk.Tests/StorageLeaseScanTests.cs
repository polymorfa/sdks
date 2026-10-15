using System.Text.Json;
using Polymorfa.Sdk.Storage;

internal static class StorageLeaseScanTests
{
    private sealed class SlowScan : IStorageAdapter
    {
        internal readonly MemoryStorageAdapter Memory = new();
        internal long Clock;
        public string Name => "slow-scan";
        public StorageCapabilities Capabilities => Memory.Capabilities;
        public Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default) => Memory.GetAsync(entity, ids, cancellation);
        public Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default) => Memory.CommitAsync(writes, cancellation);
        public Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default)
        {
            Interlocked.Add(ref Clock, 4000);
            return Memory.QueryAsync(entity, query, cancellation);
        }
    }
    internal static async Task RunAsync()
    {
        var adapter = new SlowScan();
        var storage = new CustomerStorage(adapter, new()
        {
            LeaseDuration = TimeSpan.FromSeconds(10),
            Now = () => Interlocked.Read(ref adapter.Clock)
        });
        var key = new Dictionary<string, string> { { "sessionId", "slow" }, { "messageId", "m" } };
        var fields = new Dictionary<string, StorageFieldWrite>
        {
            { "chatId", new(JsonSerializer.SerializeToElement("chat"), 1) },
            { "timestamp", new(JsonSerializer.SerializeToElement(1), 1) }
        };
        await storage.ApplyAsync(new("slow", new StorageOperation[] { new StorageUpsert(StorageEntity.Messages, key, fields) }, "seed"));
        await storage.ApplyAsync(new("slow", new StorageOperation[] { new StorageClearChat("slow", "chat", 1) }, "clear"));
        ResourceTests.True(adapter.Clock > 10000);
        ResourceTests.Equal(adapter.Memory.Rows(StorageEntity.Messages).Count, 0);
        ResourceTests.True(await storage.HasEventAsync("slow", "clear"));
    }
}
