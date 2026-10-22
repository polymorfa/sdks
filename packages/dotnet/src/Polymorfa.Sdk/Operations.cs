using System.Diagnostics;
using System.Text.Json;

namespace Polymorfa.Sdk;

public sealed record OperationProgress(string Code, long? Current, long? Total);
public sealed record OperationError(string Code, bool Retryable, IReadOnlyDictionary<string, JsonElement>? Details);
public sealed record OperationActionRequired(string Code, IReadOnlyDictionary<string, JsonElement>? Details);
public sealed record OperationResource(string Type, string Id);
public sealed record OperationCapabilities(bool Cancellable, bool Watchable);
public sealed record ManagementOperation(string Id, string OrganizationId, string? ProjectId, string Kind, OperationResource Resource, string Status, long Sequence, OperationCapabilities Capabilities, OperationProgress? Progress, JsonElement Result, OperationError? Error, OperationActionRequired? ActionRequired, string CreatedAt, string UpdatedAt, string? CompletedAt);
public sealed record OperationSnapshot(OperationProgress? Progress, OperationError? Error, OperationActionRequired? ActionRequired);
public sealed record OperationTransition(string OperationId, long Sequence, string? FromStatus, string ToStatus, string? ReasonCode, string OccurredAt, OperationSnapshot Snapshot);
public sealed record OperationCancellationReceipt(ManagementOperation Operation, string OperationId, IdempotencyReceipt Idempotency);
public sealed record ListOperationsParameters(string? Status = null, string? Kind = null, string? ResourceType = null, string? ResourceId = null, string? Since = null, string? Until = null, int? Limit = null, string? Cursor = null, string? ProjectId = null);
public sealed record RetrieveOperationParameters(int? Wait = null, long? AfterSequence = null, string? ProjectId = null);
public sealed record ListOperationTransitionsParameters(long? AfterSequence = null, string? Cursor = null, int? Limit = null);
public sealed record WaitForOperationOptions
{
    public TimeSpan MaximumWait { get; init; } = TimeSpan.FromMinutes(5);
    public long? AfterSequence { get; init; }
    public string? ProjectId { get; init; }
    public RequestOptions? RequestOptions { get; init; }
    public CancellationToken CancellationToken { get; init; }
}
public sealed class Operations : Resource
{
    private readonly string prefix;
    private readonly string? projectId;
    internal Operations(HttpTransport http, string? projectId) : base(http) { this.projectId = projectId; prefix = projectId is null ? "/platform/operations" : $"/platform/projects/{E(projectId)}/operations"; }
    private string Path(string id) => prefix + "/" + E(id);
    private string? Project(string? requested) { if (projectId is not null && requested is not null && requested != projectId) throw new PolymorfaConfigurationException("Use the bound project."); return projectId is null ? requested : null; }
    public Task<CursorPage<ManagementOperation>> ListAsync(ListOperationsParameters? parameters = null, RequestOptions? options = null) => CursorPage<ManagementOperation>.LoadAsync(Http, prefix, Query(parameters is null ? null : parameters with { ProjectId = Project(parameters.ProjectId) }), options ?? new());
    public async Task<ApiResponse<ManagementOperation>> GetAsync(string id, RetrieveOperationParameters? parameters = null, RequestOptions? options = null)
    {
        parameters ??= new(); options ??= new();
        if (parameters.Wait is < 0 or > 30) throw new PolymorfaConfigurationException("wait must be an integer between 0 and 30.");
        if (parameters.Wait is > 0 && options.Timeout is null) options = options with { Timeout = TimeSpan.FromSeconds(parameters.Wait.Value + 15) };
        var response = await Get<DataEnvelope<ManagementOperation>>(Path(id), options, parameters with { ProjectId = Project(parameters.ProjectId) });
        return new(response.Data.Data, response.Metadata);
    }
    public Task<CursorPage<OperationTransition>> ListTransitionsAsync(string id, ListOperationTransitionsParameters? parameters = null, RequestOptions? options = null)
    {
        if (parameters?.AfterSequence is not null && parameters.Cursor is not null) throw new PolymorfaValidationException("Use afterSequence or cursor for transitions.", "invalid_parameter");
        return CursorPage<OperationTransition>.LoadAsync(Http, Path(id) + "/transitions", Query(parameters), options ?? new());
    }
    public async Task<ApiResponse<OperationCancellationReceipt>> CancelAsync(string id, RequestOptions? options = null)
    {
        var response = await Post<DataEnvelope<OperationCancellationReceipt>>(Path(id) + "/cancel", null, (options ?? new()).WithIdempotency());
        return new(response.Data.Data, response.Metadata);
    }
    public async Task<ApiResponse<ManagementOperation>> WaitAsync(string id, WaitForOperationOptions? options = null)
    {
        options ??= new();
        if (options.MaximumWait < TimeSpan.Zero || options.MaximumWait.TotalMilliseconds > uint.MaxValue - 1) throw new PolymorfaConfigurationException("MaximumWait must be a bounded non-negative duration.");
        var clock = Stopwatch.StartNew(); ApiResponse<ManagementOperation>? latest = null;
        var request = options.RequestOptions ?? new();
        using var caller = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken, request.CancellationToken);
        while (true)
        {
            if (caller.IsCancellationRequested) throw new PolymorfaCancelledException();
            var remaining = Math.Max(0, (options.MaximumWait - clock.Elapsed).TotalMilliseconds);
            var wait = (int)Math.Min(30, Math.Floor(remaining / 1000));
            using var budget = CancellationTokenSource.CreateLinkedTokenSource(caller.Token); budget.CancelAfter(TimeSpan.FromMilliseconds(Math.Max(remaining, 1000)));
            try { latest = await GetAsync(id, new(wait, options.AfterSequence, options.ProjectId), request with { CancellationToken = budget.Token }).ConfigureAwait(false); }
            catch (PolymorfaException) when (budget.IsCancellationRequested && !caller.IsCancellationRequested && latest is not null) { return latest; }
            if (latest.Data.Status is "succeeded" or "failed" or "cancelled" || options.AfterSequence is long sequence && latest.Data.Sequence > sequence || wait == 0 || clock.Elapsed >= options.MaximumWait) return latest;
        }
    }
}
