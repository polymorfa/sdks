using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.JSInterop;
using Polymorfa.Sdk;
using Polymorfa.Sdk.Storage;

namespace Polymorfa.Storage.IndexedDb.BrowserTests;

internal static class ReducerCases
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
    private static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static JsonDocument Fixture(string name) => JsonDocument.Parse(Assembly.GetExecutingAssembly().GetManifestResourceStream(name) ?? throw new Exception("Missing pinned reducer fixture"));
    private static WebhookEvent Event(JsonElement value) => Webhooks.ParseVerifiedEvent(JsonSerializer.SerializeToUtf8Bytes(value, Json));
    private static void Compare<T>(T actual, JsonElement expected, string label) => Check(StorageMerge.CanonicalJson(JsonSerializer.SerializeToElement(actual, Json)) == StorageMerge.CanonicalJson(expected), label);
    internal static async Task Run(IJSRuntime runtime, string name, IJSObjectReference harness)
    {
        Check(new StorageHistoryNumber("0x20000000000003").ToNumber() == 9007199254740996d, "Wide radix history integer differs from TypeScript Number rounding");
        using (var oracle = Fixture("reducer-batches-3bac.json"))
        {
            Check(oracle.RootElement.GetProperty("source").GetString() == StorageSchema.SourceCommit, "Reducer oracle source differs");
            var events = 0; var histories = 0;
            foreach (var test in oracle.RootElement.GetProperty("events").EnumerateArray()) { Compare(StorageReducers.ReduceEvent(test.GetProperty("input").Deserialize<WebhookEnvelope>(Json)!), test.GetProperty("batch"), "Native WASM event reducer differs from exact TypeScript oracle"); events++; }
            foreach (var test in oracle.RootElement.GetProperty("history").EnumerateArray()) { Compare(StorageReducers.ReduceHistoryChunk(test.GetProperty("input").Deserialize<StorageHistoryInput>(Json)!), test.GetProperty("batch"), "Native WASM history reducer differs from exact TypeScript oracle"); histories++; }
            Check(events == 43 && histories == 15, "Reducer oracle coverage changed");
        }
        using var fixture = Fixture("storage-3bac.json");
        var eventName = name + "_reducer-events";
        await using (var adapter = await IndexedDbStorageAdapter.ConnectAsync(runtime, new("browser-tests") { DatabaseName = eventName }))
        {
            var storage = new CustomerStorage(adapter);
            foreach (var item in fixture.RootElement.GetProperty("events").EnumerateArray()) await storage.ApplyEventAsync(Event(item));
            await Snapshot(harness, eventName, fixture.RootElement.GetProperty("eventRows"));
            foreach (var item in fixture.RootElement.GetProperty("events").EnumerateArray()) Check(!(await storage.ApplyEventAsync(Event(item))).Applied, "IndexedDB event replay applied twice");
            await Snapshot(harness, eventName, fixture.RootElement.GetProperty("eventRows"));
        }
        var historyName = name + "_reducer-history";
        await using (var adapter = await IndexedDbStorageAdapter.ConnectAsync(runtime, new("browser-tests") { DatabaseName = historyName }))
        {
            var storage = new CustomerStorage(adapter);
            var batch = StorageReducers.ReduceHistoryChunk(new("portable-fixture", StorageHistoryChunk.FromJson(fixture.RootElement.GetProperty("history")), ChunkId: "browser-portable-history"));
            await storage.ApplyAsync(batch); await Snapshot(harness, historyName, fixture.RootElement.GetProperty("historyRows"));
            Check(!(await storage.ApplyAsync(batch)).Applied, "IndexedDB decoded history replay applied twice");
        }
        await DecoderAndSync(runtime, name);
        Console.WriteLine("PASS C# WASM reducers: exact 43 event/15 history operation oracle, native fixed public-row snapshots, apply-event/history replay, typed decoder identity and persist/checkpoint/ACK ordering");
    }
    private static async Task Snapshot(IJSObjectReference harness, string name, JsonElement expected)
    {
        var actual = await harness.InvokeAsync<JsonElement>("publicRows", name);
        foreach (var entity in Enum.GetValues<StorageEntity>().Where(entity => entity is not (StorageEntity.Events or StorageEntity.Leases)))
        {
            var table = StorageSchema.Definition(entity).Name;
            var rows = actual.GetProperty(table).EnumerateArray().Select(StorageMerge.CanonicalJson).Order(StringComparer.Ordinal);
            var wanted = expected.GetProperty(table).EnumerateArray().Select(StorageMerge.CanonicalJson).Order(StringComparer.Ordinal);
            Check(rows.SequenceEqual(wanted), "Native IndexedDB public rows differ from pinned " + table + " fixture");
        }
    }
    private static async Task DecoderAndSync(IJSRuntime runtime, string name)
    {
        await using var adapter = await IndexedDbStorageAdapter.ConnectAsync(runtime, new("browser-tests") { DatabaseName = name + "_decoded-sync" });
        var storage = new CustomerStorage(adapter); var calls = 0;
        var envelope = new WebhookEnvelope("browser-history", "browser-decoder", "2026-10-01T12:00:00Z", "history.sync", JsonSerializer.SerializeToElement(new { syncType = "RECENT", chunkOrder = 1, progress = 10, messages = new[] { new { id = "platform-message", conversation = new { id = "platform-chat" }, whatsapp_ids = new { linked_devices = "native" }, fromMe = false } } }));
        var linked = Webhooks.ParseVerifiedEvent(JsonSerializer.SerializeToUtf8Bytes(envelope, Json));
        var options = new StorageApplyEventOptions
        {
            DecodeHistory = async (_, webhook, _) =>
            {
                calls++; Check(webhook is TypedWebhookEvent<LinkedHistorySyncPayload>, "Browser decoder did not receive typed notification"); await Task.Yield();
                return new() { SyncType = "RECENT", Conversations = [new() { Id = "111@lid", Messages = [new(new() { Key = new(Id: "native", FromMe: false), Message = new() { Conversation = "mapped native history" } })] }] };
            }
        };
        await storage.ApplyEventAsync(linked, options);
        var saved = await storage.GetAsync(StorageEntity.Messages, new Dictionary<string, string> { { "sessionId", "browser-decoder" }, { "messageId", "platform-message" } });
        Check(saved is not null && saved["chatId"].GetString() == "platform-chat" && saved["text"].GetString() == "mapped native history", "Browser decoded history lost platform identity or content");
        Check(!(await storage.ApplyEventAsync(linked, options)).Applied && calls == 1, "Browser history replay invoked decoder again");
        var webhookEvent = Webhooks.ParseVerifiedEvent(JsonSerializer.SerializeToUtf8Bytes(new WebhookEnvelope("browser-stream-event", "browser-stream", "2026-10-01T12:00:00Z", "message.received", JsonSerializer.SerializeToElement(new { id = "stream-message", conversation = new { id = "stream-chat" }, timestamp = 1790856000, type = "text", text = "stored before ACK" })), Json));
        var item = new EventStreamItem(new(webhookEvent.Envelope.Id, "synthetic-org", "synthetic-project", "message.received", "runtime", "development", "2026-10-01T00:00:00Z", "available", null, null, "2026-10-15T00:00:00Z"), "browser-stream-id", 1, webhookEvent, "browser-cursor");
        var acknowledged = false;
        var source = new SyntheticSource(item, async (_, ack) =>
        {
            Check(await storage.HasEventAsync("browser-stream", "browser-stream-event"), "Browser ACK preceded native event marker");
            Check((await storage.CheckpointAsync("browser-stream-cursor", "events"))?.Cursor == ack.Cursor && ack.Cursor == "browser-cursor", "Browser ACK preceded native checkpoint");
            acknowledged = true;
        });
        await using var sync = source.SyncToStorage(storage, new() { CheckpointSessionId = "browser-stream-cursor" }); await sync.Completion;
        Check(acknowledged, "Browser application-owned stream was not acknowledged");
    }
    private sealed class SyntheticSource(EventStreamItem item, Func<string, EventStreamAcknowledgement, Task> acknowledge) : IStorageEventStreamSource
    {
        public async IAsyncEnumerable<EventStreamItem> Stream(EventStreamOptions options)
        {
            Check(options.ManualAcknowledgement, "Browser storage sync did not request manual ACK");
            await Task.Yield(); yield return item;
        }
        public Task AcknowledgeAsync(string streamId, EventStreamAcknowledgement input) => acknowledge(streamId, input);
    }
}
