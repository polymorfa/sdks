using Microsoft.JSInterop;
using Polymorfa.Sdk.Storage;

namespace Polymorfa.Storage.IndexedDb;

public sealed record IndexedDbStorageOptions(string Namespace)
{
    public string? DatabaseName { get; init; }
    public int MaxQueryRows { get; init; } = 100000;
}

/// <summary>Browser-local schema-2 storage. Each conditional commit completes in one native IndexedDB transaction.</summary>
public sealed class IndexedDbStorageAdapter : IStorageAdapter, IAsyncDisposable
{
    private readonly IJSObjectReference module;
    private readonly int handle;
    private int disposed;
    private sealed class Receipt
    {
        public string Status { get; set; } = "";
        public StorageRow[]? Rows { get; set; }
        public string[]? Conflicts { get; set; }
    }
    private IndexedDbStorageAdapter(IJSObjectReference module, int handle) { this.module = module; this.handle = handle; }
    public string Name => "indexeddb";
    public StorageCapabilities Capabilities => new(true, 1000);

    /// <summary>Uses the application's JS runtime. No API client, credential or backend request is involved.</summary>
    public static async Task<IndexedDbStorageAdapter> ConnectAsync(IJSRuntime runtime, IndexedDbStorageOptions options, CancellationToken cancellation = default)
    {
        if (!OperatingSystem.IsBrowser()) throw new StorageValidationException("IndexedDB storage requires Blazor WebAssembly in a browser.");
        ArgumentNullException.ThrowIfNull(runtime); ArgumentNullException.ThrowIfNull(options);
        _ = StorageSchema.ValidateNamespace(options.Namespace);
        if (options.DatabaseName is { Length: 0 or > 256 } || options.DatabaseName?.Any(char.IsControl) == true || options.MaxQueryRows is < 1 or > 100000) throw new StorageValidationException("Invalid IndexedDB storage configuration.");
        cancellation.ThrowIfCancellationRequested();
        IJSObjectReference? module = null; IndexedDbStorageAdapter? adapter = null;
        try
        {
            module = await runtime.InvokeAsync<IJSObjectReference>("import", CancellationToken.None, "./_content/Polymorfa.Storage.IndexedDb/indexeddb.js");
            cancellation.ThrowIfCancellationRequested();
            var handle = await module.InvokeAsync<int>("create", CancellationToken.None, options.Namespace, options.DatabaseName, options.MaxQueryRows);
            adapter = new(module, handle);
            await adapter.SetupAsync(cancellation);
            return adapter;
        }
        catch (Exception error)
        {
            if (adapter is not null) await adapter.DisposeAsync(); else if (module is not null) try { await module.DisposeAsync(); } catch (Exception) { }
            if (error is OperationCanceledException) throw Cancelled(cancellation);
            if (error is StorageException) throw;
            throw Provider();
        }
    }

