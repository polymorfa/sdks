using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Polymorfa.Sdk;

public sealed record RequestLogCredential(string Type, string? Id, string? Last4);
public sealed record RequestLog(string Id, string ProjectId, string CreatedAt, string Method, string Route, int? Status, decimal? DurationMs, string Result, string Source, string? RequestId, string? TraceId, string? ErrorCode, string? McpTool, RequestLogCredential? Credential);
public record RequestLogFilters(IReadOnlyList<string>? Status = null, IReadOnlyList<string>? Method = null, string? Route = null, string? Source = null, string? CredentialId = null, string? RequestId = null, string? TraceId = null, string? Since = null, string? Until = null);
public sealed record ListRequestLogsParameters(string? ProjectId = null, int? Limit = null, string? Cursor = null, RequestLogFilters? Filters = null);
public sealed record FollowRequestLogsParameters(string After, string? ProjectId = null, int? Limit = null);
public sealed record TailRequestLogsParameters(string? ProjectId = null, RequestLogFilters? Filters = null, int IntervalMs = 2000, int Backfill = 0);
public sealed record RequestLogPage(IReadOnlyList<RequestLog> Items, bool HasMore, string? NextCursor, string FollowCursor, ResponseMetadata Metadata);

public sealed class RequestLogs : Resource
{
    private readonly string? projectId;
    internal RequestLogs(HttpTransport http, string? projectId) : base(http) => this.projectId = projectId;
    private string Path(string? project)
    {
        if (projectId is not null && project is not null && projectId != project) throw new PolymorfaValidationException("This client reads only its project's request log.", "invalid_parameter");
        var selected = projectId ?? project;
        if (string.IsNullOrEmpty(selected)) throw new PolymorfaConfigurationException("projectId is required for a team request log.");
        return "/platform/projects/" + E(selected) + "/request-logs";
    }
    private static Dictionary<string, string> Filters(RequestLogFilters? filters)
    {
        var query = new Dictionary<string, string>(); if (filters is null) return query;
        if (filters.Status is { Count: > 0 }) query["status"] = string.Join(',', filters.Status);
        if (filters.Method is { Count: > 0 }) query["method"] = string.Join(',', filters.Method);
        foreach (var (key, value) in new[] { ("route", filters.Route), ("source", filters.Source), ("credentialId", filters.CredentialId), ("requestId", filters.RequestId), ("traceId", filters.TraceId), ("since", filters.Since), ("until", filters.Until) }) if (value is not null) query[key] = value;
        return query;
    }
    public Task<RequestLogPage> ListAsync(ListRequestLogsParameters? parameters = null, RequestOptions? options = null)
    {
        parameters ??= new(); var query = Filters(parameters.Filters);
        if (parameters.Cursor is not null && query.Count > 0) throw new PolymorfaValidationException("A cursor retains its filters; omit filters when using it.", "invalid_parameter");
        if (parameters.Limit is { } limit) query["limit"] = limit.ToString(CultureInfo.InvariantCulture);
        if (parameters.Cursor is not null) query["cursor"] = parameters.Cursor;
        return ReadAsync(parameters.ProjectId, query, options);
    }
    public Task<RequestLogPage> FollowAsync(FollowRequestLogsParameters parameters, RequestOptions? options = null)
    {
        var query = new Dictionary<string, string> { ["after"] = parameters.After };
        if (parameters.Limit is { } limit) query["limit"] = limit.ToString(CultureInfo.InvariantCulture);
        return ReadAsync(parameters.ProjectId, query, options);
    }
    private async Task<RequestLogPage> ReadAsync(string? project, Dictionary<string, string> query, RequestOptions? options)
    {
        var response = await Get<JsonElement>(Path(project), options, query).ConfigureAwait(false); var body = response.Data;
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("data", out var items) || items.ValueKind != JsonValueKind.Array || !body.TryGetProperty("page", out var page) || page.ValueKind != JsonValueKind.Object || !page.TryGetProperty("hasMore", out var more) || more.ValueKind is not (JsonValueKind.True or JsonValueKind.False) || !page.TryGetProperty("followCursor", out var follow) || follow.ValueKind != JsonValueKind.String || !page.TryGetProperty("nextCursor", out var next) || next.ValueKind is not (JsonValueKind.String or JsonValueKind.Null)) throw new PolymorfaServerException("Invalid request log page.", "invalid_response", response.Metadata);
        try { return new(items.Deserialize<IReadOnlyList<RequestLog>>(HttpTransport.Json) ?? throw new JsonException(), more.GetBoolean(), next.ValueKind == JsonValueKind.Null ? null : next.GetString(), follow.GetString()!, response.Metadata); }
        catch (JsonException) { throw new PolymorfaServerException("Invalid request log items.", "invalid_response", response.Metadata); }
    }
    public async IAsyncEnumerable<RequestLog> TailAsync(TailRequestLogsParameters? parameters = null, RequestOptions? options = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        parameters ??= new(); options ??= new();
        if (parameters.IntervalMs is < 1000 or > 60000 || parameters.Backfill is < 0 or > 100) throw new PolymorfaValidationException("Invalid tail interval or backfill.", "invalid_parameter");
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken, cancellationToken); options = options with { CancellationToken = linked.Token };
        var first = await WithRateLimitAsync(() => ListAsync(new(parameters.ProjectId, Math.Max(parameters.Backfill, 1), Filters: parameters.Filters), options), linked.Token).ConfigureAwait(false);
        if (first is null) yield break;
        if (parameters.Backfill > 0) foreach (var item in first.Items.Reverse()) { if (linked.IsCancellationRequested) yield break; yield return item; }
        var after = first.FollowCursor;
        while (!linked.IsCancellationRequested)
        {
            var page = await WithRateLimitAsync(() => FollowAsync(new(after, parameters.ProjectId, 100), options), linked.Token).ConfigureAwait(false); if (page is null) yield break;
            foreach (var item in page.Items) { if (linked.IsCancellationRequested) yield break; yield return item; }
            after = page.FollowCursor;
            if (!page.HasMore && !await WaitAsync(parameters.IntervalMs, linked.Token).ConfigureAwait(false)) yield break;
        }
    }
    private static async Task<RequestLogPage?> WithRateLimitAsync(Func<Task<RequestLogPage>> read, CancellationToken cancellation)
    {
        while (!cancellation.IsCancellationRequested) try { return await read().ConfigureAwait(false); }
            catch (PolymorfaRateLimitException error) { if (!await WaitAsync(RetryAfterMs(error.Metadata?.Headers.GetValueOrDefault("retry-after")), cancellation).ConfigureAwait(false)) return null; }
            catch (PolymorfaCancelledException) when (cancellation.IsCancellationRequested) { return null; }
            catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { return null; }
        return null;
    }
    public static int RetryAfterMs(string? header, DateTimeOffset? now = null)
    {
        var value = header?.Trim();
        if (value is not null && value.Length > 0 && value.All(char.IsAsciiDigit)) return double.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var seconds) ? (int)Math.Min(seconds * 1000, 300000) : 300000;
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)) return (int)Math.Clamp((date - (now ?? DateTimeOffset.UtcNow)).TotalMilliseconds, 0, 300000);
        return 60000;
    }
    private static async Task<bool> WaitAsync(int milliseconds, CancellationToken cancellation) { try { await Task.Delay(milliseconds, cancellation).ConfigureAwait(false); return true; } catch (OperationCanceledException) { return false; } }
}
