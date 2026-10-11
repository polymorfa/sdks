using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record BanSafeHealthProbabilities(decimal Healthy, decimal Limited, decimal Restricted, decimal Banned);
public sealed record BanSafeHealthPenalties(decimal Conduct, decimal Delivery, decimal Connection, decimal Restriction, decimal Total);
public sealed record BanSafeHealthFactor(string Group, string Key, decimal Penalty, decimal ObservedValue, long SampleSize);
public sealed record BanSafeHealthExplanation(BanSafeHealthPenalties Penalties, IReadOnlyList<BanSafeHealthFactor> Factors, IReadOnlyList<string> MeasuredGroups, IReadOnlyList<string> MissingGroups);
public sealed record BanSafeObservedAccountState(string State, string ObservedAt, string Source);
public record BanSafeHealthProjection
{
    public decimal? Health { get; init; }
    public string? Band { get; init; }
    public string HealthSource { get; init; } = null!;
    public string? HealthEstimatorVersion { get; init; }
    public string? HealthModelVersion { get; init; }
    public string? HealthEvaluatedAt { get; init; }
    public decimal? HealthFeatureCoverage { get; init; }
    public string HealthReliability { get; init; } = null!;
    public string? HealthUnavailableReason { get; init; }
    public BanSafeHealthProbabilities? HealthProbabilities { get; init; }
    public string? MostLikelyHealthState { get; init; }
    public BanSafeHealthExplanation? HealthExplanation { get; init; }
    public BanSafeObservedAccountState? ObservedAccountState { get; init; }
}
public record BanSafeNumber : BanSafeHealthProjection
{
    public string SessionId { get; init; } = null!;
    public string Session { get; init; } = null!;
    public string PhoneNumber { get; init; } = null!;
    public string ProjectId { get; init; } = null!;
    public BanSafeNumberEnforcement? Enforcement { get; init; }
}
public sealed record BanSafeNumberEnforcement(string Rung, string PreviousRung, string OrganizationFloor, string Reason, string Source, decimal? ThroughputPerMinute, bool BlocksUnsolicited, bool Suspended, string StartedAt, string? EligibleLiftAt, decimal ExitProgress, IReadOnlyList<string> BlockingFindings, bool OperatorHold, string AppealState, string State);
public sealed record BanSafeNumberWarmup(bool Enabled, string? TenureSource, int TenureDay, int? Allowance, int? SentToday, string? ResetsAt, IReadOnlyList<WarmupCurvePoint> Curve);
public sealed record BanSafeNumberDetail : BanSafeNumber
{
    public BanSafeNumberWarmup Warmup { get; init; } = null!;
    public IReadOnlyList<BanSafeFinding> Findings { get; init; } = null!;
    public string? LiftRequires { get; init; }
    public string AppealState { get; init; } = null!;
}
public sealed record BanSafeHealthHistory(string SessionId, string Session, IReadOnlyList<BanSafeHealthProjection> Points);
public sealed record BanSafeFinding(string? Id, string Key, string Title, string Summary, string Fix, string Status, string? Severity, long Occurrences, long ReopenedCount, IReadOnlyDictionary<string, decimal> Evidence, string SessionId, string Session, string PhoneNumber, string? FirstSeenAt, string? LastSeenAt, string? AcknowledgedAt, string? AcknowledgedBy, string? AcknowledgementNote, string? SnoozedUntil, string? ResolvedAt, string? ResolveReason);
public sealed record BanSafeEnforcementSummary : BanSafeNumber
{
    public string Rung { get; init; } = null!;
    public string PreviousRung { get; init; } = null!;
    public string OrganizationFloor { get; init; } = null!;
    public string Reason { get; init; } = null!;
    public string Source { get; init; } = null!;
    public decimal? ThroughputPerMinute { get; init; }
    public bool BlocksUnsolicited { get; init; }
    public bool Suspended { get; init; }
    public IReadOnlyList<string> BlockingFindings { get; init; } = null!;
    public string StartedAt { get; init; } = null!;
    public string? EligibleLiftAt { get; init; }
    public string LiftRequires { get; init; } = null!;
    public bool OperatorHold { get; init; }
    public string AppealState { get; init; } = null!;
    public string State { get; init; } = null!;
}
public sealed record BanSafeIncident(string Id, string SessionId, string Session, string PhoneNumber, string ProjectId, string Kind, string Source, string Resolution, bool Ambiguous, string StartedAt, string? EndsAt, string? ClosedAt, string? ClosedBy, string? ClaimId, string? Note, string? ReportedBy, string CreatedAt);
public sealed record ReportBanSafeIncidentRequest(string Session, string? OccurredAt = null, string? Note = null);
public sealed record BanSafeIncidentReceipt(string IncidentId, bool Created, string SessionId, string Session, string OccurredAt);
public sealed record BanSafeClaimEvidence(long? AttributionRuleVersion, int WindowDays, bool DeviceEvidence, long OtherDevices, bool RestrictedInWindow, long CriticalFindingDays, bool SharedConnection, decimal MeasuredHours);
public sealed record BanSafeClaim(string Id, string IncidentId, string SessionId, string Session, string PhoneNumber, string ProjectId, string Status, string Verdict, string WindowStart, string WindowEnd, decimal MeasuredCents, decimal CapCents, decimal AmountCents, BanSafeClaimEvidence Evidence, string Summary, string Reason, string? DecidedAt, string? PaidAt, string CreatedAt);
public sealed record BanSafeSignalDefinition(string Key, string Label, string Group, string Kind, string Unit, string Description);
public sealed record BanSafeCodeCount(long Code, long Count);
[JsonConverter(typeof(BanSafeSignalValueConverter))]
public abstract record BanSafeSignalValue;
public sealed record BanSafeNumberSignal(decimal Value) : BanSafeSignalValue;
public sealed record BanSafeBooleanSignal(bool Value) : BanSafeSignalValue;
public sealed record BanSafeEnumSignal(string Value) : BanSafeSignalValue;
public sealed record BanSafeHistogramSignal(IReadOnlyList<decimal> Values) : BanSafeSignalValue;
public sealed record BanSafeSignal(string Key, string Label, string Group, string Kind, string Unit, string Description, bool Measured, BanSafeSignalValue? Value, long? SampleSize, IReadOnlyList<BanSafeCodeCount>? Codes);
internal sealed class BanSafeSignalValueConverter : JsonConverter<BanSafeSignalValue>
{
    public override BanSafeSignalValue Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        using var document = JsonDocument.ParseValue(ref reader); var value = document.RootElement;
        return value.ValueKind switch { JsonValueKind.Number => new BanSafeNumberSignal(value.GetDecimal()), JsonValueKind.True => new BanSafeBooleanSignal(true), JsonValueKind.False => new BanSafeBooleanSignal(false), JsonValueKind.String => new BanSafeEnumSignal(value.GetString()!), JsonValueKind.Array => new BanSafeHistogramSignal(value.EnumerateArray().Select(v => v.GetDecimal()).ToArray()), _ => throw new JsonException("Invalid BanSafe signal value.") };
    }
    public override void Write(Utf8JsonWriter writer, BanSafeSignalValue value, JsonSerializerOptions options)
    {
        switch (value) { case BanSafeNumberSignal n: writer.WriteNumberValue(n.Value); break; case BanSafeBooleanSignal b: writer.WriteBooleanValue(b.Value); break; case BanSafeEnumSignal e: writer.WriteStringValue(e.Value); break; case BanSafeHistogramSignal h: JsonSerializer.Serialize(writer, h.Values, options); break; default: throw new JsonException("Invalid BanSafe signal value."); }
    }
}
public sealed record BanSafeCollectionStatus(string State, string? LatestFlushedAt, string? LatestReceivedAt, string? FreshUntil, long? RecordVersion, long? CollectorVersion, bool? Partial, long? DroppedRecords);
public sealed record BanSafeTelemetrySnapshot(string BucketStart, string FlushedAt, string ReceivedAt, bool Partial, long? RecordVersion, IReadOnlyList<BanSafeSignal> Signals);
public sealed record BanSafeCollectionSession(string SessionId, string Session, string ProjectId, BanSafeCollectionStatus Collection);
public sealed record BanSafeTelemetryDetail(string SessionId, string Session, string ProjectId, BanSafeCollectionStatus Collection, BanSafeTelemetrySnapshot? Snapshot);
public sealed record BanSafeHealthAction(string Id, string SessionId, string Session, string ProjectId, string Mode, string Action, string Status, decimal Health, decimal Threshold, string HealthSource, string EstimatorVersion, string? ModelVersion, decimal? SlowDownMps, string EvaluatedAt, string CreatedAt, string? CompletedAt, string? Outcome);
public sealed record ListBanSafeHealthParameters(string? ProjectId = null, string? Cursor = null, int? Limit = null);
public sealed record ListBanSafeHistoryParameters(string? Since = null, int? Limit = null);
public sealed record ListBanSafeFindingsParameters(string? ProjectId = null, string? Cursor = null, int? Limit = null, string? Session = null, string? Status = null, string? Severity = null);
public sealed record ListBanSafeEnforcementParameters(string? ProjectId = null, string? Cursor = null, int? Limit = null, string? Rung = null);
public sealed record ListBanSafeIncidentsParameters(string? ProjectId = null, string? Cursor = null, int? Limit = null, string? Session = null);
public sealed record ListBanSafeClaimsParameters(string? ProjectId = null, string? Cursor = null, int? Limit = null, string? Session = null, string? Status = null);
public sealed record ListBanSafeTelemetryHistoryParameters(string? Since = null, string? Until = null, string? Cursor = null, int? Limit = null);
public sealed record ListBanSafeHealthActionsParameters(string? ProjectId = null, string? Cursor = null, int? Limit = null, string? Session = null, string? Status = null);
public sealed class BanSafe : Resource
{
    internal BanSafe(HttpTransport http) : base(http) { }
    public Task<CursorPage<BanSafeNumber>> ListHealthAsync(ListBanSafeHealthParameters? parameters = null, RequestOptions? options = null) => Page<BanSafeNumber>("health", parameters, options);
    public Task<ApiResponse<DataEnvelope<BanSafeNumberDetail>>> GetHealthAsync(string session, RequestOptions? options = null) => Get<DataEnvelope<BanSafeNumberDetail>>("/platform/bansafe/health/" + E(session), options);
    public Task<ApiResponse<DataEnvelope<BanSafeHealthHistory>>> ListHealthHistoryAsync(string session, ListBanSafeHistoryParameters? parameters = null, RequestOptions? options = null) => Get<DataEnvelope<BanSafeHealthHistory>>("/platform/bansafe/health/" + E(session) + "/history", options, parameters);
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<BanSafeSignalDefinition>>>> ListSignalsAsync(RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<BanSafeSignalDefinition>>>("/platform/bansafe/signals", options);
    public Task<ApiResponse<DataEnvelope<BanSafeTelemetryDetail>>> GetTelemetryAsync(string session, RequestOptions? options = null) => Get<DataEnvelope<BanSafeTelemetryDetail>>("/platform/bansafe/telemetry/" + E(session), options);
    public Task<CursorPage<BanSafeTelemetrySnapshot>> ListTelemetryHistoryAsync(string session, ListBanSafeTelemetryHistoryParameters? parameters = null, RequestOptions? options = null) => Page<BanSafeTelemetrySnapshot>("telemetry/" + E(session) + "/history", parameters, options);
    public Task<CursorPage<BanSafeCollectionSession>> ListCollectionAsync(ListBanSafeHealthParameters? parameters = null, RequestOptions? options = null) => Page<BanSafeCollectionSession>("collection", parameters, options);
    public Task<CursorPage<BanSafeHealthAction>> ListHealthActionsAsync(ListBanSafeHealthActionsParameters? parameters = null, RequestOptions? options = null) => Page<BanSafeHealthAction>("health-actions", parameters, options);
    public Task<CursorPage<BanSafeFinding>> ListFindingsAsync(ListBanSafeFindingsParameters? parameters = null, RequestOptions? options = null) => Page<BanSafeFinding>("findings", parameters, options);
    public Task<CursorPage<BanSafeEnforcementSummary>> ListEnforcementAsync(ListBanSafeEnforcementParameters? parameters = null, RequestOptions? options = null) => Page<BanSafeEnforcementSummary>("enforcement", parameters, options);
    public Task<CursorPage<BanSafeIncident>> ListIncidentsAsync(ListBanSafeIncidentsParameters? parameters = null, RequestOptions? options = null) => Page<BanSafeIncident>("incidents", parameters, options);
    public Task<ApiResponse<DataEnvelope<BanSafeIncidentReceipt>>> CreateIncidentAsync(ReportBanSafeIncidentRequest body, RequestOptions options) => Post<DataEnvelope<BanSafeIncidentReceipt>>("/platform/bansafe/incidents", body, options);
    public Task<ApiResponse<DataEnvelope<BanSafeIncident>>> RetractIncidentAsync(string id, RequestOptions? options = null) => Post<DataEnvelope<BanSafeIncident>>("/platform/bansafe/incidents/" + E(id) + "/retract", null, options);
    public Task<CursorPage<BanSafeClaim>> ListClaimsAsync(ListBanSafeClaimsParameters? parameters = null, RequestOptions? options = null) => Page<BanSafeClaim>("claims", parameters, options);
    public Task<ApiResponse<DataEnvelope<BanSafeClaim>>> GetClaimAsync(string id, RequestOptions? options = null) => Get<DataEnvelope<BanSafeClaim>>("/platform/bansafe/claims/" + E(id), options);
    private Task<CursorPage<T>> Page<T>(string suffix, object? parameters, RequestOptions? options) => CursorPage<T>.LoadAsync(Http, "/platform/bansafe/" + suffix, Query(parameters), options ?? new());
}
