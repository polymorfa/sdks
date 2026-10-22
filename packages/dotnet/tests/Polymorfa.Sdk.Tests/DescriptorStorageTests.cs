using System.Diagnostics;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using Polymorfa.Sdk;
using Polymorfa.Sdk.Storage;
internal static class DescriptorStorageTests
{
    private static readonly JsonElement Fixture = ReadFixture();
    private static int checks;
    private static int outcomes;
    private static JsonElement ReadFixture() { using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures", "descriptor-storage", "fixture.json"))); return doc.RootElement.Clone(); }
    private static void Check(bool value, string message) { checks++; if (!value) throw new Exception(message); }
    private static WebhookEvent Signed(JsonElement payload)
    {
        var raw = JsonSerializer.SerializeToUtf8Bytes(new { id = "descriptor-event", session = "descriptor-session", timestamp = "2026-10-17T00:00:00Z", @event = "history.sync", payload });
        return Webhooks.ConstructEvent(raw, Convert.ToHexString(HMACSHA256.HashData("synthetic-secret"u8, raw)), "synthetic-secret");
    }
    private static WebhookEvent Raw(JsonElement payload) => new UnknownWebhookEvent(new("descriptor-event", "descriptor-session", "2026-10-17T00:00:00Z", "history.sync", payload));
    private static JsonElement Patch(JsonElement value, string patch) { var node = JsonNode.Parse(value.GetRawText())!.AsObject(); foreach (var p in JsonNode.Parse(patch)!.AsObject()) node[p.Key] = p.Value?.DeepClone(); return JsonSerializer.SerializeToElement(node); }
    private static string Rows(MemoryStorageAdapter adapter) => JsonSerializer.Serialize(Enum.GetValues<StorageEntity>().Select(adapter.Rows));
    internal static async Task RunAsync()
    {
        checks = 0; outcomes = 0;
        var adapter = new MemoryStorageAdapter(); var storage = new CustomerStorage(adapter); var refused = false;
        try { await storage.ApplyEventAsync(Signed(Fixture.GetProperty("inline"))); } catch (StorageValidationException) { refused = true; }
        Check(refused, "Undecoded descriptor was consumed"); Check(!await storage.HasEventAsync("descriptor-session", "descriptor-event"), "Failed descriptor marked"); outcomes++;
        foreach (var branch in new[] { "inline", "media" }) foreach (var mode in new[] { "missing", "archive", "null", "error", "invalid", "metadata", "metadata-decoder", "empty", "full" })
            {
                var a = new MemoryStorageAdapter(); var s = new CustomerStorage(a); var e = Signed(Fixture.GetProperty(branch)); var calls = 0;
                StorageHistoryDescriptorDecoder decoder = async (p, original, cancellation) =>
                {
                    calls++; Check(p.Delivery == "descriptor" && ReferenceEquals(original, e), "Descriptor callback args");
                    if (mode == "null") return null!;
                    if (mode == "error") throw new Exception(Fixture.GetProperty("media").GetProperty("media").GetProperty("mediaKey").GetString());
                    if (mode == "invalid") return StorageHistoryChunk.FromJson(JsonSerializer.SerializeToElement(new { conversations = "bad" }));
                    if (mode == "empty") return new();
                    if (p is DirectHistorySyncInlinePayload inline) { var decoded = await HistoryChunks.DownloadAsync(new HistoryInlinePayload(Convert.FromBase64String(inline.Inline.Data)), new() { Media = new() { CancellationToken = cancellation } }); Check(decoded.Proto.Encoded.SequenceEqual(Convert.FromBase64String(Fixture.GetProperty("protobuf").GetString()!)), "Verified history bytes before application projection"); }
                    // Explicit projection of the independent synthetic fixture, not a generic full-schema codec.
                    return StorageHistoryChunk.FromJson(Fixture.GetProperty("chunk"));
                };
                var options = new StorageApplyEventOptions { DecodeHistory = mode == "archive" ? (_, _, _) => { calls++; return Task.FromResult<StorageHistoryChunk?>(null); } : null, DecodeHistoryDescriptor = mode is "missing" or "archive" or "metadata" ? null : decoder, HistoryDescriptorMode = mode.StartsWith("metadata", StringComparison.Ordinal) ? StorageHistoryDescriptorMode.MetadataOnly : StorageHistoryDescriptorMode.Decode };
                Exception? error = null; try { await s.WebhookHandler(options)(e); } catch (Exception x) { error = x; }
                var failed = mode is "missing" or "archive" or "null" or "error" or "invalid";
                Check((error is not null) == failed, branch + "/" + mode); Check(await s.HasEventAsync("descriptor-session", "descriptor-event") == !failed, "Marker"); Check(a.Rows(StorageEntity.Messages).Count == (mode == "full" ? 1 : 0), "Content"); Check(a.Rows(StorageEntity.HistoryProgress).Any() == !failed, "Progress");
                if (failed) Check(Enum.GetValues<StorageEntity>().All(entity => a.Rows(entity).Count == 0), "Failure wrote rows"); else Check(!(await s.ApplyEventAsync(e)).Applied, "Duplicate requires decoder");
                if (mode is "archive" or "metadata" or "metadata-decoder") Check(calls == 0, "Wrong callback");
                var serialized = Rows(a); foreach (var secret in new[] { Fixture.GetProperty("inline").GetProperty("inline").GetProperty("data").GetString()!, Fixture.GetProperty("media").GetProperty("media").GetProperty("mediaKey").GetString()! }) { Check(!serialized.Contains(secret, StringComparison.Ordinal), "Stored descriptor secret"); Check(!(error?.ToString() ?? "").Contains(secret, StringComparison.Ordinal) && !e.ToString().Contains(secret, StringComparison.Ordinal), "Diagnostic descriptor secret"); }
                if (mode == "full") Check(JsonSerializer.Serialize(a.Rows(StorageEntity.Messages)).Contains("wa:", StringComparison.Ordinal) && !JsonSerializer.Serialize(a.Rows(StorageEntity.Messages)).Contains("synthetic-notification", StringComparison.Ordinal), "Native fallback identity"); outcomes++;
            }
        foreach (var patch in new[] { "{\"delivery\":null}", "{\"delivery\":\"bad\"}", "{\"media\":{}}", "{\"inline\":null}", "{\"whatsapp_ids\":{}}", "{\"whatsapp_ids\":{\"linked_devices\":null}}", "{\"fileLength\":null}", "{\"fileLength\":-1}", "{\"fileLength\":1.5}", "{\"progress\":101}", "{\"progress\":true}", "{\"syncType\":\"\"}", "{\"oldestMessageAt\":\"2026-02-30T00:00:00Z\"}", "{\"peerDataRequestSessionId\":null}", "{\"whatsapp_id\":\"\"}" })
        {
            var a = new MemoryStorageAdapter(); var s = new CustomerStorage(a); Exception? error = null; var e = Raw(Patch(Fixture.GetProperty("inline"), patch)); try { await s.ApplyEventAsync(e, new() { HistoryDescriptorMode = StorageHistoryDescriptorMode.MetadataOnly }); } catch (PolymorfaValidationException x) { error = x; }
            Check(error is not null && Enum.GetValues<StorageEntity>().All(entity => a.Rows(entity).Count == 0), "Malformed raw descriptor consumed"); Check(!e.ToString().Contains(Fixture.GetProperty("inline").GetProperty("inline").GetProperty("data").GetString()!, StringComparison.Ordinal), "Malformed diagnostic redaction"); outcomes++;
        }
        // Archives retain their argument type and nullable progress-only contract.
        var archive = JsonNode.Parse(Fixture.GetProperty("inline").GetRawText())!.AsObject(); archive.Remove("delivery"); archive.Remove("inline"); archive["messages"] = new JsonArray();
        foreach (var mode in new[] { "missing", "null", "full", "error", "cloud" })
        {
            var a = new MemoryStorageAdapter(); var s = new CustomerStorage(a); var calls = 0; var e = Raw(mode == "cloud" ? JsonSerializer.SerializeToElement(new { kind = "history", value = new { } }) : JsonSerializer.SerializeToElement(archive));
            var options = new StorageApplyEventOptions { DecodeHistory = mode == "missing" ? null : (payload, original, _) => { calls++; Check(payload.SyncType == "RECENT" && original.Envelope.Id == e.Envelope.Id, "Archive callback arguments"); if (mode == "error") throw new InvalidOperationException("archive callback failure"); return Task.FromResult<StorageHistoryChunk?>(mode == "full" ? StorageHistoryChunk.FromJson(Fixture.GetProperty("chunk")) : null); } };
            Exception? error = null; try { await s.ApplyEventAsync(e, options); } catch (InvalidOperationException x) { error = x; }
            Check((error is not null) == (mode == "error"), "Archive/Cloud outcome"); if (mode is "missing" or "cloud") Check(calls == 0, "Archive/Cloud exclusion"); outcomes++;
        }
        var duplicate = Signed(Fixture.GetProperty("inline")); var duplicateStorage = new CustomerStorage(new MemoryStorageAdapter()); await duplicateStorage.ApplyEventAsync(duplicate, new() { HistoryDescriptorMode = StorageHistoryDescriptorMode.MetadataOnly }); var invalidDuplicate = Raw(Patch(Fixture.GetProperty("inline"), "{\"fileLength\":null}")); var duplicateRefused = false; try { await duplicateStorage.ApplyEventAsync(invalidDuplicate); } catch (PolymorfaValidationException) { duplicateRefused = true; }
        Check(duplicateRefused, "Malformed duplicate bypassed validation"); outcomes++;
        var empty = new EmptySource(); var modeAdapter = new MemoryStorageAdapter(); var invalidMode = empty.SyncToStorage(modeAdapter, new() { RequirePayload = false, HistoryDescriptorMode = (StorageHistoryDescriptorMode)9 }); var modeRefused = false;
        try { await invalidMode.Completion; } catch (StorageValidationException) { modeRefused = true; }
        Check(modeRefused && !empty.StreamCalled && Enum.GetValues<StorageEntity>().All(entity => modeAdapter.Rows(entity).Count == 0), "Invalid mode must fail before stream/persistence even without bodies"); outcomes++;
        await HttpAsync();
        Console.WriteLine($"PASS descriptor storage: {outcomes} public outcomes, {checks} assertions; signed webhook/raw validation/HTTP/SSE/manual ACK/resume");
    }
    private sealed class EmptySource : IStorageEventStreamSource
    {
        public bool StreamCalled { get; private set; }
        public async IAsyncEnumerable<EventStreamItem> Stream(EventStreamOptions options) { StreamCalled = true; await Task.CompletedTask; yield break; }
        public Task AcknowledgeAsync(string streamId, EventStreamAcknowledgement input) => throw new Exception("Unexpected ACK");
    }
    private sealed class ObserveAck(CustomerStorage storage, MemoryStorageAdapter adapter, bool content) : DelegatingHandler(new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false })
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellation)
        {
            if (request.Method == HttpMethod.Post && request.RequestUri!.AbsolutePath.EndsWith("/ack", StringComparison.Ordinal)) { Check(await storage.HasEventAsync("descriptor-session", "descriptor-event"), "ACK before marker"); Check((await storage.CheckpointAsync("*", "events"))?.Cursor == "descriptor-cursor", "ACK before checkpoint"); Check(adapter.Rows(StorageEntity.Messages).Count == (content ? 1 : 0), "ACK before content"); Check(adapter.Rows(StorageEntity.HistoryProgress).Any(), "ACK before progress"); }
            return await base.SendAsync(request, cancellation);
        }
    }
    private static async Task HttpAsync()
    {
        var start = new ProcessStartInfo(Environment.GetEnvironmentVariable("SDK_NODE") ?? "node") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false }; start.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory, "fixtures", "descriptor-storage", "server.mjs")); using var peer = Process.Start(start) ?? throw new Exception("Fixture process failed");
        try
        {
            using var ready = JsonDocument.Parse(await peer.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)) ?? throw new Exception("Fixture server exited")); var url = new Uri(ready.RootElement.GetProperty("baseUrl").GetString()!); using var fixture = new HttpClient { BaseAddress = url };
            foreach (var branch in new[] { "inline", "media" }) foreach (var mode in new[] { "missing", "archive", "null", "error", "invalid", "metadata", "metadata-decoder", "empty", "full", "conflict", "ack-error", "malformed" })
                {
                    var payload = mode == "malformed" ? Patch(Fixture.GetProperty(branch), "{\"delivery\":null}") : Fixture.GetProperty(branch); using var configured = await fixture.PostAsJsonAsync("/configure", new { branch, mode, payload }); configured.EnsureSuccessStatusCode(); var a = new MemoryStorageAdapter(); var s = new CustomerStorage(a); var content = mode is "full" or "conflict" or "ack-error";
                    using var org = new OrganizationClient(Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"), new() { BaseUrl = url, MaxNetworkRetries = 0, TransportHandler = new ObserveAck(s, a, content) }); var events = org.Project("018f0000-0000-7000-8000-000000000077").Events;
                    StorageHistoryDescriptorDecoder decoder = async (_, _, _) => { if (mode == "null") return null!; if (mode == "error") throw new Exception("synthetic callback failure"); if (mode == "invalid") return new() { Conversations = [null!] }; if (mode == "empty") return new(); if (mode == "conflict") await s.ApplyAsync(new("*", [new StorageCheckpoint("*", "events", "competitor", PatchValue<string>.Set(null))])); return StorageHistoryChunk.FromJson(Fixture.GetProperty("chunk")); };
                    StorageSynchronization? sync = null; sync = events.SyncToStorage(s, new() { DecodeHistory = mode == "archive" ? (_, _, _) => throw new Exception("Archive should skip") : null, DecodeHistoryDescriptor = mode is "missing" or "archive" or "metadata" or "malformed" ? null : decoder, HistoryDescriptorMode = mode.StartsWith("metadata", StringComparison.Ordinal) ? StorageHistoryDescriptorMode.MetadataOnly : StorageHistoryDescriptorMode.Decode, OnApplied = (_, _) => sync!.Stop() }); Exception? error = null; try { await sync.Completion.WaitAsync(TimeSpan.FromSeconds(5)); } catch (Exception x) { error = x; }
                    using var state = JsonDocument.Parse(await fixture.GetStringAsync("/state")); var p = state.RootElement; var failed = mode is "missing" or "archive" or "null" or "error" or "invalid" or "malformed";
                    Check((error is not null) == (failed || mode is "conflict" or "ack-error"), branch + "/" + mode + " HTTP outcome"); Check(p.GetProperty("manual").GetBoolean() && p.GetProperty("media").GetInt32() == 0, "Manual stream without media download"); Check(p.GetProperty("acks").GetInt32() == (failed || mode == "conflict" ? 0 : 1), "HTTP ACK count"); Check(await s.HasEventAsync("descriptor-session", "descriptor-event") == !failed, "HTTP marker"); Check(a.Rows(StorageEntity.Messages).Count == (content ? 1 : 0), "HTTP content"); Check(a.Rows(StorageEntity.HistoryProgress).Any() == !failed, "HTTP independent progress"); Check((await s.CheckpointAsync("*", "events"))?.Cursor == (failed ? null : mode == "conflict" ? "competitor" : "descriptor-cursor"), "HTTP cursor");
                    if (mode is "full" or "metadata") { StorageSynchronization? again = null; again = events.SyncToStorage(s, new() { OnApplied = (_, _) => again!.Stop() }); await again.Completion.WaitAsync(TimeSpan.FromSeconds(5)); using var replay = JsonDocument.Parse(await fixture.GetStringAsync("/state")); Check(replay.RootElement.GetProperty("lastEventId").GetString() == "descriptor-cursor" && replay.RootElement.GetProperty("acks").GetInt32() == 2, "HTTP duplicate resume"); }
                    outcomes++;
                }
        }
        finally { if (!peer.HasExited) peer.Kill(true); await peer.WaitForExitAsync(); }
    }
}
