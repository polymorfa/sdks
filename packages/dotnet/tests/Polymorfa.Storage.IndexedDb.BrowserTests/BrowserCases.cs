using System.Text.Json;
using Microsoft.JSInterop;
using Polymorfa.Sdk;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.IndexedDb;

namespace Polymorfa.Storage.IndexedDb.BrowserTests;

internal static class BrowserCases
{
    private static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static IReadOnlyDictionary<string, string> Key(string id) => new Dictionary<string, string> { { "sessionId", "browser-native" }, { "messageId", id } };
    private static StorageRow Row(string id) => StorageMerge.EmptyRow(StorageEntity.Messages, Key(id)) with { Revision = 1 };
    internal sealed class CancelRequest(CancellationTokenSource source)
    {
        [JSInvokable] public void Cancel() => source.Cancel();
    }
    private sealed class DatabaseInfo { public int Version { get; set; } public string[] Stores { get; set; } = Array.Empty<string>(); }
    internal static async Task Run(IJSRuntime runtime, IndexedDbStorageAdapter adapter, string name, IJSObjectReference harness)
    {
        try { _ = Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"); throw new Exception("Browser organization credential accepted"); } catch (PolymorfaConfigurationException) { }
        try { _ = Credential.ProjectToken("pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"); throw new Exception("Browser project credential accepted"); } catch (PolymorfaConfigurationException) { }
        Check(Credential.ClientToken("pmfa_ct_synthetic-browser-client").Kind == CredentialKind.ClientToken, "Browser client principal unavailable");
        try { await using var wrong = await IndexedDbStorageAdapter.ConnectAsync(runtime, new("different-owner") { DatabaseName = name }); throw new Exception("Namespace owner rebound"); } catch (StorageValidationException) { }
        var missing = Row("rolled-back-before-stale-delete");
        Check(!(await adapter.CommitAsync(new StorageWrite[] { new StoragePut(StorageEntity.Messages, missing, null), new StorageRowDelete(StorageEntity.Messages, Row("absent").Id, 1) })).Ok, "Missing conditional delete accepted");
        Check((await adapter.GetAsync(StorageEntity.Messages, new[] { missing.Id })).Count == 0, "Stale delete left an earlier write");
        try { await adapter.QueryAsync(StorageEntity.Messages, new("unknown", new Dictionary<string, string>(), 1)); throw new Exception("Open schema index accepted"); } catch (StorageValidationException) { }
        await using (var bounded = await IndexedDbStorageAdapter.ConnectAsync(runtime, new("browser-tests") { DatabaseName = name, MaxQueryRows = 1 }))
        {
            try { await bounded.QueryAsync(StorageEntity.Messages, new("by_chat", new Dictionary<string, string> { { "sessionId", "no-match" }, { "chatId", "no-match" } }, 1)); throw new Exception("Unbounded scan accepted"); } catch (StorageValidationException) { }
        }
        await Mutation(runtime, name);
        await Cancellation(adapter, harness);
        await Schema(runtime, name, harness);
        await SetupCancellation(runtime, name, harness);
        var denied = await harness.InvokeAsync<string>("opaqueOrigin", name); Check(denied.StartsWith("PASS C# WASM native opaque-origin", StringComparison.Ordinal), "Native sandbox denial failed: " + denied);
        Console.WriteLine("PASS indexeddb: browser credential guards, namespace binding, missing-delete rollback, closed indexes, bounded scans, input snapshots, cancellation receipts, native schema upgrade and blocked recovery");
    }
    private static async Task Mutation(IJSRuntime runtime, string name)
    {
        var paused = new PausedRuntime(runtime);
        await using var adapter = await IndexedDbStorageAdapter.ConnectAsync(paused, new("browser-tests") { DatabaseName = name });
        var row = Row("immutable"); var fields = row.Fields.ToDictionary(p => p.Key, p => p.Value); var versions = new Dictionary<string, double> { { "extra", 2 } };
        using var document = JsonDocument.Parse("{\"original\":true}"); fields["extra"] = document.RootElement; fields["chatId"] = JsonSerializer.SerializeToElement("original-chat"); fields["timestamp"] = JsonSerializer.SerializeToElement(1);
        var writes = new List<StorageWrite> { new StoragePut(StorageEntity.Messages, row with { Fields = fields, Versions = versions }, null) };
        paused.Arm(); var pending = adapter.CommitAsync(writes); await paused.Started.Task;
        writes.Clear(); fields["extra"] = JsonSerializer.SerializeToElement("mutated"); versions["extra"] = 999; document.Dispose(); paused.Release.TrySetResult(); Check((await pending).Ok, "Prepared mutation commit failed");
        var saved = (await adapter.GetAsync(StorageEntity.Messages, new[] { row.Id }))[row.Id]; Check(saved.Fields["extra"].GetProperty("original").GetBoolean() && saved.Versions["extra"] == 2, "Caller mutation changed prepared row");
        var equals = new Dictionary<string, string> { { "sessionId", "browser-native" }, { "chatId", "original-chat" } };
        paused.Arm(); var query = adapter.QueryAsync(StorageEntity.Messages, new("by_chat", equals, 10)); await paused.Started.Task; equals["chatId"] = "mutated-chat"; paused.Release.TrySetResult(); Check((await query).Single().Id == row.Id, "Caller mutation changed query scope");
    }
    private static async Task Cancellation(IndexedDbStorageAdapter adapter, IJSObjectReference harness)
    {
        using (var before = new CancellationTokenSource())
        {
            before.Cancel(); try { await adapter.CommitAsync(new[] { new StoragePut(StorageEntity.Messages, Row("pre-cancel"), null) }, before.Token); throw new Exception("Pre-admission cancellation ignored"); } catch (OperationCanceledException) { }
        }
        var rows = Enumerable.Range(0, 1000).Select(n => Row("cancelled-" + n)).ToArray();
        using (var source = new CancellationTokenSource())
        using (var callback = DotNetObjectReference.Create(new CancelRequest(source)))
        {
            await harness.InvokeVoidAsync("armCancelOnFirstWrite", callback);
            try { await adapter.CommitAsync(rows.Select(r => (StorageWrite)new StoragePut(StorageEntity.Messages, r, null)).ToArray(), source.Token); throw new Exception("Active native transaction did not abort"); }
            catch (OperationCanceledException error) { Check(source.IsCancellationRequested && error.InnerException is null, "Cancellation receipt lost native cancellation"); }
            finally { await harness.InvokeVoidAsync("disarm"); }
        }
        Check((await adapter.GetAsync(StorageEntity.Messages, rows.Select(r => r.Id).ToArray())).Count == 0, "Canceled native transaction persisted rows");
        var committed = Row("completed-before-cancel");
        using (var source = new CancellationTokenSource())
        using (var callback = DotNetObjectReference.Create(new CancelRequest(source)))
        {
            await harness.InvokeVoidAsync("armCancelAfterComplete", callback);
            try { Check((await adapter.CommitAsync(new[] { new StoragePut(StorageEntity.Messages, committed, null) }, source.Token)).Ok, "Completed native transaction was reported canceled"); await Task.Delay(10); Check(source.IsCancellationRequested, "Late native completion cancellation was not exercised"); }
            finally { await harness.InvokeVoidAsync("disarm"); }
        }
        Check((await adapter.GetAsync(StorageEntity.Messages, new[] { committed.Id })).Count == 1, "Completed native transaction lost its write");
    }
    private static async Task SetupCancellation(IJSRuntime runtime, string name, IJSObjectReference harness)
    {
        var database = name + "_cancel-owner";
        using (var source = new CancellationTokenSource())
        using (var callback = DotNetObjectReference.Create(new CancelRequest(source)))
        {
            await harness.InvokeVoidAsync("armCancelOnOwnerAdd", callback);
            try { await using var canceled = await IndexedDbStorageAdapter.ConnectAsync(runtime, new("canceled-owner") { DatabaseName = database }, source.Token); throw new Exception("Active owner claim did not abort"); }
            catch (OperationCanceledException) { Check(source.IsCancellationRequested, "Owner claim cancellation was not exercised"); }
            finally { await harness.InvokeVoidAsync("disarm"); }
        }
        await using var replacement = await IndexedDbStorageAdapter.ConnectAsync(runtime, new("replacement-owner") { DatabaseName = database });
        await replacement.SetupAsync();
    }
    private static async Task Schema(IJSRuntime runtime, string name, IJSObjectReference harness)
    {
        var row = Row("version-one"); var upgrade = name + "_upgrade";
        await harness.InvokeVoidAsync("prepareVersion1", upgrade, row, false);
        await using (var adapter = await IndexedDbStorageAdapter.ConnectAsync(runtime, new("browser-tests") { DatabaseName = upgrade })) Check((await adapter.GetAsync(StorageEntity.Messages, new[] { row.Id })).Count == 1, "Upgrade lost existing row");
        var info = await harness.InvokeAsync<DatabaseInfo>("inspect", upgrade); Check(info.Version == 2 && info.Stores.Length == 17, "Upgrade did not install the closed schema");
        var blocked = name + "_blocked"; await harness.InvokeVoidAsync("prepareVersion1", blocked, null, true);
        try { await using var rejected = await IndexedDbStorageAdapter.ConnectAsync(runtime, new("browser-tests") { DatabaseName = blocked }); throw new Exception("Blocked upgrade reported success"); }
        catch (StorageProviderException error) { Check(error.InnerException is null, "Blocked upgrade leaked native error"); }
        finally { await harness.InvokeVoidAsync("releaseVersion1", blocked); }
        await using var recovered = await IndexedDbStorageAdapter.ConnectAsync(runtime, new("browser-tests") { DatabaseName = blocked }); await recovered.SetupAsync();
    }
    private sealed class PausedRuntime(IJSRuntime runtime) : IJSRuntime
    {
        private int armed;
        internal TaskCompletionSource Started { get; private set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal TaskCompletionSource Release { get; private set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal void Arm() { Started = new(TaskCreationOptions.RunContinuationsAsynchronously); Release = new(TaskCreationOptions.RunContinuationsAsynchronously); Interlocked.Exchange(ref armed, 1); }
        public ValueTask<T> InvokeAsync<T>(string identifier, object?[]? args) => InvokeAsync<T>(identifier, CancellationToken.None, args);
        public async ValueTask<T> InvokeAsync<T>(string identifier, CancellationToken cancellation, object?[]? args)
        {
            var result = await runtime.InvokeAsync<T>(identifier, cancellation, args);
            return identifier == "import" && result is IJSObjectReference module ? (T)(object)new PausedModule(module, this) : result;
        }
        private sealed class PausedModule(IJSObjectReference module, PausedRuntime owner) : IJSObjectReference
        {
            public ValueTask<T> InvokeAsync<T>(string identifier, object?[]? args) => InvokeAsync<T>(identifier, CancellationToken.None, args);
            public async ValueTask<T> InvokeAsync<T>(string identifier, CancellationToken cancellation, object?[]? args)
            {
                if (identifier == "execute" && Interlocked.Exchange(ref owner.armed, 0) == 1) { owner.Started.TrySetResult(); await owner.Release.Task.WaitAsync(cancellation); }
                return await module.InvokeAsync<T>(identifier, cancellation, args);
            }
            public ValueTask DisposeAsync() => module.DisposeAsync();
        }
    }
}
