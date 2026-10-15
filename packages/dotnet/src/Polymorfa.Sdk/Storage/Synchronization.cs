namespace Polymorfa.Sdk.Storage;

/// <summary>Downloads and fully decodes a linked history notification. Return null to retain progress only.</summary>
public delegate Task<StorageHistoryChunk?> StorageHistoryDecoder(LinkedHistorySyncPayload payload, WebhookEvent webhookEvent, CancellationToken cancellation);
public record StorageApplyEventOptions
{
    public StorageHistoryDecoder? DecodeHistory { get; init; }
}
public interface IStorageEventStreamSource
{
    IAsyncEnumerable<EventStreamItem> Stream(EventStreamOptions options);
    Task AcknowledgeAsync(string streamId, EventStreamAcknowledgement input);
}
public sealed record StorageSynchronizationOptions : StorageApplyEventOptions
{
    public string CheckpointSessionId { get; init; } = "*";
    public string CheckpointStream { get; init; } = "events";
    public EventStreamOptions StreamOptions { get; init; } = new();
    public bool RequirePayload { get; init; } = true;
    public CancellationToken CancellationToken { get; init; }
    public Action<EventStreamItem, StorageApplyResult>? OnApplied { get; init; }
    public Func<double> Now { get; init; } = () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
public sealed class StorageStreamGapException() : StorageException("The event retention window has a storage gap. Reconcile customer-owned history before resuming.");
/// <summary>Stop ends streaming after any event already admitted has stored its checkpoint and acknowledgement.</summary>
public sealed class StorageSynchronization : IAsyncDisposable, IDisposable
{
    private readonly CancellationTokenSource stop;
    private readonly object gate = new();
    private bool finished;
    public Task Completion { get; }
    internal StorageSynchronization(IStorageEventStreamSource source, CustomerStorage storage, StorageSynchronizationOptions options)
    {
        stop = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken, options.StreamOptions.CancellationToken);
        Completion = PumpAsync(source, storage, options);
    }
    private async Task PumpAsync(IStorageEventStreamSource source, CustomerStorage storage, StorageSynchronizationOptions options)
    {
        var gap = false;
        try
        {
            var saved = await storage.CheckpointAsync(options.CheckpointSessionId, options.CheckpointStream).ConfigureAwait(false); var expected = saved?.Cursor;
            var parameters = options.StreamOptions with
            {
                Types = options.StreamOptions.Types?.ToArray() ?? StorageReducers.StoredEventTypes,
                Since = saved?.Cursor,
                ManualAcknowledgement = true,
                CancellationToken = stop.Token,
                OnGap = value => { gap = true; stop.Cancel(); options.StreamOptions.OnGap?.Invoke(value); }
            };
            try
            {
                await foreach (var item in source.Stream(parameters).WithCancellation(stop.Token).ConfigureAwait(false))
                {
                    if (stop.IsCancellationRequested) break;
                    if (item.Webhook is null && options.RequirePayload) throw new StorageValidationException("The event body is unavailable. The storage checkpoint and acknowledgement were not advanced.");
                    // Stream cancellation stops admission. An admitted event completes persistence and ACK using independent operation lifetimes.
                    var result = item.Webhook is { } webhook ? await StorageSynchronizationExtensions.ApplyEventAsync(storage, webhook, options).ConfigureAwait(false) : new StorageApplyResult(false, 0);
                    await storage.ApplyAsync(new(options.CheckpointSessionId, [new StorageCheckpoint(options.CheckpointSessionId, options.CheckpointStream, item.Cursor, PatchValue<string>.Set(expected), UpdatedAt: options.Now())])).ConfigureAwait(false);
                    expected = item.Cursor;
                    await source.AcknowledgeAsync(item.StreamId, new(item.Cursor, item.Sequence)).ConfigureAwait(false);
                    options.OnApplied?.Invoke(item, result);
                }
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
            catch (PolymorfaCancelledException) when (stop.IsCancellationRequested) { }
            if (gap) throw new StorageStreamGapException();
        }
        finally { lock (gate) { finished = true; stop.Dispose(); } }
    }
    public void Stop() { lock (gate) { if (!finished) stop.Cancel(); } }
    public void Dispose() => Stop();
    public async ValueTask DisposeAsync() { Stop(); await Completion.ConfigureAwait(false); }
}
public static class StorageSynchronizationExtensions
{
    public static Task<StorageApplyResult> ApplyEventAsync(this IStorageAdapter adapter, WebhookEvent webhookEvent, StorageApplyEventOptions? options = null, CancellationToken cancellation = default) => new CustomerStorage(adapter).ApplyEventAsync(webhookEvent, options, cancellation);
    public static async Task<StorageApplyResult> ApplyEventAsync(this CustomerStorage storage, WebhookEvent webhookEvent, StorageApplyEventOptions? options = null, CancellationToken cancellation = default)
    {
        ArgumentNullException.ThrowIfNull(storage); ArgumentNullException.ThrowIfNull(webhookEvent); var envelope = webhookEvent.Envelope;
        // Snapshot JSON before invoking a caller decoder, which may suspend or mutate its own source objects.
        var snapshot = envelope with { Payload = envelope.Payload.Clone() }; var batch = StorageReducers.ReduceEvent(snapshot);
        if (snapshot.Event == "history.sync" && options?.DecodeHistory is { } decode && !(snapshot.Payload.ValueKind == System.Text.Json.JsonValueKind.Object && snapshot.Payload.TryGetProperty("kind", out var kind) && kind.ValueKind == System.Text.Json.JsonValueKind.String && kind.GetString() == "history"))
        {
            if (await storage.HasEventAsync(snapshot.Session, snapshot.Id, cancellation).ConfigureAwait(false)) return new(false, 0);
            var payload = System.Text.Json.JsonSerializer.Deserialize<LinkedHistorySyncPayload>(snapshot.Payload, HttpTransport.Json) ?? throw new StorageValidationException("Invalid linked history notification.");
            var chunk = await decode(payload, Webhooks.ParseVerifiedEvent(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(snapshot, HttpTransport.Json)), cancellation).ConfigureAwait(false);
            if (chunk is not null) { var history = StorageReducers.ReduceHistoryChunk(new(snapshot.Session, chunk, StorageReducers.HistoryIdentityIndex(snapshot.Payload))); batch = batch with { Operations = history.Operations.Concat(batch.Operations).ToArray() }; }
        }
        return await storage.ApplyAsync(batch, cancellation).ConfigureAwait(false);
    }
    public static Func<WebhookEvent, Task<StorageApplyResult>> WebhookHandler(this CustomerStorage storage, StorageApplyEventOptions? options = null) => webhookEvent => storage.ApplyEventAsync(webhookEvent, options);
    public static Func<WebhookEvent, Task<StorageApplyResult>> WebhookHandler(this IStorageAdapter adapter, StorageApplyEventOptions? options = null) => new CustomerStorage(adapter).WebhookHandler(options);
    public static StorageSynchronization SyncToStorage(this IStorageEventStreamSource source, CustomerStorage storage, StorageSynchronizationOptions? options = null) => new(source, storage, options ?? new());
    public static StorageSynchronization SyncToStorage(this IStorageEventStreamSource source, IStorageAdapter adapter, StorageSynchronizationOptions? options = null) => source.SyncToStorage(new CustomerStorage(adapter), options);
    public static StorageSynchronization SyncToStorage(this Events source, CustomerStorage storage, StorageSynchronizationOptions? options = null)
    {
        var parameters = options ?? new(); return new(new PlatformSource(source, parameters.StreamOptions.ProjectId), storage, parameters);
    }
    public static StorageSynchronization SyncToStorage(this Events source, IStorageAdapter adapter, StorageSynchronizationOptions? options = null) => source.SyncToStorage(new CustomerStorage(adapter), options);
    private sealed class PlatformSource(Events events, string? projectId) : IStorageEventStreamSource
    {
        public IAsyncEnumerable<EventStreamItem> Stream(EventStreamOptions options) => events.Stream(options);
        public async Task AcknowledgeAsync(string streamId, EventStreamAcknowledgement input) => _ = await events.AcknowledgeStreamAsync(streamId, input, projectId: projectId).ConfigureAwait(false);
    }
}