    private async Task<Receipt> Execute(string action, object? payload, CancellationToken cancellation)
    {
        if (Volatile.Read(ref disposed) != 0) throw new StorageProviderException("IndexedDB storage is closed.");
        cancellation.ThrowIfCancellationRequested();
        var operation = Guid.NewGuid().ToString("N");
        try
        {
            // Do not cancel this await. The JS operation resolves only after completion or confirmed abort.
            var pending = module.InvokeAsync<Receipt>("execute", CancellationToken.None, handle, operation, action, payload).AsTask();
            using var registration = cancellation.Register(() => _ = Abort(operation));
            var result = await pending;
            switch (result.Status)
            {
                case "ok": case "conflict": return result;
                case "cancelled": throw Cancelled(cancellation);
                case "owner": throw new StorageValidationException("The IndexedDB database belongs to a different storage namespace.");
                case "bound": throw new StorageValidationException("The IndexedDB query exceeds the configured read bound.");
                default: throw Provider();
            }
        }
        catch (OperationCanceledException) { throw Cancelled(cancellation); }
        catch (StorageException) { throw; }
        catch (Exception) { throw Provider(); }
    }
    private async Task Abort(string operation)
    {
        try { await module.InvokeVoidAsync("cancel", CancellationToken.None, handle, operation); }
        catch (Exception) { /* The original operation still owns its final receipt. */ }
    }
    public async Task SetupAsync(CancellationToken cancellation = default)
    {
        if ((await Execute("setup", null, cancellation)).Status != "ok") throw Provider();
    }
    public Task<IReadOnlyDictionary<string, StorageRow>> GetAsync(StorageEntity entity, IReadOnlyList<string> ids, CancellationToken cancellation = default)
    {
        var name = StorageSchema.Definition(entity).Name; var prepared = ids.ToArray();
        if (prepared.Length > 10000 || prepared.Any(id => string.IsNullOrEmpty(id) || id.Length > 4096)) throw new StorageValidationException("Invalid IndexedDB read.");
        return Read();
        async Task<IReadOnlyDictionary<string, StorageRow>> Read()
        {
            var receipt = await Execute("get", new { entity = name, ids = prepared }, cancellation);
            if (receipt.Status != "ok" || receipt.Rows is null) throw Provider();
            var result = new Dictionary<string, StorageRow>(StringComparer.Ordinal);
            foreach (var row in receipt.Rows) { ValidateRow(entity, row); if (!prepared.Contains(row.Id) || !result.TryAdd(row.Id, row)) throw Provider(); }
            return result;
        }
    }
    public Task<StorageCommitResult> CommitAsync(IReadOnlyList<StorageWrite> writes, CancellationToken cancellation = default)
    {
        var prepared = writes.Select<StorageWrite, StorageWrite>(write => write switch { StoragePut put => put with { Row = MemoryStorageAdapter.Clone(put.Row) }, StorageRowDelete delete => delete, _ => throw new StorageValidationException("Invalid IndexedDB write.") }).ToArray();
        StorageValidation.ValidateCommit(prepared, 1000);
        return Commit();
        async Task<StorageCommitResult> Commit()
        {
            var receipt = await Execute("commit", prepared, cancellation);
            if (receipt.Status == "ok" && receipt.Conflicts is not { Length: > 0 }) return new(true);
            var ids = prepared.Select(w => w switch { StoragePut p => p.Row.Id, StorageRowDelete d => d.Id, _ => "" }).ToHashSet(StringComparer.Ordinal);
            if (receipt.Status != "conflict" || receipt.Conflicts is not { Length: > 0 } conflicts || conflicts.Distinct(StringComparer.Ordinal).Count() != conflicts.Length || conflicts.Any(id => !ids.Contains(id))) throw Provider();
            return new(false, conflicts);
        }
    }
    public Task<IReadOnlyList<StorageRow>> QueryAsync(StorageEntity entity, StorageIndexQuery query, CancellationToken cancellation = default)
    {
        var prepared = query with { EqualValues = query.EqualValues.ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal) };
        _ = StorageValidation.ValidateQuery(entity, prepared); var name = StorageSchema.Definition(entity).Name;
        return Read();
        async Task<IReadOnlyList<StorageRow>> Read()
        {
            var receipt = await Execute("scan", new { entity = name }, cancellation);
            if (receipt.Status != "ok" || receipt.Rows is null) throw Provider();
            foreach (var row in receipt.Rows) ValidateRow(entity, row);
            return StorageValidation.FilterRows(entity, receipt.Rows, prepared);
        }
    }
    private static void ValidateRow(StorageEntity entity, StorageRow row)
    {
        try { StorageValidation.ValidateCommit(new[] { new StoragePut(entity, row, null) }, 1); }
        catch (Exception) { throw Provider(); }
    }
    private static StorageProviderException Provider() => new("Browser IndexedDB storage failed; inspect the saved checkpoint before resuming an uncertain commit.");
    private static OperationCanceledException Cancelled(CancellationToken cancellation) => new("Browser IndexedDB operation was canceled.", cancellation);
    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        try { await module.InvokeVoidAsync("close", CancellationToken.None, handle); }
        catch (Exception) { }
        finally { try { await module.DisposeAsync(); } catch (Exception) { } }
    }
}
