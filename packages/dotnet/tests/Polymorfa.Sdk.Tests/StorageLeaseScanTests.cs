using System.Text.Json;
using Polymorfa.Sdk.Storage;

internal static class StorageLeaseScanTests
{
    private sealed class SlowScan(bool slowReads = false, long readDelay = 4000) : IStorageAdapter
    {
        internal readonly MemoryStorageAdapter Memory = new();
        internal long Clock;
        public string Name => "slow-scan";
        public StorageCapabilities Capabilities => Memory.Capabilities;
        public Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default)
        {
            if (slowReads && entity != StorageEntity.Leases) Interlocked.Add(ref Clock, readDelay);
            return Memory.GetAsync(entity, ids, cancellation);
        }
        public Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default) => Memory.CommitAsync(writes, cancellation);
        public Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default)
        {
            if (!slowReads) Interlocked.Add(ref Clock, 4000);
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
        await Planning();
    }
    private static async Task Planning()
    {
        var adapter = new SlowScan(slowReads: true);
        var storage = new CustomerStorage(adapter, new() { LeaseDuration = TimeSpan.FromSeconds(10), Now = () => Interlocked.Read(ref adapter.Clock) });
        var entities = new[] { StorageEntity.Chats, StorageEntity.Messages, StorageEntity.Contacts };
        var operations = entities.Select(entity => (StorageOperation)new StorageUpsert(entity,
            StorageSchema.Definition(entity).Key.ToDictionary(name => name, name => name == "sessionId" ? "slow" : "one"),
            new Dictionary<string, StorageFieldWrite>())).ToArray();
        await storage.ApplyAsync(new("slow", operations, "planned"));
        ResourceTests.True(adapter.Clock > 10000);
        foreach (var entity in entities) ResourceTests.Equal(adapter.Memory.Rows(entity).Count, 1);
        ResourceTests.True(await storage.HasEventAsync("slow", "planned"));
        var expired = new SlowScan(slowReads: true, readDelay: 12000);
        var expiredStorage = new CustomerStorage(expired, new() { LeaseDuration = TimeSpan.FromSeconds(10), Now = () => Interlocked.Read(ref expired.Clock) });
        try { await expiredStorage.ApplyAsync(new("slow", operations, "expired")); throw new Exception("Expired planning read renewed the lease."); }
        catch (StorageLeaseLostException) { }
        foreach (var entity in entities) ResourceTests.Equal(expired.Memory.Rows(entity).Count, 0);
        ResourceTests.Equal(expired.Memory.Rows(StorageEntity.Events).Count, 0);
    }
}
