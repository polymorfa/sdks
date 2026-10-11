using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;

namespace Polymorfa.Sdk;

public sealed record CallRecord(string CallId, string? ProjectId, string SessionId, string Direction, string Upstream, string Outcome, string State, bool HasVideo, string? PeerRef, string StartedAt, string? ConnectedAt, string? EndedAt, decimal? DurationSeconds, string? EndReason);
public sealed record CallRecordEndReason(string Code, string Label);
public sealed record CallRecordParticipant(string Id, string State, string FirstSeenAt, string UpdatedAt, string? LeftReason);
public sealed record CallRecordConnection(string Id, string Participant, string Transport, string? JoinedAt, string? LeftAt, string? Reason);
public sealed record CallRecordTelemetry(string Status, string Source, decimal? SetupMs, decimal? RingMs, string? Codec, decimal? JitterMs, long? PacketsLost, decimal? RttMs, decimal? ReceivedKbps, decimal? SentKbps);
public sealed record CallRecordAppQuality(string ReportedAt, decimal? RttMs, decimal? JitterMs, long? PacketsLost, long? PacketsReceived, string? AudioCodec, string? VideoCodec, string? CandidateType, long? Reconnects);
public sealed record CallRecordAppError(string Code, string ReportedAt);
public sealed record CallRecordAppConnection(string ConnectionId, string Participant, CallReportClient? Client, CallRecordAppQuality? Quality, IReadOnlyList<CallRecordAppError> Errors);
public sealed record CallRecordAppReports(string Status, IReadOnlyList<CallRecordAppConnection> Connections, bool Truncated);
public sealed record CallRecordSummary(string CallId, string SessionId, string? ProjectId, string Direction, string State, bool Live, string Backend, bool HasVideo, string? PeerRef, string StartedAt, string? ConnectedAt, string? EndedAt, decimal? DurationSeconds, CallRecordEndReason? EndReason, string? AnsweredBy, bool? Exclusive);
public sealed record CallRecordHistoryEvent(string EventId, string Type, string OccurredAt);
public sealed record CallRecordHistory(IReadOnlyList<CallRecordHistoryEvent> Events, bool Truncated);
public sealed record CallRecordCorrelation(string CallId, string SessionId);
public sealed record CallRecordDetail(CallRecordSummary Call, IReadOnlyList<CallRecordParticipant> Participants, IReadOnlyList<CallRecordConnection> Connections, CallRecordTelemetry Telemetry, CallRecordAppReports AppReports, CallRecordHistory History, CallRecordCorrelation Correlation);
public record CallStatsMetrics(long Calls, long Answered, long Missed, long Declined, long Failed, long InProgress, decimal? AnswerRate, decimal TotalDurationSeconds, decimal? AverageDurationSeconds);
public sealed record CallStatsGroup(long Calls, long Answered, long Missed, long Declined, long Failed, long InProgress, decimal? AnswerRate, decimal TotalDurationSeconds, decimal? AverageDurationSeconds, string Key, string? Start) : CallStatsMetrics(Calls, Answered, Missed, Declined, Failed, InProgress, AnswerRate, TotalDurationSeconds, AverageDurationSeconds);
public sealed record CallStatsHeatmapCell(int DayOfWeek, int Hour, long Calls, long Answered);
public sealed record CallStats(string Since, string Until, string Timezone, string GroupBy, CallStatsMetrics Totals, IReadOnlyList<CallStatsGroup> Groups, bool GroupsTruncated, IReadOnlyList<CallStatsHeatmapCell> Heatmap);
public record CallFilters(string? ProjectId = null, string? SessionId = null, string? Direction = null, string? Upstream = null, string? Outcome = null, string? Since = null, string? Until = null);
public sealed record CallStatsParameters(string? ProjectId = null, string? SessionId = null, string? Direction = null, string? Upstream = null, string? Outcome = null, string? Since = null, string? Until = null, string? GroupBy = null, string? Timezone = null) : CallFilters(ProjectId, SessionId, Direction, Upstream, Outcome, Since, Until);
public sealed record ListCallRecordsParameters(string? ProjectId = null, string? SessionId = null, string? Direction = null, string? Upstream = null, string? Outcome = null, string? Since = null, string? Until = null, int? Limit = null, string? Cursor = null) : CallFilters(ProjectId, SessionId, Direction, Upstream, Outcome, Since, Until);
public sealed record ExportCallRecordsParameters(string? ProjectId = null, string? SessionId = null, string? Direction = null, string? Upstream = null, string? Outcome = null, string? Since = null, string? Until = null, string? Format = null, int? Limit = null, string? Cursor = null) : CallFilters(ProjectId, SessionId, Direction, Upstream, Outcome, Since, Until);
public sealed record CallRecordExportPage(string Format, string Body, string? NextCursor);
public sealed class CallRecords : Resource
{
    private readonly string? projectId;
    internal CallRecords(HttpTransport http, string? projectId) : base(http) => this.projectId = projectId;
    private Dictionary<string, string> Filters(CallFilters parameters)
    {
        var result = new Dictionary<string, string>();
        if (projectId is not null && parameters.ProjectId is not null && projectId != parameters.ProjectId) throw new PolymorfaConfigurationException("A project client reads only its own project's calls.");
        if ((projectId ?? parameters.ProjectId) is { } project) result["projectId"] = Text(project, 64);
        if (parameters.SessionId is { } session) result["sessionId"] = Text(session, 128);
        if (parameters.Direction is { } direction) result["direction"] = OneOf(direction, "inbound", "outbound");
        if (parameters.Upstream is { } upstream) result["upstream"] = OneOf(upstream, "linked_device", "cloud_api");
        if (parameters.Outcome is { } outcome) result["outcome"] = OneOf(outcome, "answered", "missed", "declined", "failed", "in_progress");
        foreach (var (key, value) in new[] { ("since", parameters.Since), ("until", parameters.Until) }) if (value is not null) { if (!Regex.IsMatch(value, "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2})$") || !DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) throw new PolymorfaConfigurationException("Call timestamps require a real ISO date-time with a time zone."); result[key] = value; }
        return result;
    }
    private static string Text(string value, int maximum) => !string.IsNullOrWhiteSpace(value) && value.Length <= maximum ? value : throw new PolymorfaConfigurationException("Invalid call filter.");
    private static string OneOf(string value, params string[] values) => values.Contains(value) ? value : throw new PolymorfaConfigurationException("Invalid call filter.");
    private static void Limit(Dictionary<string, string> query, int? limit, string? cursor, int max) { if (limit is { } n) { if (n < 1 || n > max) throw new PolymorfaConfigurationException("Invalid call page limit."); query["limit"] = n.ToString(CultureInfo.InvariantCulture); } if (cursor is not null) query["cursor"] = Text(cursor, 256); }
    public async Task<ApiResponse<CallRecordDetail>> RetrieveAsync(string id, string? projectId = null, RequestOptions? options = null)
    {
        if (!Regex.IsMatch(id, "^[\\x21-\\x7e]{1,128}$")) throw new PolymorfaConfigurationException("Invalid callId."); var r = await Get<DataEnvelope<CallRecordDetail>>("/platform/calls/" + E(id), options, Filters(new(ProjectId: projectId))).ConfigureAwait(false); return new(r.Data.Data, r.Metadata);
    }
    public async Task<ApiResponse<CallStats>> StatsAsync(CallStatsParameters? parameters = null, RequestOptions? options = null)
    {
        parameters ??= new(); var query = Filters(parameters); if (parameters.GroupBy is { } group) query["groupBy"] = OneOf(group, "day", "hour", "session", "outcome"); if (parameters.Timezone is { } zone) query["timezone"] = Text(zone, 64); var r = await Get<DataEnvelope<CallStats>>("/platform/calls/stats", options, query).ConfigureAwait(false); return new(r.Data.Data, r.Metadata);
    }
    public Task<CursorPage<CallRecord>> ListAsync(ListCallRecordsParameters? parameters = null, RequestOptions? options = null) { parameters ??= new(); var query = Filters(parameters); Limit(query, parameters.Limit, parameters.Cursor, 100); return CursorPage<CallRecord>.LoadAsync(Http, "/platform/calls", Query(query), options ?? new()); }
    public async Task<ApiResponse<CallRecordExportPage>> ExportAsync(ExportCallRecordsParameters? parameters = null, RequestOptions? options = null)
    {
        parameters ??= new(); var query = Filters(parameters); var format = OneOf(parameters.Format ?? "csv", "csv", "ndjson"); query["format"] = format; Limit(query, parameters.Limit, parameters.Cursor, 1000); var contentType = format == "csv" ? "text/csv" : "application/x-ndjson";
        var r = await Http.RequestTextAsync("/platform/calls/export", contentType, options, Query(query)).ConfigureAwait(false);
        if (r.Metadata.Headers.GetValueOrDefault("content-type")?.Split(';')[0].Trim().ToLowerInvariant() != contentType) throw new PolymorfaServerException("Unexpected call export content type.", "invalid_response", r.Metadata);
        var next = r.Metadata.Headers.GetValueOrDefault("polymorfa-next-cursor"); return new(new(format, r.Data, string.IsNullOrEmpty(next) ? null : next), r.Metadata);
    }
    public async IAsyncEnumerable<string> ExportAllAsync(ExportCallRecordsParameters? parameters = null, RequestOptions? options = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        parameters ??= new(); options ??= new(); using var linked = CancellationTokenSource.CreateLinkedTokenSource(options.CancellationToken, cancellationToken); options = options with { CancellationToken = linked.Token }; var seen = new HashSet<string>(); if (parameters.Cursor is { } initial) seen.Add(initial); var first = true;
        while (true) { var r = await ExportAsync(parameters, options).ConfigureAwait(false); if (r.Data.NextCursor is { } next && !seen.Add(next)) throw new PolymorfaServerException("Repeated call export cursor.", "invalid_response", r.Metadata); var body = r.Data.Body; if (!first && r.Data.Format == "csv") { var end = body.IndexOf('\n'); body = end < 0 ? "" : body[(end + 1)..]; } first = false; if (body.Length > 0) yield return body; if (r.Data.NextCursor is null) yield break; parameters = parameters with { Cursor = r.Data.NextCursor }; }
    }
}
