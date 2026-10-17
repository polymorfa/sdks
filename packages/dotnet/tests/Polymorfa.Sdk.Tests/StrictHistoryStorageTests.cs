using System.Security.Cryptography;
using System.Text.Json;
using Polymorfa.Sdk;
using Polymorfa.Sdk.Storage;

internal static class StrictHistoryStorageTests
{
    private sealed class Source(WebhookEvent webhook) : IStorageEventStreamSource
    {
        internal int Acknowledgements;
        public async IAsyncEnumerable<EventStreamItem> Stream(EventStreamOptions options)
        {
            StrictHistoryTests.Check(options.ManualAcknowledgement && options.Since is null, "storage source uses manual ACK");
            await Task.CompletedTask;
            yield return new(new("signed-archive", "fixture-org", null, "history.sync", "fixture", "testing", "2026-10-17T00:00:00Z", "available", null, null, "2026-10-18T00:00:00Z"), "fixture-stream", 1, webhook, "cursor-after-archive");
        }
        public Task AcknowledgeAsync(string streamId, EventStreamAcknowledgement input) { Acknowledgements++; return Task.CompletedTask; }
    }
    internal static async Task RunAsync()
    {
        using var corpus = JsonDocument.Parse(File.ReadAllBytes(StrictHistoryTests.Fixture("strict-history.json")));
        var valid = StrictHistoryTests.Input(corpus.RootElement.GetProperty("streams").GetProperty("provider-gzip"));
        foreach (var tail in new[] { false, true })
        {
            var bytes = tail ? valid.Concat(new byte[] { 0 }).ToArray() : valid;
            var body = JsonSerializer.SerializeToUtf8Bytes(new { id = "signed-archive", session = "fixture-session", timestamp = "2026-10-17T00:00:00Z", @event = "history.sync", payload = new { mode = "deliver", whatsapp_ids = new { linked_devices = "fixture-archive" }, messages = Array.Empty<object>(), syncType = "RECENT", chunkOrder = 7, progress = 92, fileLength = bytes.Length, conversationCount = 1, messageCount = 0, pushNameCount = 0, statusMessageCount = 0, whatsapp = new { encoding = "gzip-base64-protobuf", data = Convert.ToBase64String(bytes) } } });
            var signature = Convert.ToHexString(HMACSHA256.HashData("synthetic-archive-secret"u8, body)).ToLowerInvariant();
            var webhook = Webhooks.ConstructEvent(body, signature, "synthetic-archive-secret");
            var source = new Source(webhook); var adapter = new MemoryStorageAdapter(); var storage = new CustomerStorage(adapter); var applied = 0;
            var synchronization = source.SyncToStorage(storage, new()
            {
                OnApplied = (_, _) => applied++,
                DecodeHistory = async (payload, _, cancellation) =>
                {
                    var decoded = await HistoryChunks.DownloadAsync(new HistoryInlinePayload(Convert.FromBase64String(payload.Whatsapp.Data)), new() { Media = new() { CancellationToken = cancellation } });
                    // Application projection through the existing archive callback only.
                    // No descriptor dispatch or generic full-schema storage claim.
                    return new StorageHistoryChunk
                    {
                        Conversations = decoded.Conversations.Select(c => new StorageHistoryConversation { Id = c.Id }).ToArray(),
                        ChunkOrder = decoded.ChunkOrder.HasValue ? new StorageHistoryNumber(decoded.ChunkOrder.Value) : (StorageHistoryNumber?)null,
                        Progress = decoded.Progress.HasValue ? new StorageHistoryNumber(decoded.Progress.Value) : (StorageHistoryNumber?)null
                    };
                }
            });
            if (tail)
            {
                await StrictHistoryTests.ErrorAsync(() => synchronization.Completion, "media_invalid_ciphertext", "real archive decoder rejects tail");
                StrictHistoryTests.Check(!await storage.HasEventAsync("fixture-session", "signed-archive") && await storage.CheckpointAsync("*", "events") is null, "no marker or checkpoint after decode failure");
                StrictHistoryTests.Check(source.Acknowledgements == 0 && applied == 0, "no ACK or applied callback after decode failure");
                foreach (var entity in Enum.GetValues<StorageEntity>()) StrictHistoryTests.Check(adapter.Rows(entity).Count == 0, "no row/progress write after decode failure: " + entity);
            }
            else
            {
                await synchronization.Completion;
                StrictHistoryTests.Check(await storage.HasEventAsync("fixture-session", "signed-archive") && (await storage.CheckpointAsync("*", "events"))?.Cursor == "cursor-after-archive", "valid archive marker and checkpoint");
                StrictHistoryTests.Check(source.Acknowledgements == 1 && applied == 1 && adapter.Rows(StorageEntity.Chats).Count == 1, "valid archive persists and ACKs");
            }
            synchronization.Dispose();
        }
        Console.WriteLine("PASS signed archive: real decoder failure prevents all rows/progress/checkpoint/ACK; valid application projection persists and ACKs");
    }
}
