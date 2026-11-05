using System.Text.Json;
using System.Text.Json.Serialization;
using Polymorfa.Sdk;
using Polymorfa.Sdk.Storage;

await NumericStrings.Run();
await HistoryEditGuard.Run();
await Checks.Run();
internal static class Checks
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
    private static void Equal<T>(T actual, T expected, string label) { if (!EqualityComparer<T>.Default.Equals(actual, expected)) throw new Exception(label + ": values differ."); }
    private static void Assert(bool value, string label) { if (!value) throw new Exception(label); }
    private static async Task Throws<T>(Func<Task> action) where T : Exception { try { await action(); } catch (T) { return; } throw new Exception("Expected " + typeof(T).Name); }
    private static void JsonEqual<T>(T value, JsonElement expected, string label)
    {
        var actual = JsonSerializer.SerializeToElement(value, Json); var a = StorageMerge.CanonicalJson(actual); var e = StorageMerge.CanonicalJson(expected); if (a != e) { File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "actual.json"), actual.GetRawText()); throw new Exception(label + ": operation JSON differs; actual saved beside fixture."); }
    }
    private static WebhookEnvelope Envelope(JsonElement value) => value.Deserialize<WebhookEnvelope>(Json)!;
    private static WebhookEvent Event(string id = "event", string type = "message.received", object? payload = null) => new UnknownWebhookEvent(new(id, "sync", "2026-10-01T12:00:00Z", type, JsonSerializer.SerializeToElement(payload ?? new { id = "m", conversation = new { id = "chat" }, timestamp = 1790856000, type = "text", text = "value" })));
    private static EventStreamItem Item(WebhookEvent? value, string cursor = "cursor-1", long sequence = 1) => new(new(value?.Envelope.Id ?? "metadata", "org", "project", value?.Envelope.Event ?? "message.received", "runtime", "development", "2026-10-01T00:00:00Z", "available", null, null, "2026-10-15T00:00:00Z"), "stream", sequence, value, cursor);
    internal static async Task Run()
    {
        using var oracle = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures/reducer-batches-3bac.json"))); Equal(oracle.RootElement.GetProperty("source").GetString(), StorageSchema.SourceCommit, "source pin");
        var types = new HashSet<string>(StringComparer.Ordinal); var events = 0; var histories = 0;
        foreach (var test in oracle.RootElement.GetProperty("events").EnumerateArray()) { var input = Envelope(test.GetProperty("input")); types.Add(input.Event); JsonEqual(StorageReducers.ReduceEvent(input), test.GetProperty("batch"), input.Id); events++; }
        Assert(StorageReducers.StoredEventTypes.All(types.Contains), "Every stored event type has an exact operation fixture.");
        foreach (var test in oracle.RootElement.GetProperty("history").EnumerateArray()) { var input = test.GetProperty("input").Deserialize<StorageHistoryInput>(Json)!; JsonEqual(StorageReducers.ReduceHistoryChunk(input), test.GetProperty("batch"), "history " + histories++); }
        Console.WriteLine($"PASS exact pinned TypeScript operation oracle: {events} events / {histories} histories, all 24 stored types");
        await FixedRows(); await LargeHistory(); await Decoder(); await Sync(); NumericAndTypes(); await Wire();
    }
    private static async Task FixedRows()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures/storage-3bac.json"))); var memory = new MemoryStorageAdapter(); var storage = new CustomerStorage(memory);
        foreach (var input in fixture.RootElement.GetProperty("events").EnumerateArray()) await storage.ApplyAsync(StorageReducers.ReduceEvent(Envelope(input)));
        // Physical row enumeration is not ordered by the adapter contract. Compare sorted row objects, retaining each field's value.
        SnapshotEqual(memory, fixture.RootElement.GetProperty("eventRows")); foreach (var input in fixture.RootElement.GetProperty("events").EnumerateArray()) Assert(!(await storage.ApplyAsync(StorageReducers.ReduceEvent(Envelope(input)))).Applied, "Event replay"); SnapshotEqual(memory, fixture.RootElement.GetProperty("eventRows"));
        memory = new(); storage = new(memory); var batch = StorageReducers.ReduceHistoryChunk(new("portable-fixture", StorageHistoryChunk.FromJson(fixture.RootElement.GetProperty("history")))); await storage.ApplyAsync(batch); SnapshotEqual(memory, fixture.RootElement.GetProperty("historyRows")); Equal((await storage.ApplyAsync(batch)).Writes, 0, "History replay");
        Console.WriteLine("PASS independent fixed public-row fixtures, event deduplication and history replay");
    }
    private static void SnapshotEqual(MemoryStorageAdapter memory, JsonElement expected)
    {
        foreach (var entity in Enum.GetValues<StorageEntity>().Where(entity => entity is not (StorageEntity.Events or StorageEntity.Leases)))
        {
            var actualRows = memory.Rows(entity).Select(row => StorageMerge.CanonicalJson(JsonSerializer.SerializeToElement(row.Fields))).Order(StringComparer.Ordinal).ToArray(); var expectedRows = expected.GetProperty(StorageSchema.Definition(entity).Name).EnumerateArray().Select(StorageMerge.CanonicalJson).Order(StringComparer.Ordinal).ToArray(); Equal(string.Join('\n', actualRows), string.Join('\n', expectedRows), "public rows " + entity);
        }
    }
    private static async Task LargeHistory()
    {
        var messages = Enumerable.Range(0, 2000).Select(i => new StorageHistoryMessageEntry(new() { Key = new(Id: "message-" + i, FromMe: true), MessageTimestamp = (long)(1790856000 + i), Status = "READ", Message = new() { Conversation = "history " + i } })).ToArray(); var chunk = new StorageHistoryChunk { SyncType = "RECENT", ChunkOrder = "1", Progress = 100L, Conversations = [new() { Id = "111@s.whatsapp.net", Messages = messages }] }; var memory = new MemoryStorageAdapter(); var storage = new CustomerStorage(memory); var batch = StorageReducers.ReduceHistoryChunk(new("large", chunk, ChunkId: "chunk")); await storage.ApplyAsync(batch); Equal(memory.Rows(StorageEntity.Messages).Count, 2000, "Large history"); Assert(!(await storage.ApplyAsync(batch)).Applied, "Chunk deduplication");
        var page = await storage.QueryAsync(StorageEntity.Messages, new("by_chat", new Dictionary<string, string> { ["sessionId"] = "large", ["chatId"] = "wa:111@s.whatsapp.net" }, 17, Order: "asc")); Equal(page.Rows.Count, 17, "History index page"); Equal(page.Rows[0]["text"].GetString(), "history 0", "History content");
        Console.WriteLine("PASS typed 2,000-message history, stable chunk ID, index paging and replay");
    }
    private static async Task Decoder()
    {
        var memory = new MemoryStorageAdapter(); var storage = new CustomerStorage(memory); var calls = 0;
        var linked = Event("history", "history.sync", new { syncType = "RECENT", chunkOrder = 1, progress = 10, messages = new[] { new { id = "platform-message", conversation = new { id = "platform-chat" }, whatsapp_ids = new { linked_devices = "native" }, fromMe = false } } });
        var options = new StorageApplyEventOptions { DecodeHistory = (_, webhook, _) => { calls++; Assert(webhook is TypedWebhookEvent<LinkedHistorySyncPayload>, "Typed decoder event"); return Task.FromResult<StorageHistoryChunk?>(new() { SyncType = "RECENT", Conversations = [new() { Id = "111@lid", Messages = [new(new() { Key = new(Id: "native", FromMe: false), Message = new() { Conversation = "mapped" } })] }] }); } };
        await storage.ApplyEventAsync(linked, options); Equal(memory.Rows(StorageEntity.Messages).Single().Fields["messageId"].GetString(), "platform-message", "History message identity"); Equal(memory.Rows(StorageEntity.Messages).Single().Fields["chatId"].GetString(), "platform-chat", "History conversation identity"); Assert(!(await storage.ApplyEventAsync(linked, options)).Applied, "History replay marker"); Equal(calls, 1, "Replay avoids download");
        var progressOnly = Event("progress-only", "history.sync", new { syncType = "RECENT", chunkOrder = 2, progress = 20, messages = Array.Empty<object>() }); await storage.ApplyEventAsync(progressOnly, new() { DecodeHistory = (_, _, _) => Task.FromResult<StorageHistoryChunk?>(null) }); Assert(await storage.HasEventAsync("sync", "progress-only"), "Progress-only event marked"); Equal(memory.Rows(StorageEntity.HistoryProgress).Single().Fields["progress"].GetDouble(), 20d, "Progress-only cursor data");
        var inline = Event("inline", "history.sync", new { kind = "history" }); await storage.ApplyEventAsync(inline, options); Equal(calls, 1, "Cloud inline history is not downloaded");
        var failing = options with { DecodeHistory = (_, _, _) => throw new FixtureFailure() }; await Throws<FixtureFailure>(() => storage.ApplyEventAsync(linked with { Envelope = linked.Envelope with { Id = "failed" } }, failing)); Assert(!await storage.HasEventAsync("sync", "failed"), "Decoder failure leaves no event marker");
        var handler = storage.WebhookHandler(options); Assert(!(await handler(linked)).Applied, "Verified webhook handler replay");
        Console.WriteLine("PASS linked history decoder, PN/LID identity, progress-only/inline behavior and no download on replay");
    }
    private static async Task Sync()
    {
        var memory = new MemoryStorageAdapter(); var storage = new CustomerStorage(memory); var delivered = Item(Event()); var acked = 0; var observed = false;
        var source = new Source([delivered], parameters => { Assert(parameters.ManualAcknowledgement, "Manual ACK forced"); Assert(parameters.Types!.SequenceEqual(StorageReducers.StoredEventTypes), "Default stored event filter"); Assert(parameters.Since is null, "No initial cursor"); }, async (_, input) => { Assert(await storage.HasEventAsync("sync", "event"), "Event marker before ACK"); Equal((await storage.CheckpointAsync("*", "events"))?.Cursor, input.Cursor, "Checkpoint before ACK"); acked++; });
        await source.SyncToStorage(storage, new() { OnApplied = (_, result) => { Assert(result.Applied, "Callback result"); Equal(acked, 1, "Callback after ACK"); observed = true; } }).Completion; Assert(observed, "Applied callback");
        await new Source([], p => Equal(p.Since, "cursor-1", "Resume saved cursor")).SyncToStorage(storage).Completion;
        var missing = new CustomerStorage(new MemoryStorageAdapter()); await Throws<StorageValidationException>(() => new Source([Item(null)], acknowledge: (_, _) => throw new Exception("Unexpected ACK")).SyncToStorage(missing).Completion); Assert(await missing.CheckpointAsync("*", "events") is null, "Missing payload checkpoint unchanged");
        await new Source([Item(null)]).SyncToStorage(missing, new() { RequirePayload = false }).Completion; Equal((await missing.CheckpointAsync("*", "events"))?.Cursor, "cursor-1", "Explicit metadata-only checkpoint");
        var gapStorage = new CustomerStorage(new MemoryStorageAdapter()); await Throws<StorageStreamGapException>(() => new Source([delivered], p => p.OnGap!(new("retention_exceeded", 1, null))).SyncToStorage(gapStorage).Completion); Assert(await gapStorage.CheckpointAsync("*", "events") is null, "Gap checkpoint unchanged");
        var replay = new CustomerStorage(new MemoryStorageAdapter()); await Throws<FixtureFailure>(() => new Source([delivered], acknowledge: (_, _) => throw new FixtureFailure()).SyncToStorage(replay).Completion); Assert(await replay.HasEventAsync("sync", "event"), "ACK failure leaves stored data"); Equal((await replay.CheckpointAsync("*", "events"))?.Cursor, "cursor-1", "ACK failure leaves checkpoint"); await new Source([delivered], acknowledge: async (_, _) => { Assert(await replay.HasEventAsync("sync", "event"), "Replay kept marker"); }).SyncToStorage(replay, new() { OnApplied = (_, result) => Assert(!result.Applied, "Unacknowledged replay deduplicated") }).Completion;
        var failData = new CustomerStorage(new FailAdapter(new(), StorageEntity.Messages)); await Throws<FixtureFailure>(() => new Source([delivered], acknowledge: (_, _) => throw new Exception("Unexpected ACK")).SyncToStorage(failData).Completion); Assert(await failData.CheckpointAsync("*", "events") is null, "Content failure keeps cursor"); Assert(!await failData.HasEventAsync("sync", "event"), "Content failure keeps deduplication marker absent");
        var failMarker = new CustomerStorage(new FailAdapter(new(), StorageEntity.Events)); await Throws<FixtureFailure>(() => new Source([delivered], acknowledge: (_, _) => throw new Exception("Unexpected ACK")).SyncToStorage(failMarker).Completion); Assert(await failMarker.CheckpointAsync("*", "events") is null, "Marker failure keeps checkpoint absent"); Assert(!await failMarker.HasEventAsync("sync", "event"), "Marker failure keeps event replayable");
        var failCursor = new CustomerStorage(new FailAdapter(new(), StorageEntity.Checkpoints)); await Throws<FixtureFailure>(() => new Source([delivered], acknowledge: (_, _) => throw new Exception("Unexpected ACK")).SyncToStorage(failCursor).Completion); Assert(await failCursor.HasEventAsync("sync", "event"), "Cursor failure leaves replayable stored data"); Assert(await failCursor.CheckpointAsync("*", "events") is null, "Failed cursor absent");
        var stale = new CustomerStorage(new MemoryStorageAdapter()); await Throws<StorageCheckpointConflictException>(() => new Source([delivered], async p => { await stale.ApplyAsync(new("*", [new StorageCheckpoint("*", "events", "competitor")])); }).SyncToStorage(stale).Completion); Equal((await stale.CheckpointAsync("*", "events"))?.Cursor, "competitor", "Stale consumer cannot replace cursor");
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel(); var preabort = new CustomerStorage(new MemoryStorageAdapter()); await new Source([delivered]).SyncToStorage(preabort, new() { CancellationToken = cancelled.Token }).Completion; Assert(!await preabort.HasEventAsync("sync", "event"), "Preabort prevents admission");
        using var stop = new CancellationTokenSource(); var paused = new PauseAdapter(); var admitted = new CustomerStorage(paused); var completed = new Source([delivered, Item(Event("second"), "cursor-2", 2)], acknowledge: (_, _) => { acked++; return Task.CompletedTask; }).SyncToStorage(admitted, new() { CancellationToken = stop.Token }); await paused.Started.Task.WaitAsync(TimeSpan.FromSeconds(2)); stop.Cancel(); paused.Release.SetResult(); await completed.Completion; Assert(await admitted.HasEventAsync("sync", "event"), "Stop finishes admitted event"); Assert(!await admitted.HasEventAsync("sync", "second"), "Stop prevents next event"); Equal((await admitted.CheckpointAsync("*", "events"))?.Cursor, "cursor-1", "Stop stores admitted cursor");
        using var failedStop = new CancellationTokenSource(); var failedPause = new PauseAdapter(true); var failedStorage = new CustomerStorage(failedPause); var failedSync = new Source([delivered], acknowledge: (_, _) => throw new Exception("Unexpected ACK after cancelled provider")).SyncToStorage(failedStorage, new() { CancellationToken = failedStop.Token }); await failedPause.Started.Task.WaitAsync(TimeSpan.FromSeconds(2)); failedStop.Cancel(); failedPause.Release.SetResult(); await Throws<OperationCanceledException>(() => failedSync.Completion); Assert(await failedStorage.CheckpointAsync("*", "events") is null, "Admitted provider cancellation cannot report success or advance cursor");
        Console.WriteLine("PASS persistence/checkpoint/ACK order, resume, payload denial, retention gap, crash/replay, conflicts, stop and cancellation");
    }
    private static void NumericAndTypes()
    {
        Equal(new StorageHistoryNumber("0x20000000000003").ToNumber(), 9007199254740996d, "Wide radix integer uses nearest-even JavaScript Number rounding");
        StorageHistoryNumber? literal = 1; Equal(literal?.ToNumber(), 1d, "Nullable integer literal conversion"); StorageHistoryNumber? unsigned = 1u; Equal(unsigned?.ToNumber(), 1d, "Nullable unsigned conversion");
        StorageHistoryNumber integer = new System.Numerics.BigInteger(1790856000); Equal(integer.ToNumber(), 1790856000d, "BigInteger conversion"); Equal(new StorageHistoryNumber("0").ToNumber(), 0d, "Zero"); Assert(new StorageHistoryNumber(double.PositiveInfinity).ToNumber() is null, "Nonfinite number"); Equal(StorageReducers.NormalizeJid("USER_3:4@LID"), "user@lid", "Native JID normalization"); var bytes = new byte[] { 1, 2, 3 }; StorageHistoryBytes saved = bytes; bytes[0] = 9; Equal(saved.Base64, "AQID", "Byte input snapshot");
        Equal(StorageReducers.AcknowledgementStatus("PLAYED-SELF"), "played", "Receipt aliases"); Assert(StorageReducers.AcknowledgementStatus("unknown") is null, "Unknown receipt");
        var large = StorageReducers.ReduceEvent(Event(payload: new { id = "large", conversation = new { id = "chat" }, timestamp = 4503599627370497d }).Envelope); Equal(large.Operations.OfType<StorageUpsert>().Single(operation => operation.Entity == StorageEntity.Messages).Fields["timestamp"].Value.GetDouble(), 4503599627370497d, "Large integral timestamp retains exact double value");
        Assert(StorageReducers.ReduceEvent(Event(type: "future.unknown").Envelope).Operations.Count == 0, "Unknown type has empty batch");
    }
    private static Task Wire() => WireChecks.Run();
    private sealed class FixtureFailure : Exception;
    private sealed class Source : IStorageEventStreamSource
    {
        private readonly IReadOnlyList<EventStreamItem> items; private readonly Func<EventStreamOptions, Task>? observe; private readonly Func<string, EventStreamAcknowledgement, Task>? acknowledge;
        internal Source(IReadOnlyList<EventStreamItem> items, Action<EventStreamOptions>? observe = null, Func<string, EventStreamAcknowledgement, Task>? acknowledge = null) { this.items = items; this.observe = observe is null ? null : p => { observe(p); return Task.CompletedTask; }; this.acknowledge = acknowledge; }
        internal Source(IReadOnlyList<EventStreamItem> items, Func<EventStreamOptions, Task> observe) { this.items = items; this.observe = observe; }
        public async IAsyncEnumerable<EventStreamItem> Stream(EventStreamOptions options) { if (observe is not null) await observe(options); foreach (var item in items) { if (options.CancellationToken.IsCancellationRequested) yield break; yield return item; } }
        public Task AcknowledgeAsync(string stream, EventStreamAcknowledgement input) => acknowledge?.Invoke(stream, input) ?? Task.CompletedTask;
    }
    private sealed class FailAdapter(MemoryStorageAdapter memory, StorageEntity failed) : IStorageAdapter
    {
        public string Name => "failure"; public StorageCapabilities Capabilities => memory.Capabilities;
        public Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default) => memory.GetAsync(entity, ids, cancellation);
        public Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default) => memory.QueryAsync(entity, query, cancellation);
        public Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default) => writes.OfType<StoragePut>().Any(p => p.Entity == failed) ? throw new FixtureFailure() : memory.CommitAsync(writes, cancellation);
    }
    private sealed class PauseAdapter(bool failAfterRelease = false) : IStorageAdapter
    {
        private readonly MemoryStorageAdapter memory = new(); private int paused; public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously); public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public string Name => "pause"; public StorageCapabilities Capabilities => memory.Capabilities;
        public Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default) => memory.GetAsync(entity, ids, cancellation);
        public Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default) => memory.QueryAsync(entity, query, cancellation);
        public async Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default) { if (writes.OfType<StoragePut>().Any(p => p.Entity == StorageEntity.Messages) && Interlocked.Exchange(ref paused, 1) == 0) { Started.SetResult(); await Release.Task; if (failAfterRelease) throw new OperationCanceledException("Independent provider operation cancelled."); } return await memory.CommitAsync(writes, cancellation); }
    }
}
